import { describe, expect, it } from "vitest";

import { actorLabel, describeActivity, timeAgo, type ActivityEntry } from "@/lib/drive/activity";
import { modifiedRange, parseSearchParams, searchHref } from "@/lib/drive/search";

describe("search params", () => {
  it("reads filters from the URL and drops what it doesn't know", () => {
    expect(
      parseSearchParams({
        q: "  invoice ",
        type: "pdf",
        owner: "others",
        modified: "custom",
        from: "2026-01-02",
        to: "nope",
        tz: "Asia/Karachi",
      }),
    ).toEqual({
      q: "invoice",
      type: "pdf",
      owner: "others",
      modified: "custom",
      from: "2026-01-02",
      to: null,
      tz: "Asia/Karachi",
    });
    expect(parseSearchParams({ q: ["a", "b"], type: "virus", owner: "x", modified: "1y" })).toEqual(
      { q: "a", type: null, owner: "any", modified: "any", from: null, to: null, tz: null },
    );
    expect(parseSearchParams({ q: "x".repeat(150) }).q).toHaveLength(100);
    expect(parseSearchParams({ from: "2026-02-31x" }).from).toBeNull();
    // Impossible days and unknown zones are dropped, not rolled over.
    expect(parseSearchParams({ from: "2026-02-31", to: "2024-02-29" })).toMatchObject({
      from: null,
      to: "2024-02-29",
    });
    expect(parseSearchParams({ tz: "Mars/Olympus" }).tz).toBeNull();
  });

  it("builds short URLs that leave out defaults", () => {
    expect(searchHref({ q: "a b" })).toBe("/drive/search?q=a+b");
    expect(
      searchHref({ q: "a", type: "folder", owner: "me", modified: "7d", from: "2026-01-01" }),
    ).toBe("/drive/search?q=a&type=folder&owner=me&modified=7d");
    expect(
      searchHref({
        q: "a",
        owner: "any",
        modified: "custom",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).toBe("/drive/search?q=a&modified=custom&from=2026-01-01&to=2026-01-31");
    expect(
      searchHref({ q: "a", modified: "custom", from: "2026-01-01", tz: "Europe/London" }),
    ).toBe("/drive/search?q=a&modified=custom&from=2026-01-01&tz=Europe%2FLondon");
    expect(searchHref({ q: "a", modified: "custom", tz: "Europe/London" })).toBe(
      "/drive/search?q=a&modified=custom",
    );
  });

  it("turns the modified filter into a time range", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(modifiedRange({ modified: "any", from: null, to: null, tz: null }, now)).toEqual({
      from: null,
      to: null,
    });
    expect(modifiedRange({ modified: "7d", from: null, to: null, tz: null }, now)).toEqual({
      from: "2026-11-11T12:00:00.000Z",
      to: null,
    });
    // Both days of a custom range count in full.
    expect(
      modifiedRange({ modified: "custom", from: "2026-01-01", to: "2026-01-31", tz: null }, now),
    ).toEqual({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });
    // Days on the searcher's calendar: Karachi is UTC+5; New York changes clocks on 8 March 2026.
    expect(
      modifiedRange({
        modified: "custom",
        from: "2026-01-01",
        to: "2026-01-31",
        tz: "Asia/Karachi",
      }),
    ).toEqual({ from: "2025-12-31T19:00:00.000Z", to: "2026-01-31T19:00:00.000Z" });
    expect(
      modifiedRange({
        modified: "custom",
        from: "2026-03-08",
        to: "2026-03-08",
        tz: "America/New_York",
      }),
    ).toEqual({ from: "2026-03-08T05:00:00.000Z", to: "2026-03-09T04:00:00.000Z" });
    expect(modifiedRange({ modified: "custom", from: null, to: null, tz: null }, now)).toEqual({
      from: null,
      to: null,
    });
  });
});

describe("activity wording", () => {
  const here = "item-1";
  const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
    id: 1,
    action: "created",
    createdAt: "2026-11-18T12:00:00Z",
    item: { id: here, name: "Plans", kind: "folder", place: "drive" },
    actor: { id: "me", name: "Ava", email: "ava@demo.dev" },
    details: {},
    ...overrides,
  });
  const other = { id: "item-2", name: "brief.txt", kind: "file" as const, place: "drive" as const };

  it("says who did it", () => {
    expect(actorLabel(entry({}), "me")).toBe("You");
    expect(actorLabel(entry({}), "someone-else")).toBe("Ava");
    expect(actorLabel(entry({ actor: { id: "x", name: null, email: "b@x.dev" } }), "me")).toBe(
      "b@x.dev",
    );
    expect(actorLabel(entry({ actor: { id: null, name: null, email: null } }), "me")).toBe(
      "Someone",
    );
  });

  it("describes each kind of change, naming items other than the one shown", () => {
    const say = (overrides: Partial<ActivityEntry>) => describeActivity(entry(overrides), here);
    expect(say({})).toBe("created this folder");
    expect(say({ action: "uploaded", item: other })).toBe("uploaded “brief.txt”");
    expect(say({ action: "renamed", details: { from: "a", to: "b" } })).toBe("renamed “a” to “b”");
    expect(say({ action: "renamed", details: {} })).toBe("renamed “” to “”");
    expect(say({ action: "moved", details: { from: "A", to: "B" } })).toBe("moved it from A to B");
    expect(say({ action: "moved", details: { from: null, to: "B" } })).toBe("moved it to B");
    expect(say({ action: "moved", details: { from: "A", to: null } })).toBe("moved it out of A");
    expect(say({ action: "moved", item: other, details: {} })).toBe("moved “brief.txt”");
    expect(say({ action: "trashed" })).toBe("moved it to the trash");
    expect(say({ action: "restored" })).toBe("restored it from the trash");
    expect(say({ action: "shared", details: { person: "Ben", role: "editor" } })).toBe(
      "shared it with Ben as Editor",
    );
    expect(say({ action: "shared", details: { person: null, role: "x" } })).toBe(
      "shared it with someone as a role",
    );
    expect(
      say({
        action: "share_changed",
        details: { person: "Ben", fromRole: "viewer", role: "editor" },
      }),
    ).toBe("changed Ben from Viewer to Editor on it");
    expect(say({ action: "unshared", details: { person: "Ben" } })).toBe(
      "stopped sharing it with Ben",
    );
    expect(say({ action: "link_created" })).toBe("made a public link to it");
    expect(say({ action: "link_revoked" })).toBe("turned off the public link to it");
  });

  it("says how long ago, in the largest unit that fits", () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    expect(timeAgo("2026-11-18T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-18T11:55:00Z", now)).toMatch(/5 minutes ago/);
    expect(timeAgo("2026-11-17T12:00:00Z", now)).toMatch(/yesterday/);
    expect(timeAgo("2025-11-18T12:00:00Z", now)).toMatch(/last year/);
  });
});
