import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { env } from "@/env";
import { toErrorBody } from "@/server/errors";
import { cleanupStorage } from "@/server/jobs/cleanup-storage";
import {
  getAvatarUrl,
  removeAvatar,
  saveAvatar,
  startAvatarUpload,
} from "@/server/services/avatars";
import { getFileUrl } from "@/server/services/files";
import { cancelUpload, completeUpload, startUpload } from "@/server/services/uploads";
import { storage } from "@/server/storage/client";

import { adminClient, newUser, type Client } from "../support/local-stack";

// Uploads and downloads end to end against the local stack: real sessions (so row-level security
// decides), real signed links, real bytes in the local S3 server. Covers T3–T6 of the security
// model. Only "who is signed in" is swapped in.

let actingAs: { client: Client; id: string; email: string };
vi.mock("@/server/auth/session", () => ({
  requireApiUser: () => Promise.resolve({ id: actingAs.id, email: actingAs.email }),
}));
vi.mock("@/server/db/server", () => ({ createClient: () => Promise.resolve(actingAs.client) }));
vi.mock("@/server/db/admin", async () => ({
  createAdminClient: (await import("../support/local-stack")).adminClient,
}));

type User = Awaited<ReturnType<typeof newUser>>;
const as = (user: User) => {
  actingAs = user;
};

const MB = 1024 * 1024;

async function put(url: string, body: string | Uint8Array<ArrayBuffer>, type: string) {
  const response = await fetch(url, { method: "PUT", body, headers: { "content-type": type } });
  return response.status;
}

/** Uploads a small file all the way through, as the current user. */
async function upload(
  name: string,
  content: string,
  parentId: string | null = null,
  type = "text/plain",
) {
  const started = await startUpload({ parentId, name, size: Buffer.byteLength(content), type });
  expect(await put(started.upload.url, content, started.upload.headers["content-type"])).toBe(200);
  return completeUpload(started.id);
}

async function row(id: string) {
  const { data } = await adminClient()
    .from("items")
    .select("name, status, object_key, size")
    .eq("id", id)
    .maybeSingle();
  return data;
}

async function storageUsed(user: User) {
  const { data } = await adminClient()
    .from("profiles")
    .select("storage_used")
    .eq("id", user.id)
    .single();
  return data?.storage_used;
}

async function objectExists(key: string) {
  try {
    await storage.send(new HeadObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function putObject(key: string, body: string) {
  await storage.send(new PutObjectCommand({ Bucket: env.STORAGE_BUCKET, Key: key, Body: body }));
}

/** How the API would answer a failed call: the HTTP status and error body. */
const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return { status, ...body };
  }
  throw new Error("expected the call to fail");
};

describe("uploading", () => {
  let owner: User, viewer: User;
  let shared: string;

  beforeAll(async () => {
    [owner, viewer] = await Promise.all([newUser("uploader"), newUser("upload-viewer")]);
    const { data, error } = await owner.client
      .from("items")
      .insert({ kind: "folder", name: "Shared" })
      .select("id")
      .single();
    if (error) throw error;
    shared = data.id;
    await owner.client.rpc("share_item", {
      p_item_id: shared,
      p_email: viewer.email,
      p_role: "viewer",
    });
  });

  it("stores the bytes, shows the file and counts it against the quota", async () => {
    as(owner);
    const before = await storageUsed(owner);
    const file = await upload("hello.txt", "hello world");
    expect(await row(file.id)).toMatchObject({ name: "hello.txt", status: "ready", size: 11 });
    expect(await storageUsed(owner)).toBe((before ?? 0) + 11);
  });

  it("signs the exact size and type: other bytes are refused by storage (T6)", async () => {
    as(owner);
    const started = await startUpload({
      parentId: null,
      name: "exact.txt",
      size: 5,
      type: "text/plain",
    });
    expect(await put(started.upload.url, "hello, more", "text/plain")).toBe(403);
    expect(await put(started.upload.url, "hello", "text/html")).toBe(403);
    expect(await put(started.upload.url, "hello", "text/plain")).toBe(200);
    await completeUpload(started.id);
  });

  it("refuses to finish an upload whose bytes don't match, and undoes it (T6)", async () => {
    as(owner);
    const used = await storageUsed(owner);
    const started = await startUpload({
      parentId: null,
      name: "liar.txt",
      size: 100,
      type: "text/plain",
    });
    const key = (await row(started.id))?.object_key ?? "";
    await putObject(key, "only a few bytes");
    expect(await errorOf(completeUpload(started.id))).toMatchObject({ status: 422 });
    expect(await row(started.id)).toBeNull();
    expect(await objectExists(key)).toBe(false);
    expect(await storageUsed(owner)).toBe(used);
  });

  it("refuses to finish an upload that never arrived", async () => {
    as(owner);
    const started = await startUpload({
      parentId: null,
      name: "ghost.txt",
      size: 10,
      type: "text/plain",
    });
    expect(await errorOf(completeUpload(started.id))).toMatchObject({ status: 409 });
    expect(await row(started.id)).toBeNull();
  });

  it("gives clashing names a number, at the start or at the finish", async () => {
    as(owner);
    await upload("report.pdf", "v1", null, "application/pdf");
    const second = await upload("report.pdf", "v2", null, "application/pdf");
    expect(second.name).toBe("report (1).pdf");

    // Two uploads of the same new name at once: both start, the second is renamed when it lands.
    const [a, b] = await Promise.all([
      startUpload({ parentId: null, name: "same.txt", size: 1, type: "text/plain" }),
      startUpload({ parentId: null, name: "same.txt", size: 1, type: "text/plain" }),
    ]);
    await put(a.upload.url, "a", "text/plain");
    await put(b.upload.url, "b", "text/plain");
    const names = [(await completeUpload(a.id)).name, (await completeUpload(b.id)).name];
    expect(names.sort()).toEqual(["same (1).txt", "same.txt"]);

    // A long name still gets a copy that fits the 255-character limit.
    const long = `${"x".repeat(251)}.txt`;
    await upload(long, "1");
    const copy = await upload(long, "2");
    expect(copy.name).toBe(`${"x".repeat(247)} (1).txt`);
  });

  it("answers a repeated finish with the same name, without a second file", async () => {
    as(owner);
    const started = await startUpload({
      parentId: null,
      name: "twice.txt",
      size: 1,
      type: "text/plain",
    });
    await put(started.upload.url, "1", "text/plain");
    expect(await completeUpload(started.id)).toEqual({ id: started.id, name: "twice.txt" });
    expect(await completeUpload(started.id)).toEqual({ id: started.id, name: "twice.txt" });
  });

  it("won't finish into a folder that went to the trash meanwhile", async () => {
    as(owner);
    const { data: folder } = await owner.client
      .from("items")
      .insert({ kind: "folder", name: "Doomed" })
      .select("id")
      .single();
    const started = await startUpload({
      parentId: folder?.id ?? null,
      name: "late.txt",
      size: 1,
      type: "text/plain",
    });
    await put(started.upload.url, "1", "text/plain");
    await owner.client.rpc("trash_item", { p_item_id: folder?.id ?? "" });
    expect(await errorOf(completeUpload(started.id))).toMatchObject({ status: 404 });
    await cancelUpload(started.id);
  });

  it("cleans up a cancelled upload: no row, no bytes, space given back", async () => {
    as(owner);
    const used = await storageUsed(owner);
    const started = await startUpload({
      parentId: null,
      name: "cancel.txt",
      size: 4,
      type: "text/plain",
    });
    const key = (await row(started.id))?.object_key ?? "";
    await put(started.upload.url, "data", "text/plain");
    await cancelUpload(started.id);
    expect(await row(started.id)).toBeNull();
    expect(await objectExists(key)).toBe(false);
    expect(await storageUsed(owner)).toBe(used);
  });

  it("refuses files over 25 MB and uploads into folders you can only view", async () => {
    as(owner);
    expect(
      await errorOf(startUpload({ parentId: null, name: "big.bin", size: 26 * MB, type: "" })),
    ).toMatchObject({ status: 413 });
    as(viewer);
    expect(
      await errorOf(startUpload({ parentId: shared, name: "x.txt", size: 1, type: "text/plain" })),
    ).toMatchObject({ status: 403 });
  });

  it("can't squeeze past the quota with parallel uploads (T5)", async () => {
    const racer = await newUser("racer");
    as(racer);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        startUpload({ parentId: null, name: `part ${String(i)}.bin`, size: 25 * MB, type: "" }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(await storageUsed(racer)).toBe(100 * MB);
  });
});

describe("downloading (T3)", () => {
  let owner: User, viewer: User, stranger: User;
  let fileId: string, htmlId: string, sharedFileId: string;

  beforeAll(async () => {
    [owner, viewer, stranger] = await Promise.all([
      newUser("dl-owner"),
      newUser("dl-viewer"),
      newUser("dl-stranger"),
    ]);
    as(owner);
    fileId = (await upload("notes café.txt", "private notes")).id;
    htmlId = (await upload("page.html", "<script>alert(1)</script>", null, "text/html")).id;
    const { data } = await owner.client
      .from("items")
      .insert({ kind: "folder", name: "Team" })
      .select("id")
      .single();
    const team = data?.id ?? "";
    sharedFileId = (await upload("plan.txt", "the plan", team)).id;
    await owner.client.rpc("share_item", {
      p_item_id: team,
      p_email: viewer.email,
      p_role: "viewer",
    });
  });

  it("gives the owner a short-lived link that downloads with the file's name", async () => {
    as(owner);
    const { url, expiresIn } = await getFileUrl(fileId, "attachment");
    expect(expiresIn).toBe(60);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("60");
    const response = await fetch(url);
    expect(await response.text()).toBe("private notes");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="notes cafe.txt"; filename*=UTF-8''notes%20caf%C3%A9.txt`,
    );
  });

  it("shows text inline only as plain text, and never renders HTML", async () => {
    as(owner);
    const text = await fetch((await getFileUrl(fileId, "inline")).url);
    expect(text.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(text.headers.get("content-disposition")).toMatch(/^inline;/);

    const html = await fetch((await getFileUrl(htmlId, "inline")).url);
    expect(html.headers.get("content-type")).toBe("application/octet-stream");
    expect(html.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("lets people the folder is shared with download, and nobody else", async () => {
    as(viewer);
    expect(await (await fetch((await getFileUrl(sharedFileId, "attachment")).url)).text()).toBe(
      "the plan",
    );
    expect(await errorOf(getFileUrl(fileId, "attachment"))).toMatchObject({ status: 404 });
    as(stranger);
    expect(await errorOf(getFileUrl(sharedFileId, "attachment"))).toMatchObject({ status: 404 });
  });

  it("has no links for files in the trash or still uploading", async () => {
    as(owner);
    const trashed = await upload("old.txt", "old");
    await owner.client.rpc("trash_item", { p_item_id: trashed.id });
    expect(await errorOf(getFileUrl(trashed.id, "attachment"))).toMatchObject({ status: 404 });
    const pending = await startUpload({
      parentId: null,
      name: "wip.txt",
      size: 1,
      type: "text/plain",
    });
    expect(await errorOf(getFileUrl(pending.id, "attachment"))).toMatchObject({ status: 404 });
  });
});

describe("profile pictures", () => {
  let user: User, other: User;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  beforeAll(async () => {
    [user, other] = await Promise.all([newUser("avatar"), newUser("avatar-other")]);
  });

  async function uploadAvatar() {
    const { key, upload: link } = await startAvatarUpload(png.length, "image/png");
    expect(await put(link.url, png, "image/png")).toBe(200);
    return saveAvatar(key);
  }

  it("accepts small images only", async () => {
    as(user);
    expect(await errorOf(startAvatarUpload(100, "image/svg+xml"))).toMatchObject({ status: 422 });
    expect(await errorOf(startAvatarUpload(3 * MB, "image/png"))).toMatchObject({ status: 422 });
  });

  it("saves a picture, shows it, and deletes the old one when replaced", async () => {
    as(user);
    const first = await uploadAvatar();
    const response = await fetch(await getAvatarUrl(user.id));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);

    const second = await uploadAvatar();
    expect(second.avatarKey).not.toBe(first.avatarKey);
    expect(await objectExists(first.avatarKey)).toBe(false);

    await removeAvatar();
    expect(await objectExists(second.avatarKey)).toBe(false);
    expect(await errorOf(getAvatarUrl(user.id))).toMatchObject({ status: 404 });
  });

  it("won't use someone else's picture or file as yours", async () => {
    as(other);
    const { key } = await startAvatarUpload(png.length, "image/png");
    as(user);
    expect(await errorOf(saveAvatar(key))).toMatchObject({ status: 422 });
    expect(await errorOf(saveAvatar(`u/${user.id}/whatever`))).toMatchObject({ status: 422 });
  });

  it("shows pictures only to people who can see the profile", async () => {
    as(user);
    await uploadAvatar();
    as(other);
    expect(await errorOf(getAvatarUrl(user.id))).toMatchObject({ status: 404 });
  });
});

describe("daily storage cleanup", () => {
  // A negative age means "everything so far", so nothing has to wait a day.
  const everything = { olderThanSeconds: -60 };

  it("removes abandoned uploads and objects nothing points at, and keeps the rest", async () => {
    const user = await newUser("cleanup");
    as(user);
    const kept = await upload("keep.txt", "keep");
    const keptKey = (await row(kept.id))?.object_key ?? "";
    const abandoned = await startUpload({
      parentId: null,
      name: "gone.txt",
      size: 4,
      type: "text/plain",
    });
    const abandonedKey = (await row(abandoned.id))?.object_key ?? "";
    await put(abandoned.upload.url, "gone", "text/plain");
    const orphan = `u/${user.id}/00000000-0000-4000-8000-000000000000`;
    await putObject(orphan, "nobody points here");
    const usedBefore = await storageUsed(user);

    const report = await cleanupStorage({ ...everything, ownerId: user.id });

    // Other tests' unfinished uploads go too (it's one local database), so at least this one.
    expect(report.abandonedUploads).toBeGreaterThanOrEqual(1);
    expect(report).toMatchObject({ orphanedObjects: 1, failedDeletes: 0 });
    expect(await row(abandoned.id)).toBeNull();
    expect(await objectExists(abandonedKey)).toBe(false);
    expect(await objectExists(orphan)).toBe(false);
    expect(await objectExists(keptKey)).toBe(true);
    expect(await storageUsed(user)).toBe((usedBefore ?? 0) - 4);
  });

  it("refuses to delete most of the bucket, which means the settings are wrong", async () => {
    const user = await newUser("cleanup-guard");
    const keys = Array.from({ length: 25 }, (_, i) => `u/${user.id}/orphan-${String(i)}`);
    await Promise.all(keys.map((key) => putObject(key, "x")));
    await expect(cleanupStorage({ ...everything, ownerId: user.id })).rejects.toThrow(
      /Refusing to delete most of the bucket/,
    );
    expect(await objectExists(keys[0] ?? "")).toBe(true);
  });
});
