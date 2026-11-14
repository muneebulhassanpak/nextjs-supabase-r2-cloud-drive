import "server-only";

import { hasThumbnail, previewKind } from "@/lib/files/preview";
import type { Disposition } from "@/lib/files/rules";
import { requireApiUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { NotFoundError, pgErrorCode } from "@/server/errors";
import {
  DOWNLOAD_URL_TTL,
  signDownload,
  signThumbnail,
  VIEWER_URL_TTL,
} from "@/server/storage/objects";

/**
 * A file the signed-in person can see, read as them, so row-level security decides: no row back
 * means no link, and "not yours" looks the same as "not found".
 */
async function readableFile(id: string) {
  await requireApiUser();
  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("items")
    .select("name, mime_type, size, object_key")
    .eq("id", id)
    .eq("kind", "file")
    .eq("status", "ready")
    .is("trashed_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!file?.object_key || !file.mime_type) throw new NotFoundError("File not found.");
  return { ...file, object_key: file.object_key, mime_type: file.mime_type };
}

/** A short-lived link to a file's bytes, to download or (if its type allows) to view. */
export async function getFileUrl(
  id: string,
  disposition: Disposition,
): Promise<{ url: string; expiresIn: number }> {
  const file = await readableFile(id);
  const kind = previewKind(file.mime_type);
  // Players and PDF viewers keep reading as people watch and scroll: their links last longer.
  const expiresIn =
    disposition === "inline" && (kind === "video" || kind === "audio" || kind === "pdf")
      ? VIEWER_URL_TTL
      : DOWNLOAD_URL_TTL;
  const url = await signDownload(
    file.object_key,
    { name: file.name, mimeType: file.mime_type },
    disposition,
    expiresIn,
  );
  return { url, expiresIn };
}

/** A link to show an image in grid view, or "not found" for files without a thumbnail. */
export async function getThumbnailUrl(id: string): Promise<{ url: string; maxAge: number }> {
  const file = await readableFile(id);
  if (!hasThumbnail({ mimeType: file.mime_type, size: file.size })) {
    throw new NotFoundError("No thumbnail.");
  }
  return signThumbnail(file.object_key, { name: file.name, mimeType: file.mime_type });
}

/** Puts an item at the top of the person's Recents. Row-level security checks they can see it. */
export async function recordRecent(id: string): Promise<void> {
  await requireApiUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("touch_recent", { p_item_id: id });
  // Not visible to them (42501, the policy) or gone (23503): the same answer as for any other id.
  const code = pgErrorCode(error);
  if (code === "42501" || code === "23503") throw new NotFoundError("File not found.");
  if (error) throw error;
}
