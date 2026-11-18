import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as Email from "@/server/email";
import { getSharedWithMe } from "@/server/services/drive";
import { getFileUrl } from "@/server/services/files";
import {
  getLinkFileUrl,
  getLinkFolder,
  getLinkRoot,
  getLinkStatus,
} from "@/server/services/public-links";
import {
  createLink,
  getShareInfo,
  leaveShares,
  removeShare,
  revokeLink,
  setShareRole,
  shareEmail,
  shareWithPeople,
} from "@/server/services/sharing";
import { completeUpload, startUpload } from "@/server/services/uploads";

import { anonClient, newUser, testEmail, type Client } from "../support/local-stack";

// Sharing against the local stack, as real people (their own sessions, so row-level security and
// the database functions decide) and as a signed-out visitor for public links. Emails go to the
// log (no Resend key locally); only "who is signed in" is swapped in.

let actingAs: { client: Client; id: string; email: string };
vi.mock("@/server/auth/session", () => ({
  requireUser: () => Promise.resolve({ id: actingAs.id, email: actingAs.email }),
  requireApiUser: () => Promise.resolve({ id: actingAs.id, email: actingAs.email }),
}));
vi.mock("@/server/db/server", () => ({ createClient: () => Promise.resolve(actingAs.client) }));
// Real emails (logged locally), except to addresses meant to show a provider refusing one.
vi.mock("@/server/email", async (original) => {
  const real = await original<typeof Email>();
  return {
    ...real,
    sendEmail: (email: { to: string }) =>
      email.to.startsWith("bounce-")
        ? Promise.reject(new Error("refused"))
        : real.sendEmail(email as never),
  };
});

type User = Awaited<ReturnType<typeof newUser>>;
const as = (user: User) => {
  actingAs = user;
};
const asVisitor = () => {
  actingAs = { client: anonClient(), id: "", email: "" };
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

async function upload(name: string, parentId: string | null, content = "hello") {
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

const ORIGIN = "http://localhost:3000";

describe("sharing with people", () => {
  let owner: User;
  let editor: User;
  let viewer: User;
  let stranger: User;
  let projects: string;
  let designs: string;
  let brief: string;

  beforeAll(async () => {
    [owner, editor, viewer, stranger] = await Promise.all([
      newUser("share-owner"),
      newUser("share-editor"),
      newUser("share-viewer"),
      newUser("share-stranger"),
    ]);
    as(owner);
    projects = await folder("Projects");
    designs = await folder("Designs", projects);
    brief = await upload("brief.txt", designs, "the brief");
  });

  it("shares with accounts and invites in one go, and says who was new", async () => {
    as(owner);
    const invited = testEmail("share-invitee");
    const result = await shareWithPeople(projects, [editor.email, invited], "editor", ORIGIN);
    expect(result).toEqual({ shared: [editor.email, invited] });
    await shareWithPeople(designs, [viewer.email], "viewer", ORIGIN);

    const info = await getShareInfo(projects);
    expect(info?.canManage).toBe(true);
    expect(info?.people.map((entry) => [entry.kind, entry.role])).toEqual([
      ["owner", "owner"],
      ["person", "editor"],
      ["invite", "editor"],
    ]);
  });

  it("shows where access comes from on things inside a shared folder", async () => {
    as(owner);
    const info = await getShareInfo(brief);
    const byKey = new Map(info?.people.map((entry) => [entry.key, entry]));
    expect(byKey.get(editor.id)).toMatchObject({
      role: "editor",
      direct: false,
      from: { id: projects, name: "Projects" },
    });
    expect(byKey.get(viewer.id)).toMatchObject({
      role: "viewer",
      direct: false,
      from: { id: designs, name: "Designs" },
    });
  });

  it("lets each role see who has access, but only the owner manage it", async () => {
    for (const person of [editor, viewer]) {
      as(person);
      const info = await getShareInfo(brief);
      expect(info?.canManage).toBe(false);
      expect(info?.people[0]?.person.email).toBe(owner.email);
    }
    as(stranger);
    expect(await getShareInfo(brief)).toBeNull();
  });

  it("refuses sharing by anyone but the owner", async () => {
    as(editor);
    const { shared, problem } = await shareWithPeople(projects, [stranger.email], "viewer", ORIGIN);
    expect(shared).toEqual([]);
    expect(problem).toMatchObject({ code: "42501" });
    as(stranger);
    expect(
      (await shareWithPeople(projects, [stranger.email], "editor", ORIGIN)).problem,
    ).toMatchObject({
      code: "P0002",
    });
  });

  it("lists what was shared directly in Shared with me", async () => {
    as(editor);
    expect((await getSharedWithMe()).map((item) => item.name)).toEqual(["Projects"]);
    as(viewer);
    const [shared] = await getSharedWithMe();
    expect(shared).toMatchObject({ name: "Designs", owner: { id: owner.id } });
    expect(shared?.sharedAt).toBeTruthy();
    as(stranger);
    expect(await getSharedWithMe()).toEqual([]);
  });

  it("changes roles and removes people (owner only)", async () => {
    as(editor);
    await expect(setShareRole(designs, { userId: viewer.id }, "editor")).rejects.toThrow(
      "doesn't have access",
    );
    as(owner);
    await setShareRole(designs, { userId: viewer.id }, "editor");
    as(viewer);
    expect(
      (await getShareInfo(designs))?.people.find((entry) => entry.key === viewer.id)?.role,
    ).toBe("editor");
    as(owner);
    await removeShare(designs, { userId: viewer.id });
    as(viewer);
    expect(await getShareInfo(designs)).toBeNull();
    await expect(getFileUrl(brief, "inline")).rejects.toThrow("File not found");
  });

  it("lets people leave what was shared with them", async () => {
    as(owner);
    await shareWithPeople(brief, [stranger.email], "viewer", ORIGIN);
    as(stranger);
    expect((await getFileUrl(brief, "inline")).url).toContain("brief.txt");
    expect(await leaveShares([brief, projects])).toEqual([brief]);
    expect(await getSharedWithMe()).toEqual([]);
    await expect(leaveShares([brief])).rejects.toThrow("isn't shared with you");
  });

  it("keeps the strongest role, and the share on the item itself on a tie", async () => {
    as(owner);
    // Editor already edits Projects (above brief.txt): a viewer share on the file itself is weaker.
    await shareWithPeople(brief, [editor.email], "viewer", ORIGIN);
    let entry = (await getShareInfo(brief))?.people.find((person) => person.key === editor.id);
    // The folder's role counts, so the weaker share here isn't offered for change here.
    expect(entry).toMatchObject({ role: "editor", direct: false, from: { name: "Projects" } });
    // The same role on the item itself counts as given here, so it can change here.
    await setShareRole(brief, { userId: editor.id }, "editor");
    entry = (await getShareInfo(brief))?.people.find((person) => person.key === editor.id);
    expect(entry).toMatchObject({ role: "editor", direct: true, from: null });
    await removeShare(brief, { userId: editor.id });
  });

  it("lists the top folder's owner on a file someone else put in their folder", async () => {
    as(editor);
    const notes = await upload("notes.txt", projects, "editor's notes");
    const info = await getShareInfo(notes);
    expect(info?.canManage).toBe(true);
    // The uploader owns it (listed once); the folder's owner can edit it, so they're listed too.
    expect(info?.people.map((entry) => [entry.key, entry.role, entry.from?.name ?? null])).toEqual([
      [editor.id, "owner", null],
      [owner.id, "editor", "Projects"],
      [info?.people[2]?.key, "editor", "Projects"],
    ]);
    expect(info?.people[2]?.kind).toBe("invite");
  });

  it("changes and removes invites by email", async () => {
    as(owner);
    const invited = testEmail("share-later");
    await shareWithPeople(designs, [invited], "viewer", ORIGIN);
    await setShareRole(designs, { email: invited }, "editor");
    expect((await getShareInfo(designs))?.people.find((entry) => entry.key === invited)?.role).toBe(
      "editor",
    );
    await removeShare(designs, { email: invited });
    expect((await getShareInfo(designs))?.people.some((entry) => entry.key === invited)).toBe(
      false,
    );
    await expect(removeShare(designs, { email: invited })).rejects.toThrow("doesn't have access");
  });

  it("stops at the first refusal, and a failed email doesn't undo a share", async () => {
    as(owner);
    const bounce = testEmail("bounce");
    const { shared, problem } = await shareWithPeople(
      designs,
      [bounce, owner.email, testEmail("never")],
      "viewer",
      ORIGIN,
    );
    expect(shared).toEqual([bounce]);
    expect(problem).toMatchObject({ code: "LK422" });
    expect((await getShareInfo(designs))?.people.some((entry) => entry.key === bounce)).toBe(true);
  });

  it("writes an email that names the sharer and the item, safely", () => {
    const email = shareEmail({
      to: "a@test.dev",
      sharer: "Mallory <script>",
      item: { name: "Q3 & <plans>", kind: "folder" },
      role: "editor",
      origin: ORIGIN,
    });
    expect(email.subject).toBe("Mallory <script> shared “Q3 & <plans>” with you");
    expect(email.html).toContain("Mallory &lt;script&gt;");
    expect(email.html).toContain("Q3 &amp; &lt;plans&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain(`${ORIGIN}/drive/shared`);
    expect(email.text).toContain("view and edit");
  });
});

describe("public links", () => {
  let owner: User;
  let editor: User;
  let photos: string;
  let inner: string;
  let photo: string;
  let elsewhere: string;
  let token: string;

  beforeAll(async () => {
    [owner, editor] = await Promise.all([newUser("link-owner"), newUser("link-editor")]);
    as(owner);
    photos = await folder("Photos");
    inner = await folder("2026", photos);
    photo = await upload("beach.txt", inner, "sand");
    elsewhere = await upload("private.txt", null, "secret");
    await shareWithPeople(photos, [editor.email], "editor", ORIGIN);
    ({ token } = await createLink(photos, 7));
  });

  it("opens for a signed-out visitor, inside the linked folder only", async () => {
    asVisitor();
    expect(await getLinkStatus(token)).toMatchObject({ status: "ok" });
    expect(await getLinkRoot(token)).toMatchObject({ id: photos, name: "Photos", kind: "folder" });
    const view = await getLinkFolder(token, inner);
    expect(view?.path.map((crumb) => crumb.name)).toEqual(["Photos", "2026"]);
    expect(view?.items.map((item) => item.name)).toEqual(["beach.txt"]);
    // The owner's name never reaches the visitor.
    expect(view?.items[0]?.owner).toEqual({ id: "", name: null, email: null });

    const { url } = await getLinkFileUrl(token, photo, "attachment");
    expect(await (await fetch(url)).text()).toBe("sand");
    await expect(getLinkFileUrl(token, elsewhere, "inline")).rejects.toThrow("File not found");
    await expect(getLinkFileUrl(token, "not-an-id", "inline")).rejects.toThrow("File not found");
    expect(await getLinkFolder(token, photo)).toBeNull();
    expect(await getLinkRoot("short")).toBeNull();
    expect(await getLinkFolder("short", inner)).toBeNull();
    expect(await getLinkFolder(token, crypto.randomUUID())).toBeNull();
  });

  it("pauses a link opened too often, for everyone", async () => {
    as(owner);
    const { token: busy } = await createLink(inner, null);
    // Use up the link's 600 opens for this 10-minute window, as a crowd of visitors would.
    const visitor = anonClient();
    for (let batch = 0; batch < 12; batch += 1) {
      const results = await Promise.all(
        Array.from({ length: 50 }, () => visitor.rpc("resolve_share_link", { p_token: busy })),
      );
      expect(results.every((result) => result.error === null)).toBe(true);
    }
    asVisitor();
    const paused = { code: "LK429" };
    await expect(getLinkRoot(busy)).rejects.toMatchObject(paused);
    await expect(getLinkFolder(busy, inner)).rejects.toMatchObject(paused);
    await expect(getLinkFileUrl(busy, photo, "inline")).rejects.toMatchObject(paused);
    // Another link to the same files has its own allowance.
    expect(await getLinkRoot(token)).toMatchObject({ id: photos });
  });

  it("is made and turned off only by the owner", async () => {
    as(editor);
    await expect(createLink(photos, null)).rejects.toMatchObject({ code: "42501" });
    await expect(revokeLink(photos)).rejects.toThrow("no link to turn off");
    as(owner);
    expect((await getShareInfo(photos))?.link?.expiresAt).toBeTruthy();
  });

  it("stops the old link when a new one is made, and both when it's turned off", async () => {
    as(owner);
    const { token: next } = await createLink(photos, null);
    asVisitor();
    expect((await getLinkStatus(token)).status).toBe("revoked");
    expect(await getLinkRoot(token)).toBeNull();
    expect(await getLinkRoot(next)).toMatchObject({ id: photos });

    as(owner);
    await revokeLink(photos);
    asVisitor();
    expect((await getLinkStatus(next)).status).toBe("revoked");
    await expect(getLinkFileUrl(next, photo, "inline")).rejects.toThrow("File not found");
  });

  it("says a link to something in the trash is unavailable, and ignores bad tokens", async () => {
    as(owner);
    const { token: fileToken } = await createLink(elsewhere, 1);
    const { error } = await owner.client.rpc("trash_item", { p_item_id: elsewhere });
    expect(error).toBeNull();
    asVisitor();
    expect((await getLinkStatus(fileToken)).status).toBe("unavailable");
    expect((await getLinkStatus("not-a-token")).status).toBe("missing");
    expect((await getLinkStatus("A".repeat(43))).status).toBe("missing");
  });
});
