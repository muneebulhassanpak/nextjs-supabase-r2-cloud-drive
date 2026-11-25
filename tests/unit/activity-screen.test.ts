import { describe, expect, it } from "vitest";

import { actorLabel, describeActivity, type ActivityEntry } from "@/lib/drive/activity";
import { activityHref, groupByDay, parseActivityFilters } from "@/lib/drive/activity-filters";

const entry = (
  action: ActivityEntry["action"],
  details: ActivityEntry["details"] = {},
  item: ActivityEntry["item"] = { id: "i", name: "a.txt", kind: "file", place: "drive" },
): ActivityEntry => ({
  id: 1,
  action,
  createdAt: "2026-11-25T10:00:00Z",
  item,
  actor: { id: "me", name: "Me", email: null },
  details,
});

describe("describeActivity on the Activity screen", () => {
  it.each([
    [entry("uploaded"), "uploaded “a.txt”"],
    [entry("deleted"), "deleted “a.txt” forever"],
    [entry("deleted", { automatic: true }), "deleted “a.txt” after 30 days in the trash"],
    [
      entry("invited", { person: "x@y.dev", role: "viewer" }),
      "invited x@y.dev to “a.txt” as Viewer",
    ],
    [
      entry("invite_changed", { person: "x@y.dev", fromRole: "viewer", role: "editor" }),
      "changed x@y.dev's invite to “a.txt” from Viewer to Editor",
    ],
    [entry("invite_removed", { person: "x@y.dev" }), "cancelled x@y.dev's invite to “a.txt”"],
    [entry("unshared", { person: "Ann" }), "stopped sharing “a.txt” with Ann"],
    [entry("unshared", { person: "Ann", left: true }), "left “a.txt”"],
    [entry("starred"), "starred “a.txt”"],
    [entry("unstarred"), "took the star off “a.txt”"],
    [entry("downloaded"), "downloaded “a.txt”"],
    [entry("signed_in", {}, null), "signed in"],
    [entry("name_changed", {}, null), "changed your name"],
    [entry("picture_changed", {}, null), "changed your profile picture"],
    [entry("password_changed", {}, null), "set a new password"],
  ])("%#: names the item", (given, expected) => {
    expect(describeActivity(given, null)).toBe(expected);
  });

  it("doesn't mistake a deleted item for the one a panel is about", () => {
    const gone = entry("deleted", {}, { id: null, name: "b", kind: "folder", place: "drive" });
    expect(describeActivity(gone, null)).toBe("deleted “b” forever");
  });

  it("credits the daily clean-up to Lockerly", () => {
    expect(actorLabel(entry("deleted", { automatic: true }), "me")).toBe("Lockerly");
    expect(actorLabel(entry("deleted"), "me")).toBe("You");
  });
});

describe("activity filters", () => {
  it("reads known values and ignores the rest", () => {
    expect(parseActivityFilters({ type: "trash", who: "others" })).toEqual({
      type: "trash",
      who: "others",
    });
    expect(parseActivityFilters({ type: "x", who: ["me", "any"] })).toEqual({
      type: null,
      who: "any",
    });
  });
  it("leaves defaults out of the address", () => {
    expect(activityHref({ type: null, who: "any" })).toBe("/drive/activity");
    expect(activityHref({ type: "sharing", who: "me" })).toBe(
      "/drive/activity?type=sharing&who=me",
    );
  });
});

describe("groupByDay", () => {
  it("groups by the local day, newest first", () => {
    const now = new Date(2026, 10, 25, 9);
    const at = (...parts: [number, number, number, number]) => ({
      createdAt: new Date(...parts).toISOString(),
    });
    const groups = groupByDay(
      [
        at(2026, 10, 25, 8),
        at(2026, 10, 25, 0),
        at(2026, 10, 24, 23),
        at(2026, 10, 20, 5),
        at(2025, 0, 2, 5),
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.entries.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Friday, November 20", 1],
      ["January 2, 2025", 1],
    ]);
  });
});
