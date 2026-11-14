import "server-only";

import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { removeQuietly } from "@/server/storage/objects";

// Deleting for good, as the signed-in person: the database checks they own what goes (others'
// files inside are handed back to them) and returns the storage keys of the files it deleted.
// The space is given back by the database in the same step; the bytes are deleted here, and any
// storage keeps by mistake are removed by the daily cleanup (objects no row points at).

/** Deletes trash entries for good, one at a time. Reports which went and the first problem. */
export async function deleteForever(
  itemIds: readonly string[],
): Promise<{ deleted: string[]; problem?: unknown }> {
  await requireUser();
  const supabase = await createClient();
  const deleted: string[] = [];
  const keys: string[] = [];
  let problem: unknown;
  for (const itemId of itemIds) {
    const { data, error } = await supabase.rpc("delete_forever", { p_item_id: itemId });
    if (error) problem ??= error;
    else {
      deleted.push(itemId);
      keys.push(...data);
    }
  }
  await removeQuietly(keys);
  return problem === undefined ? { deleted } : { deleted, problem };
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
