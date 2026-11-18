import { describe, expect, it } from "vitest";

import { actionsFor, type ActionContext } from "@/components/drive/item-actions";
import { groupByOpened } from "@/lib/drive/recent";
import type { DriveItem } from "@/lib/drive/types";

const ME = "me";

function item(overrides: Partial<DriveItem> = {}): DriveItem {
  return {
    id: crypto.randomUUID(),
    kind: "file",
    name: "a.txt",
    size: 1,
    mimeType: "text/plain",
    category: "text",
    updatedAt: "2026-11-14T10:00:00Z",
    parentId: null,
    owner: { id: ME, name: null, email: null },
    starred: false,
    ...overrides,
  };
}

describe("groupByOpened", () => {
  // Local time, as in the browser: the boundaries are the viewer's midnights.
  const now = new Date(2026, 10, 14, 15, 0); // Saturday 14 Nov 2026, 3 pm
  const at = (day: number, hour: number) =>
    item({ openedAt: new Date(2026, 10, day, hour).toISOString() });

  it("splits into Today, This week and Earlier, keeping the order", () => {
    const items = [at(14, 9), at(14, 0), at(13, 23), at(8, 0), at(7, 23), at(1, 12)];
    const groups = groupByOpened(items, now);
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ["Today", 2],
      ["This week", 2],
      ["Earlier", 2],
    ]);
    expect(groups.flatMap((group) => group.items)).toEqual(items);
  });

  it("leaves out empty groups", () => {
    expect(groupByOpened([at(1, 12)], now).map((group) => group.label)).toEqual(["Earlier"]);
    expect(groupByOpened([], now)).toEqual([]);
  });
});

describe("actionsFor", () => {
  const ids = (selected: DriveItem[], context: Partial<ActionContext> = {}) =>
    actionsFor(selected, { mode: "folder", canEdit: true, currentUserId: ME, ...context }).map(
      (action) => action.id,
    );

  it("offers everything for one file in a folder you can edit", () => {
    expect(ids([item()])).toEqual([
      "open",
      "download",
      "rename",
      "move",
      "share",
      "star",
      "details",
      "trash",
    ]);
  });

  it("offers move, star and trash for a selection", () => {
    expect(ids([item(), item({ kind: "folder" })])).toEqual(["move", "star", "trash"]);
  });

  it("offers unstar only when everything selected is starred", () => {
    expect(ids([item({ starred: true }), item()])).toContain("star");
    expect(ids([item({ starred: true }), item({ starred: true })])).toContain("unstar");
  });

  it("lets viewers and the collections star, but not change things", () => {
    for (const context of [{ canEdit: false }, { mode: "starred" as const, canEdit: false }]) {
      expect(ids([item()], context)).toEqual(["open", "download", "share", "star", "details"]);
    }
  });

  it("lets people leave what was shared with them", () => {
    expect(ids([item()], { mode: "shared", canEdit: false })).toEqual([
      "open",
      "download",
      "share",
      "star",
      "details",
      "leave",
    ]);
    expect(ids([item(), item()], { mode: "shared", canEdit: false })).toEqual(["star", "leave"]);
  });

  it("restores in the trash, and deletes forever only what's yours", () => {
    expect(ids([item()], { mode: "trash" })).toEqual(["restore", "details", "delete"]);
    const theirs = item({ owner: { id: "someone", name: null, email: null } });
    expect(ids([item(), theirs], { mode: "trash" })).toEqual(["restore"]);
    expect(ids([], { mode: "trash" })).toEqual([]);
  });
});
