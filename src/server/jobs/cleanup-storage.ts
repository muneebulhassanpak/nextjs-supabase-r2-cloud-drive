import "server-only";

import { createAdminClient } from "@/server/db/admin";
import { logger } from "@/server/logger";
import { deleteObjects, listObjectsBefore } from "@/server/storage/objects";

// A daily job, not a user request, so it uses the admin client (no row-level security). It only
// removes what nobody can reach: uploads abandoned for a day, and objects no row points at.

/** How old an abandoned upload or unreferenced object must be before it's removed: a day. */
export const CLEANUP_AGE_SECONDS = 24 * 60 * 60;

// Keys per `in (...)` query, to keep request URLs short.
const LOOKUP_BATCH = 100;
// Above this many objects, finding more than this share unused stops the job (see below).
const MIN_SCAN_FOR_GUARD = 20;
const MAX_ORPHAN_SHARE = 0.5;

export interface CleanupOptions {
  /** Defaults to a day. Tests pass a negative age to mean "everything so far". */
  olderThanSeconds?: number;
  /**
   * Only scan this person's objects for orphans (tests share one bucket). Abandoned uploads are
   * still removed for everyone: tests run one file at a time, so none are in flight.
   */
  ownerId?: string;
}

export interface CleanupReport {
  abandonedUploads: number;
  orphanedObjects: number;
  failedDeletes: number;
}

export async function cleanupStorage({
  olderThanSeconds = CLEANUP_AGE_SECONDS,
  ownerId,
}: CleanupOptions = {}): Promise<CleanupReport> {
  const admin = createAdminClient();
  const report: CleanupReport = { abandonedUploads: 0, orphanedObjects: 0, failedDeletes: 0 };

  // 1. Uploads started long ago and never finished: the database drops the rows (giving the
  //    reserved space back) and returns their keys, so anything that reached storage goes too.
  const { data: abandoned, error } = await admin.rpc("cleanup_pending_uploads", {
    p_older_than: `${String(olderThanSeconds)} seconds`,
  });
  if (error) throw error;
  report.abandonedUploads = abandoned.length;
  report.failedDeletes += (await deleteObjects(abandoned)).length;

  // 2. Objects no file or profile picture points at: cancelled uploads whose delete failed,
  //    replaced pictures, files deleted forever while storage was unreachable. Found first and
  //    deleted after, so a bucket paired with the wrong database can't be emptied (see below).
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const listings = ownerId
    ? [listObjectsBefore(cutoff, `u/${ownerId}/`), listObjectsBefore(cutoff, `a/${ownerId}/`)]
    : [listObjectsBefore(cutoff)];
  const orphans: string[] = [];
  let scanned = 0;
  for (const listing of listings) {
    for await (const keys of listing) {
      scanned += keys.length;
      for (let start = 0; start < keys.length; start += LOOKUP_BATCH) {
        const batch = keys.slice(start, start + LOOKUP_BATCH);
        const [files, avatars] = await Promise.all([
          admin.from("items").select("object_key").in("object_key", batch),
          admin.from("profiles").select("avatar_key").in("avatar_key", batch),
        ]);
        if (files.error) throw files.error;
        if (avatars.error) throw avatars.error;
        const used = new Set([
          ...files.data.map((row) => row.object_key),
          ...avatars.data.map((row) => row.avatar_key),
        ]);
        orphans.push(...batch.filter((key) => !used.has(key)));
      }
    }
  }
  // Orphans are rare. If most of the bucket looks unused, the settings point at the wrong database.
  if (scanned >= MIN_SCAN_FOR_GUARD && orphans.length > scanned * MAX_ORPHAN_SHARE) {
    logger.error(
      { scanned, orphans: orphans.length },
      "storage cleanup refused: most objects look unused",
    );
    throw new Error(
      "Refusing to delete most of the bucket. Check the storage and database settings.",
    );
  }
  report.orphanedObjects = orphans.length;
  report.failedDeletes += (await deleteObjects(orphans)).length;

  logger.info({ report }, "storage cleanup finished");
  return report;
}
