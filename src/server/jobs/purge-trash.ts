import "server-only";

import { createAdminClient } from "@/server/db/admin";
import { logger } from "@/server/logger";
import { deleteObjects } from "@/server/storage/objects";

// A daily job, not a user request, so it uses the admin client (no row-level security). The
// database decides what goes (`purge_trash`); this deletes the bytes of the files that went.

/** How long things stay in the trash before they're deleted for good. */
export const TRASH_DAYS = 30;

/** Trash entries one call deletes at most; anything left waits for the next run. */
const PURGE_LIMIT = 500;

export interface PurgeOptions {
  /** Defaults to 30 days. Tests pass a negative age to mean "everything so far". */
  olderThanSeconds?: number;
}

export interface PurgeReport {
  deletedFiles: number;
  failedDeletes: number;
}

export async function purgeTrash({
  olderThanSeconds = TRASH_DAYS * 24 * 60 * 60,
}: PurgeOptions = {}): Promise<PurgeReport> {
  const admin = createAdminClient();
  const { data: keys, error } = await admin.rpc("purge_trash", {
    p_older_than: `${String(olderThanSeconds)} seconds`,
    p_limit: PURGE_LIMIT,
  });
  if (error) throw error;
  // The rows are gone and the space is given back; bytes storage keeps are removed by the daily
  // storage cleanup, which deletes objects no row points at.
  const failed = await deleteObjects(keys);
  const report = { deletedFiles: keys.length, failedDeletes: failed.length };
  logger.info({ report }, "trash purge finished");
  return report;
}
