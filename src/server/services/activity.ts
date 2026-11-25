import "server-only";

import type { ActivityCursor, ActivityEntry, ItemPlace } from "@/lib/drive/activity";
import type { ActivityFilters } from "@/lib/drive/activity-filters";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { NotFoundError, pgErrorCode } from "@/server/errors";

/** Entries per page in the Activity tab. */
export const ACTIVITY_PAGE_SIZE = 30;

/** A row of `item_activity` or `my_activity`. Names come from left joins, so any of them can be null. */
interface ActivityRow {
  id: number;
  action: ActivityEntry["action"];
  details: Record<string, unknown>;
  created_at: string;
  item_id: string | null;
  item_name: string | null;
  item_kind: "folder" | "file" | null;
  item_trashed?: boolean;
  item_listed?: boolean;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  from_name: string | null;
  to_name: string | null;
  person_name: string | null;
  person_email: string | null;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  next: ActivityCursor | null;
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

/**
 * What happened to an item (for a folder, to everything inside it), newest first, one page at a
 * time. The database decides what the person may see, down to the names in each entry.
 */
export async function getActivity(
  itemId: string,
  cursor: ActivityCursor | null = null,
): Promise<ActivityPage> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("item_activity", {
      p_item_id: itemId,
      p_limit: ACTIVITY_PAGE_SIZE,
      ...(cursor && { p_before_at: cursor.at, p_before_id: cursor.id }),
    })
    .overrideTypes<ActivityRow[], { merge: false }>();
  if (pgErrorCode(error) === "P0002") throw new NotFoundError("We couldn't find that.");
  if (error) throw error;

  return toPage(data);
}

/** Everything the person may see in the log, newest first, one page at a time. */
export async function getMyActivity(
  filters: ActivityFilters,
  cursor: ActivityCursor | null = null,
): Promise<ActivityPage> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("my_activity", {
      p_who: filters.who,
      p_limit: ACTIVITY_PAGE_SIZE,
      ...(filters.type && { p_type: filters.type }),
      ...(cursor && { p_before_at: cursor.at, p_before_id: cursor.id }),
    })
    .overrideTypes<ActivityRow[], { merge: false }>();
  if (error) throw error;
  return toPage(data);
}

function toPage(rows: ActivityRow[]): ActivityPage {
  const last = rows.at(-1);
  return {
    entries: rows.map(toEntry),
    next: last && rows.length === ACTIVITY_PAGE_SIZE ? { at: last.created_at, id: last.id } : null,
  };
}

function placeOf(row: ActivityRow): ItemPlace {
  if (row.item_id === null) return "none";
  if (!row.item_trashed) return "drive";
  return row.item_listed ? "trash" : "none";
}

function toEntry(row: ActivityRow): ActivityEntry {
  const raw = row.details;
  return {
    id: row.id,
    action: row.action,
    createdAt: row.created_at,
    item:
      row.item_name === null || row.item_kind === null
        ? null
        : {
            id: row.item_id,
            name: row.item_name,
            kind: row.item_kind,
            place: placeOf(row),
          },
    actor: { id: row.actor_id, name: row.actor_name, email: row.actor_email },
    details: toDetails(row, raw),
  };
}

// A move from or to the top of a drive has no folder; a folder the viewer can't see has no name.
const place = (id: unknown, name: string | null) => (id === null ? "the top of the drive" : name);

function toDetails(row: ActivityRow, raw: Record<string, unknown>): ActivityEntry["details"] {
  const person = row.person_name ?? row.person_email;
  switch (row.action) {
    case "renamed":
      return { from: text(raw.from), to: text(raw.to) };
    case "moved":
      return { from: place(raw.from, row.from_name), to: place(raw.to, row.to_name) };
    case "shared":
    case "unshared":
      return {
        person,
        role: text(raw.role),
        ...(row.action === "unshared" && {
          left: row.actor_id !== null && raw.user_id === row.actor_id,
        }),
      };
    case "share_changed":
      return { person, role: text(raw.to), fromRole: text(raw.from) };
    case "invite_changed":
      return { person: text(raw.email), role: text(raw.to), fromRole: text(raw.from) };
    case "invited":
    case "invite_removed":
      return { person: text(raw.email), role: text(raw.role) };
    case "deleted":
      return { automatic: raw.automatic === true };
    default:
      return {};
  }
}
