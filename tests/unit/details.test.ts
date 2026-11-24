import { describe, expect, it } from "vitest";

import { positionOf, summarize } from "@/lib/drive/summary";
import { accessLabel } from "@/lib/sharing/access-label";
import type { AccessEntry, ShareLinkInfo } from "@/lib/sharing/types";

const NOW = new Date("2026-11-25T12:00:00Z");

const entry = (id: string, name: string | null, email: string | null = null): AccessEntry => ({
  kind: id === "me" ? "owner" : "person",
  key: id,
  person: { id, name, email, avatarUrl: null },
  role: id === "me" ? "owner" : "viewer",
  from: null,
  direct: true,
});
const me = entry("me", "Me");
const label = (people: AccessEntry[], link: ShareLinkInfo | null = null) =>
  accessLabel({ people, link, canManage: true }, "me", NOW);
const link = (expiresAt: string | null): ShareLinkInfo => ({
  createdAt: "2026-11-01T00:00:00Z",
  expiresAt,
});

describe("accessLabel", () => {
  it("says an item is private when only its owner has access", () => {
    expect(label([me])).toEqual({
      title: "Private",
      detail: "Only you can open this",
      isPublic: false,
    });
  });

  it("names the people it's shared with", () => {
    expect(label([me, entry("a", "Ann")])).toMatchObject({
      title: "2 people have access",
      detail: "You, Ann",
    });
    expect(label([me, entry("a", "Ann"), entry("b", null, "bo@x.dev")]).detail).toBe(
      "You, Ann and bo@x.dev",
    );
    expect(label([me, entry("a", "Ann"), entry("b", "Bo"), entry("c", null)]).detail).toBe(
      "You, Ann and 2 others",
    );
    expect(label([me, entry("c", null)]).detail).toBe("You, Someone");
  });

  it("puts a live public link first", () => {
    expect(label([me], link(null))).toEqual({
      title: "Anyone with the link",
      detail: "Can view and download",
      isPublic: true,
    });
    expect(label([me, entry("a", "Ann")], link("2026-11-26T00:00:00Z")).detail).toBe(
      "Also shared with Ann",
    );
  });

  it("ignores a link that has expired", () => {
    expect(label([me], link("2026-11-24T00:00:00Z"))).toMatchObject({
      title: "Private",
      isPublic: false,
    });
  });
});

describe("summarize", () => {
  it("counts folders and files, and adds up the files' sizes", () => {
    expect(
      summarize([
        { kind: "folder", size: null },
        { kind: "file", size: 10 },
        { kind: "file", size: 5 },
      ]),
    ).toEqual({ folders: 1, files: 2, bytes: 15 });
  });
});

describe("positionOf", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("finds an item and its neighbours", () => {
    expect(positionOf(items, "b")).toEqual({ index: 1, total: 3, previous: "a", next: "c" });
    expect(positionOf(items, "a")).toMatchObject({ previous: null, next: "b" });
    expect(positionOf(items, "c")).toMatchObject({ previous: "b", next: null });
  });
  it("has no place for an item that isn't listed", () => {
    expect(positionOf(items, "z")).toBeNull();
  });
});
