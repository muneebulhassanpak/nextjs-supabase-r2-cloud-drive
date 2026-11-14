import { beforeAll, describe, expect, it, vi } from "vitest";

import { purgeTrash } from "@/server/jobs/purge-trash";
import {
  getFolderChoices,
  getRecent,
  getStarred,
  getTrash,
  searchFolders,
} from "@/server/services/drive";
import { recordRecent } from "@/server/services/files";
import { deleteEntryForever, emptyTrash } from "@/server/services/trash";
import { completeUpload, startUpload } from "@/server/services/uploads";
import { headObject } from "@/server/storage/objects";

import { adminClient, newUser, type Client } from "../support/local-stack";

// Starred, Recent, Trash and the "Move to" picker against the local stack, as real people (their
// own sessions, so row-level security decides), with real bytes in the local S3 server for
// deleting forever and the 30-day purge. Only "who is signed in" is swapped in.

let actingAs: { client: Client; id: string; email: string };
vi.mock("@/server/auth/session", () => ({
  requireUser: () => Promise.resolve({ id: actingAs.id, email: actingAs.email }),
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

async function folder(name: string, parentId: string | null = null) {
  const { data, error } = await actingAs.client
    .from("items")
    .insert({ kind: "folder", name, parent_id: parentId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Uploads a small text file all the way through, as the current user; returns its id. */
async function upload(name: string, parentId: string | null = null, content = "hello") {
  const started = await startUpload({
    parentId,
    name,
    size: Buffer.byteLength(content),
    type: "text/plain",
  });
  const response = await fetch(started.upload.url, {
    method: "PUT",
    body: content,
    headers: { "content-type": started.upload.headers["content-type"] },
  });
  expect(response.status).toBe(200);
  await completeUpload(started.id);
  return started.id;
}

async function rpc(name: "trash_item" | "restore_item", itemId: string) {
  const { error } = await actingAs.client.rpc(name, { p_item_id: itemId });
  if (error) throw error;
}

async function objectKey(itemId: string) {
  const { data } = await adminClient().from("items").select("object_key").eq("id", itemId).single();
  return data?.object_key ?? "";
}

async function storageUsed(user: User) {
  const { data } = await adminClient()
    .from("profiles")
    .select("storage_used")
    .eq("id", user.id)
    .single();
  return data?.storage_used;
}

const names = (items: { name: string }[]) => items.map((item) => item.name);

describe("starred", () => {
  let owner: User, viewer: User, stranger: User;
  let projects: string, plan: string;

  beforeAll(async () => {
    [owner, viewer, stranger] = await Promise.all([
      newUser("owner"),
      newUser("viewer"),
      newUser("stranger"),
    ]);
    as(owner);
    projects = await folder("Projects");
    plan = await upload("plan.txt", projects);
    await upload("notes.txt", projects);
    const { error } = await owner.client.rpc("share_item", {
      p_item_id: projects,
      p_email: viewer.email,
      p_role: "viewer",
    });
    if (error) throw error;
  });

  it("lists what you starred, folders first, and marks it everywhere", async () => {
    as(owner);
    const { error } = await owner.client
      .from("stars")
      .insert([{ item_id: plan }, { item_id: projects }]);
    expect(error).toBeNull();
    expect(names(await getStarred())).toEqual(["Projects", "plan.txt"]);
    expect((await getStarred()).every((item) => item.starred)).toBe(true);
  });

  it("keeps stars personal: a viewer stars for themselves only", async () => {
    as(viewer);
    expect(await getStarred()).toEqual([]);
    const { error } = await viewer.client.from("stars").insert({ item_id: plan });
    expect(error).toBeNull();
    expect(names(await getStarred())).toEqual(["plan.txt"]);
    as(owner);
    expect(names(await getStarred())).toEqual(["Projects", "plan.txt"]);
  });

  it("can't star what you can't see", async () => {
    as(stranger);
    const { error } = await stranger.client.from("stars").insert({ item_id: plan });
    expect(error?.code).toBe("42501");
  });

  it("hides starred items while they're in the trash", async () => {
    as(owner);
    await rpc("trash_item", plan);
    expect(names(await getStarred())).toEqual(["Projects"]);
    await rpc("restore_item", plan);
    expect(names(await getStarred())).toEqual(["Projects", "plan.txt"]);
  });
});

describe("recent", () => {
  it("lists opened files newest first, without what's in the trash", async () => {
    const user = await newUser("recent");
    as(user);
    const first = await upload("first.txt");
    const second = await upload("second.txt");
    await recordRecent(first);
    await recordRecent(second);
    await recordRecent(first);
    const recent = await getRecent();
    expect(names(recent)).toEqual(["first.txt", "second.txt"]);
    expect(recent[0]?.openedAt).toBeTruthy();
    await rpc("trash_item", first);
    expect(names(await getRecent())).toEqual(["second.txt"]);
  });
});

describe("trash", () => {
  let owner: User, editor: User;
  let shared: string;

  beforeAll(async () => {
    [owner, editor] = await Promise.all([newUser("owner"), newUser("editor")]);
    as(owner);
    shared = await folder("Shared");
    const { error } = await owner.client.rpc("share_item", {
      p_item_id: shared,
      p_email: editor.email,
      p_role: "editor",
    });
    if (error) throw error;
  });

  it("lists one entry per thing trashed, for its owner and for whoever trashed it", async () => {
    as(owner);
    const box = await folder("Box", shared);
    await upload("inside.txt", box);
    const mine = await upload("mine.txt");
    as(editor);
    await rpc("trash_item", box);
    expect(names(await getTrash())).toEqual(["Box"]);
    as(owner);
    await rpc("trash_item", mine);
    const trash = await getTrash();
    expect(names(trash)).toEqual(["mine.txt", "Box"]);
    expect(trash.every((item) => item.trashedAt)).toBe(true);
  });

  it("deletes forever: the rows, the bytes, and the space they took", async () => {
    as(owner);
    const file = await upload("goodbye.txt", null, "x".repeat(2048));
    const key = await objectKey(file);
    const before = await storageUsed(owner);
    await rpc("trash_item", file);
    expect(await deleteEntryForever(file)).toEqual({ data: [key], error: null });
    expect(await headObject(key)).toBeNull();
    expect(await storageUsed(owner)).toBe((before ?? 0) - 2048);
    expect(names(await getTrash())).not.toContain("goodbye.txt");
  });

  it("refuses to delete forever for anyone but the owner, and keeps the bytes", async () => {
    as(owner);
    const file = await upload("theirs.txt", shared);
    as(editor);
    await rpc("trash_item", file);
    const result = await deleteEntryForever(file);
    expect(result.data).toBeNull();
    expect((result.error as { code?: string }).code).toBe("42501");
    expect(await headObject(await objectKey(file))).not.toBeNull();
  });

  it("empties the trash, bytes included", async () => {
    const user = await newUser("empty");
    as(user);
    const file = await upload("old.txt");
    const key = await objectKey(file);
    await rpc("trash_item", file);
    expect(await emptyTrash()).toEqual({ deletedFiles: 1 });
    expect(await headObject(key)).toBeNull();
    expect(await getTrash()).toEqual([]);
    expect(await storageUsed(user)).toBe(0);
  });
});

describe("the 30-day purge", () => {
  it("deletes what has been in the trash too long, with its bytes, and nothing newer", async () => {
    const user = await newUser("purge");
    as(user);
    const old = await upload("old.txt");
    const recent = await upload("recent.txt");
    const [oldKey, recentKey] = [await objectKey(old), await objectKey(recent)];
    await rpc("trash_item", old);
    await rpc("trash_item", recent);
    const { error } = await adminClient()
      .from("items")
      .update({ trashed_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("id", old);
    expect(error).toBeNull();

    const report = await purgeTrash();
    expect(report.deletedFiles).toBeGreaterThanOrEqual(1);
    expect(report.failedDeletes).toBe(0);
    expect(await headObject(oldKey)).toBeNull();
    expect(await headObject(recentKey)).not.toBeNull();
    expect(names(await getTrash())).toEqual(["recent.txt"]);
    expect(await storageUsed(user)).toBe(Buffer.byteLength("hello"));
  });
});

describe("the move picker", () => {
  it("steps through folders you can move into, and finds them by name", async () => {
    const [owner, viewer] = await Promise.all([newUser("owner"), newUser("viewer")]);
    as(owner);
    const work = await folder("Work");
    const clients = await folder("Clients", work);
    await upload("not-a-folder.txt", work);
    const { error } = await owner.client.rpc("share_item", {
      p_item_id: work,
      p_email: viewer.email,
      p_role: "viewer",
    });
    if (error) throw error;

    const top = await getFolderChoices(null);
    expect(top).toMatchObject({ folder: null, canEdit: true });
    expect(names(top?.folders ?? [])).toContain("Work");
    expect(await getFolderChoices(work)).toEqual({
      folder: { id: work, name: "Work" },
      crumbs: [],
      canEdit: true,
      folders: [{ id: clients, name: "Clients" }],
    });
    expect(await getFolderChoices(clients)).toMatchObject({
      crumbs: [{ id: work, name: "Work" }],
    });
    expect(names(await searchFolders("lient"))).toEqual(["Clients"]);
    // Only folders count, however many files match; % and _ are matched as written.
    await upload("client-notes.txt", work);
    expect(names(await searchFolders("lient"))).toEqual(["Clients"]);
    expect(await searchFolders("%")).toEqual([]);
    expect(await searchFolders("C_ients")).toEqual([]);

    as(viewer);
    expect(await getFolderChoices(work)).toMatchObject({ canEdit: false });
    as(await newUser("stranger"));
    expect(await getFolderChoices(work)).toBeNull();
    expect(await searchFolders("Clients")).toEqual([]);
  });
});
