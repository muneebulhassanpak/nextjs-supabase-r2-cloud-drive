import "server-only";

import type { ActivityCursor, ActivityEntry } from "@/lib/drive/activity";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { NotFoundError, pgErrorCode } from "@/server/errors";

/** Entries per page in the Activity tab. */
export const ACTIVITY_PAGE_SIZE = 30;

/** A row of `item_activity`. Names come from left joins, so any of them can be null. */
interface ActivityRow {
  id: number;
  action: ActivityEntry["action"];
  details: Record<string, unknown>;
  created_at: string;
  item_id: string;
  item_name: string;
  item_kind: "folder" | "file";
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  from_name: string | null;
  to_name: string | null;
  person_name: string | null;
  person_email: string | null;
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

/**
 * What happened to an item (for a folder, to everything inside it), newest first, one page at a
 * time. The database decides what the person may see, down to the names in each entry.
 */
export async function getActivity(
  itemId: string,
  cursor: ActivityCursor | null = null,
): Promise<{ entries: ActivityEntry[]; next: ActivityCursor | null }> {
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

  const entries = data.map((row): ActivityEntry => {
    const raw = row.details;
    // A move from or to the top of a drive has no folder; a folder the viewer can't see has no name.
    const place = (id: unknown, name: string | null) =>
      id === null ? "the top of the drive" : name;
    const details: ActivityEntry["details"] =
      row.action === "renamed"
        ? { from: text(raw.from), to: text(raw.to) }
        : row.action === "moved"
          ? { from: place(raw.from, row.from_name), to: place(raw.to, row.to_name) }
          : row.action === "shared" || row.action === "unshared"
            ? { person: row.person_name ?? row.person_email, role: text(raw.role) }
            : row.action === "share_changed"
              ? {
                  person: row.person_name ?? row.person_email,
                  role: text(raw.to),
                  fromRole: text(raw.from),
                }
              : {};
    return {
      id: row.id,
      action: row.action,
      createdAt: row.created_at,
      item: { id: row.item_id, name: row.item_name, kind: row.item_kind },
      actor: { id: row.actor_id, name: row.actor_name, email: row.actor_email },
      details,
    };
  });
  const last = entries.at(-1);
  return {
    entries,
    next:
      last && entries.length === ACTIVITY_PAGE_SIZE ? { at: last.createdAt, id: last.id } : null,
  };
}
