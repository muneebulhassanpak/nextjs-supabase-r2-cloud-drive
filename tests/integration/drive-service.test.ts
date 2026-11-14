import { beforeAll, describe, expect, it, vi } from "vitest";

import { getFolder, getMyDriveRoot } from "@/server/services/drive";

import { newUser, type Client } from "../support/local-stack";

// The folder service as real people see it: their own Supabase session, so row-level security
// decides. Only "who is signed in" is swapped in; every query goes to the local stack.

let actingAs: { client: Client; id: string; email: string };
vi.mock("@/server/auth/session", () => ({
  requireUser: () => Promise.resolve({ id: actingAs.id, email: actingAs.email }),
}));
vi.mock("@/server/db/server", () => ({ createClient: () => Promise.resolve(actingAs.client) }));

type User = Awaited<ReturnType<typeof newUser>>;

async function folder(user: User, name: string, parentId: string | null = null) {
  const { data, error } = await user.client
    .from("items")
    .insert({ kind: "folder", name, parent_id: parentId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("browsing folders", () => {
  let owner: User, editor: User, viewer: User, stranger: User;
  let projects: string, designs: string, archive: string, old: string, editorBox: string;

  beforeAll(async () => {
    [owner, editor, viewer, stranger] = await Promise.all([
      newUser("owner"),
      newUser("editor"),
      newUser("viewer"),
      newUser("stranger"),
    ]);
    projects = await folder(owner, "Projects");
    designs = await folder(owner, "Designs", projects);
    archive = await folder(owner, "Archive", designs);
    old = await folder(owner, "Old");
    await owner.client.rpc("trash_item", { p_item_id: old });
    for (const [user, role] of [
      [editor, "editor"],
      [viewer, "viewer"],
    ] as const) {
      const target = role === "editor" ? projects : designs;
      const { error } = await owner.client.rpc("share_item", {
        p_item_id: target,
        p_email: user.email,
        p_role: role,
      });
      if (error) throw error;
    }
    editorBox = await folder(editor, "Editor box", projects);
  });

  it("lists only your own top-level items at the top of My Drive, not the trash", async () => {
    actingAs = owner;
    const root = await getMyDriveRoot();
    expect(root.items.map((i) => i.name)).toEqual(["Projects"]);
    actingAs = editor;
    expect((await getMyDriveRoot()).items).toEqual([]);
  });

  it("gives the owner the full path", async () => {
    actingAs = owner;
    const view = await getFolder(archive);
    expect(view?.crumbs.map((c) => c.name)).toEqual(["Projects", "Designs"]);
    expect(view?.sharedRoot).toBe(false);
    expect(view?.folder?.role).toBe("owner");
  });

  it("stops the path at the folder shared with you, and starts it at Shared with me", async () => {
    actingAs = viewer;
    const view = await getFolder(archive);
    expect(view?.crumbs.map((c) => c.name)).toEqual(["Designs"]);
    expect(view?.sharedRoot).toBe(true);
    expect(view?.folder?.role).toBe("viewer");
  });

  it("treats a folder you own inside someone else's tree as shared", async () => {
    actingAs = editor;
    const view = await getFolder(editorBox);
    expect(view?.folder?.role).toBe("owner");
    expect(view?.sharedRoot).toBe(true);
    expect((await getFolder(projects))?.items.map((i) => i.name)).toEqual([
      "Designs",
      "Editor box",
    ]);
  });

  it("shows owners by name to the people they share with", async () => {
    actingAs = editor;
    const items = (await getFolder(projects))?.items ?? [];
    expect(items.find((i) => i.name === "Designs")?.owner.id).toBe(owner.id);
    expect(items.find((i) => i.name === "Editor box")?.owner.id).toBe(editor.id);
  });

  it("answers the same for hidden, trashed, missing and non-folder ids", async () => {
    actingAs = stranger;
    expect(await getFolder(projects)).toBeNull();
    actingAs = viewer;
    expect(await getFolder(projects)).toBeNull();
    actingAs = owner;
    expect(await getFolder(old)).toBeNull();
    expect(await getFolder("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
