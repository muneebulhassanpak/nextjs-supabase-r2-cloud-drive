import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "@/env";
import { DEMO_EMAIL, DEMO_FRIEND_EMAIL } from "@/lib/demo";
import { resetDemo } from "@/server/jobs/reset-demo";
import { storage } from "@/server/storage/client";

import { adminClient, anonClient, newUser, type Client } from "../support/local-stack";

// The demo reset against the local stack, and that the account it makes can't be taken over
// (T13 of the security model), as a visitor calling the APIs directly.

vi.mock("@/server/db/admin", async () => ({
  createAdminClient: (await import("../support/local-stack")).adminClient,
}));

const exists = (key: string) =>
  storage.send(new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key })).then(
    () => true,
    () => false,
  );

describe("the demo", () => {
  let visitor: Client;
  let id: string;

  const names = async () => {
    const { data, error } = await visitor
      .from("items")
      .select("name")
      .eq("owner_id", id)
      .is("parent_id", null)
      .is("trashed_at", null)
      .order("name");
    if (error) throw error;
    return data.map((item) => item.name);
  };

  beforeAll(async () => {
    await resetDemo();
    visitor = anonClient();
    const { data, error } = await visitor.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: env.DEMO_PASSWORD,
    });
    if (error) throw error;
    id = data.user.id;
  });

  it("has files that are really there, and no more space used than they take", async () => {
    expect(await names()).toEqual([
      "Finance",
      "Media",
      "Photos",
      "Projects",
      "Welcome to Lockerly.md",
    ]);
    const { data: files } = await visitor
      .from("items")
      .select("name, size, object_key")
      .eq("kind", "file")
      .eq("owner_id", id);
    expect(files?.length).toBeGreaterThan(15);
    for (const file of files ?? []) expect(await exists(file.object_key ?? "")).toBe(true);
    const { data: profile } = await visitor
      .from("profiles")
      .select("storage_used, is_demo")
      .eq("id", id)
      .single();
    expect(profile).toEqual({
      storage_used: (files ?? []).reduce((sum, file) => sum + (file.size ?? 0), 0),
      is_demo: true,
    });
  });

  it("refuses a new password, email or name", async () => {
    const password = await visitor.auth.updateUser({ password: "taken-over-123" });
    expect(password.error).not.toBeNull();
    const email = await visitor.auth.updateUser({ email: "mine@test.dev" });
    expect(email.error).not.toBeNull();
    const data = await visitor.auth.updateUser({ data: { junk: "x".repeat(2000) } });
    expect(data.error).not.toBeNull();
    const reset = await anonClient().auth.resetPasswordForEmail(DEMO_EMAIL);
    expect(reset.error).not.toBeNull();
    const name = await visitor.from("profiles").update({ full_name: "Rude" }).eq("id", id);
    expect(name.error?.code).toBe("LK409");
    // And people can still get in.
    const again = await anonClient().auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: env.DEMO_PASSWORD,
    });
    expect(again.error).toBeNull();
  });

  it("can't be reached by, or reach, people outside it", async () => {
    const other = await newUser("demo-other");
    const { data: theirs } = await other.client
      .from("items")
      .insert({ kind: "folder", name: "Not for the demo" })
      .select("id")
      .single();
    const toDemo = await other.client.rpc("share_item", {
      p_item_id: theirs?.id ?? "",
      p_email: DEMO_EMAIL,
      p_role: "viewer",
    });
    expect(toDemo.error?.code).toBe("LK422");
    const { data: photos } = await visitor
      .from("items")
      .select("id")
      .eq("name", "Photos")
      .eq("owner_id", id)
      .single();
    const share = (email: string) =>
      visitor.rpc("share_item", { p_item_id: photos?.id ?? "", p_email: email, p_role: "viewer" });
    expect((await share(other.email)).error?.code).toBe("LK422");
    expect((await share("nobody@test.dev")).error?.code).toBe("LK422");
    expect((await share(DEMO_FRIEND_EMAIL)).error).toBeNull();
  });

  it("goes back to how it was: visitors' things gone, bytes included, ids unchanged", async () => {
    const { data: before } = await visitor
      .from("items")
      .select("id")
      .eq("name", "Projects")
      .single();
    await visitor.from("items").insert({ kind: "folder", name: "Visitor junk" });
    await visitor.rpc("trash_item", { p_item_id: before?.id ?? "" });
    const junk = `u/${id}/junk-${String(Date.now())}`;
    await storage.send(
      new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: junk, Body: "junk" }),
    );

    const report = await resetDemo();
    expect(report).toMatchObject({ removedObjects: 1, failedDeletes: 0 });
    expect(await exists(junk)).toBe(false);
    expect(await names()).toEqual([
      "Finance",
      "Media",
      "Photos",
      "Projects",
      "Welcome to Lockerly.md",
    ]);
    const { data: after } = await visitor
      .from("items")
      .select("id")
      .eq("name", "Projects")
      .single();
    expect(after?.id).toBe(before?.id);
    const { data: activity } = await visitor.from("activity").select("action");
    expect(activity?.some(({ action }) => action === "deleted")).toBe(false);
    // It made no second account.
    const { count } = await adminClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_demo", true);
    expect(count).toBe(2);
  });
});
