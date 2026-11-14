import "server-only";

import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { removeQuietly } from "@/server/storage/objects";

// Deleting for good, as the signed-in person: the database checks they own what goes (others'
// files inside are handed back to them) and returns the storage keys of the files it deleted.
// The space is given back by the database in the same step; the bytes are deleted here, and any
// storage keeps by mistake are removed by the daily cleanup (objects no row points at).

/**
 * Deletes one trash entry for good, then its stored files. Shaped like a database call (data or
 * error) so callers can run it over a selection like the other item actions.
 */
export async function deleteEntryForever(
  itemId: string,
): Promise<{ data: string[] | null; error: unknown }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_forever", { p_item_id: itemId });
  if (error) return { data: null, error };
  await removeQuietly(data);
  return { data, error: null };
}

/** Empties the person's trash: everything of theirs in it, whoever put it there. */
export async function emptyTrash(): Promise<{ deletedFiles: number }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("empty_trash");
  if (error) throw error;
  await removeQuietly(data);
  return { deletedFiles: data.length };
}
