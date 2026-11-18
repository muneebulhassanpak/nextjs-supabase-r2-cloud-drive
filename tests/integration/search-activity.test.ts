import { beforeAll, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/server/errors";
import { getActivity } from "@/server/services/activity";
import { searchDrive, searchFolders, type SearchFilters } from "@/server/services/drive";
import { shareWithPeople } from "@/server/services/sharing";

import { newUser, type Client } from "../support/local-stack";

// Search and the Activity tab against the local stack, as real people (their own sessions, so
// the database decides what each can see).

let actingAs: { client: Client; id: string; email: string };
vi.mock("@/server/auth/session", () => ({
  requireUser: () => Promise.resolve({ id: actingAs.id, email: actingAs.email }),
}));
vi.mock("@/server/db/server", () => ({ createClient: () => Promise.resolve(actingAs.client) }));

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

async function rename(id: string, name: string) {
  const { error } = await actingAs.client.from("items").update({ name }).eq("id", id);
  if (error) throw error;
}

const search = (query: string, filters: Partial<SearchFilters> = {}) =>
  searchDrive({
    query,
    type: null,
    owner: "any",
    modifiedFrom: null,
    modifiedTo: null,
    ...filters,
  }).then((items) => items.map((item) => item.name));

describe("search and activity", () => {
  let owner: User;
  let friend: User;
  let stranger: User;
  let reports: string;
  let quarterly: string;

  beforeAll(async () => {
    [owner, friend, stranger] = await Promise.all([
      newUser("search-owner"),
      newUser("search-friend"),
      newUser("search-stranger"),
    ]);
    as(owner);
    reports = await folder("Reports 2026");
    quarterly = await folder("Quarterly reports", reports);
    await folder("Old report drafts");
    await shareWithPeople(reports, [friend.email], "viewer", "http://localhost:3000");
    as(friend);
    await folder("My reports");
  });

  it("ranks names starting with the words first, and forgives a typo", async () => {
    as(owner);
    expect(await search("report")).toEqual([
      "Reports 2026",
      "Old report drafts",
      "Quarterly reports",
    ]);
    expect(await search("quartrly")).toEqual(["Quarterly reports"]);
    expect(await search("   ")).toEqual([]);
  });

  it("filters by type, owner and date", async () => {
    as(friend);
    // Starts with the word, then contains it: whose it is doesn't change the order.
    expect(await search("report")).toEqual(["Reports 2026", "My reports", "Quarterly reports"]);
    expect(await search("report", { owner: "me" })).toEqual(["My reports"]);
    expect(await search("report", { owner: "others" })).toEqual([
      "Reports 2026",
      "Quarterly reports",
    ]);
    expect(await search("report", { type: "pdf" })).toEqual([]);
    expect(await search("report", { modifiedTo: "2000-01-01T00:00:00Z" })).toEqual([]);
    expect(
      await search("report", { modifiedFrom: "2000-01-01T00:00:00Z", type: "folder" }),
    ).toHaveLength(3);
    expect(await searchFolders("quarter")).toEqual([{ id: quarterly, name: "Quarterly reports" }]);
  });

  it("finds nothing someone hasn't been given", async () => {
    as(stranger);
    expect(await search("report")).toEqual([]);
  });

  it("refuses an unknown type", async () => {
    as(owner);
    await expect(search("report", { type: "virus" })).rejects.toMatchObject({ code: "LK422" });
  });

  it("tells a folder's story, newest first, a page at a time", async () => {
    as(owner);
    for (let n = 1; n <= 31; n++) await rename(quarterly, `Quarterly reports v${String(n)}`);

    const first = await getActivity(reports);
    expect(first.entries).toHaveLength(30);
    expect(first.entries[0]).toMatchObject({
      action: "renamed",
      item: { id: quarterly, name: "Quarterly reports v31" },
      actor: { id: owner.id },
      details: { from: "Quarterly reports v30", to: "Quarterly reports v31" },
    });
    expect(first.next).not.toBeNull();

    const second = await getActivity(reports, first.next);
    // 31 renames, the share, and the two folders being created.
    expect(second.entries.map((entry) => entry.action)).toEqual([
      "renamed",
      "shared",
      "created",
      "created",
    ]);
    expect(second.entries[1]?.details).toMatchObject({ role: "viewer" });
    expect(second.next).toBeNull();
  });

  it("shows activity to people the item is shared with, and to no one else", async () => {
    as(friend);
    const { entries } = await getActivity(quarterly);
    expect(entries[0]?.actor.id).toBe(owner.id);
    as(stranger);
    await expect(getActivity(quarterly)).rejects.toBeInstanceOf(NotFoundError);
  });
});
