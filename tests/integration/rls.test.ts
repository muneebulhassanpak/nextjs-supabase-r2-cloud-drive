import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { env } from "@/env";
import type { Database } from "@/server/db/database.types";

// Attacks the local stack the way anyone with the publishable key could: straight at the Data API,
// with no app in between. The pgTAP suite covers each rule; this proves they hold over HTTP.

type Client = SupabaseClient<Database>;

function anonClient(): Client {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Signs up a fresh user (local email confirmation is off) and returns a client acting as them. */
async function newUser(): Promise<{ client: Client; id: string }> {
  const client = anonClient();
  const { data, error } = await client.auth.signUp({
    email: `rls-${randomUUID()}@test.dev`,
    password: randomUUID(),
  });
  if (error || !data.user || !data.session) throw error ?? new Error("sign-up returned no session");
  return { client, id: data.user.id };
}

describe("row-level security over the Data API", () => {
  let alice: Awaited<ReturnType<typeof newUser>>;
  let mallory: Awaited<ReturnType<typeof newUser>>;
  let folderId: string;

  beforeAll(async () => {
    [alice, mallory] = await Promise.all([newUser(), newUser()]);
    const { data, error } = await alice.client
      .from("items")
      .insert({ kind: "folder", name: "Taxes" })
      .select("id")
      .single();
    if (error) throw error;
    folderId = data.id;
  });

  it("hides one user's items from another, even by id", async () => {
    const { data, error } = await mallory.client.from("items").select("id").eq("id", folderId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("does not let a user write into someone else's folder, or learn that it exists", async () => {
    const hidden = await mallory.client
      .from("items")
      .insert({ kind: "folder", name: "planted", parent_id: folderId });
    const missing = await mallory.client
      .from("items")
      .insert({ kind: "folder", name: "planted", parent_id: randomUUID() });
    expect(hidden.error?.code).toBe("P0002");
    expect(hidden.error?.message).toBe(missing.error?.message);
  });

  it("does not let a user rename someone else's item", async () => {
    const { data } = await mallory.client
      .from("items")
      .update({ name: "pwned" })
      .eq("id", folderId)
      .select("id");
    expect(data).toEqual([]);
  });

  it("refuses protected columns, like the quota", async () => {
    const { error } = await alice.client
      .from("profiles")
      .update({ storage_quota: 10_000_000_000 })
      .eq("id", alice.id);
    expect(error?.code).toBe("42501");
  });

  it("gives visitors without an account nothing", async () => {
    const { error } = await anonClient().from("items").select("id");
    expect(error?.code).toBe("42501");
  });

  it("reports a hidden item as not found, the same as a missing one", async () => {
    const hidden = await mallory.client.rpc("trash_item", { p_item_id: folderId });
    const missing = await mallory.client.rpc("trash_item", { p_item_id: randomUUID() });
    expect(hidden.error?.code).toBe("P0002");
    expect(missing.error?.code).toBe("P0002");
    expect(hidden.error?.message).toBe(missing.error?.message);
  });
});

describe("storage quota under parallel uploads", () => {
  it("lets exactly as many uploads through as fit, however many race", async () => {
    const { client, id } = await newUser();
    const { data: folder, error } = await client
      .from("items")
      .insert({ kind: "folder", name: "Uploads" })
      .select("id")
      .single();
    if (error) throw error;
    const twentyMb = 20 * 1024 * 1024;

    // 100 MB quota, 8 uploads of 20 MB started at the same moment: exactly 5 can fit.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        client.rpc("start_upload", {
          p_parent_id: folder.id,
          p_name: `part-${i}.bin`,
          p_size: twentyMb,
          p_mime_type: "application/octet-stream",
        }),
      ),
    );

    expect(results.filter((r) => !r.error)).toHaveLength(5);
    expect(results.filter((r) => r.error).map((r) => r.error?.code)).toEqual([
      "LK413",
      "LK413",
      "LK413",
    ]);

    const { data: profile } = await client
      .from("profiles")
      .select("storage_used")
      .eq("id", id)
      .single();
    expect(profile?.storage_used).toBe(5 * twentyMb);
  });
});
