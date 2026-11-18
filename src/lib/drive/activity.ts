import type { Database } from "@/server/db/database.types";

// The Activity tab: what happened, in words. Safe for the browser.

export type ActivityAction = Database["public"]["Enums"]["activity_action"];

export interface ActivityEntry {
  id: number;
  action: ActivityAction;
  createdAt: string;
  item: { id: string; name: string; kind: "folder" | "file" };
  /** Who did it; null name and email when it's someone the viewer can't see (or an account gone). */
  actor: { id: string | null; name: string | null; email: string | null };
  details: {
    /** Renames: the old and new name. Moves: the folders, if the viewer can see them. */
    from?: string | null;
    to?: string | null;
    /** Shares: the person and the role. */
    person?: string | null;
    role?: string | null;
    fromRole?: string | null;
  };
}

/** Where the next page of activity starts: just below the last entry shown. */
export interface ActivityCursor {
  at: string;
  id: number;
}

const someone = "Someone";

/** Who did it, from the viewer's side: "You", their name, or "Someone". */
export function actorLabel(entry: ActivityEntry, currentUserId: string): string {
  if (entry.actor.id && entry.actor.id === currentUserId) return "You";
  return entry.actor.name ?? entry.actor.email ?? someone;
}

/**
 * What happened, after the actor: "renamed “a” to “b”", "shared it with Ann as Viewer". `here` is
 * the item the panel is about: other items are named, so a folder's activity reads well.
 */
export function describeActivity(entry: ActivityEntry, hereId: string): string {
  const it = entry.item.id === hereId ? "it" : `“${entry.item.name}”`;
  const what = entry.item.id === hereId ? `this ${entry.item.kind}` : `“${entry.item.name}”`;
  const { from, to, person, role, fromRole } = entry.details;
  const who = person ?? "someone";
  const roleName = (value: string | null | undefined) =>
    value === "editor" ? "Editor" : value === "viewer" ? "Viewer" : "a role";
  switch (entry.action) {
    case "created":
      return `created ${what}`;
    case "uploaded":
      return `uploaded ${what}`;
    case "renamed":
      return `renamed “${from ?? ""}” to “${to ?? ""}”`;
    case "moved":
      return from && to
        ? `moved ${it} from ${from} to ${to}`
        : to
          ? `moved ${it} to ${to}`
          : from
            ? `moved ${it} out of ${from}`
            : `moved ${it}`;
    case "trashed":
      return `moved ${it} to the trash`;
    case "restored":
      return `restored ${it} from the trash`;
    case "shared":
      return `shared ${it} with ${who} as ${roleName(role)}`;
    case "share_changed":
      return `changed ${who} from ${roleName(fromRole)} to ${roleName(role)} on ${it}`;
    case "unshared":
      return `stopped sharing ${it} with ${who}`;
    case "link_created":
      return `made a public link to ${it}`;
    case "link_revoked":
      return `turned off the public link to ${it}`;
  }
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "2 minutes ago", "yesterday", "3 weeks ago": the largest unit that fits. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
