import "server-only";

import type { Disposition } from "@/lib/files/rules";
import { requireApiUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { NotFoundError } from "@/server/errors";
import { DOWNLOAD_URL_TTL, signDownload } from "@/server/storage/objects";

/**
 * A short-lived link to a file's bytes. The file is read as the signed-in person first, so
 * row-level security decides: no row back means no link, and "not yours" looks like "not found".
 */
export async function getFileUrl(
  id: string,
  disposition: Disposition,
): Promise<{ url: string; expiresIn: number }> {
  await requireApiUser();
  const supabase = await createClient();
  const { data: file, error } = await supabase
    .from("items")
    .select("name, mime_type, object_key")
    .eq("id", id)
    .eq("kind", "file")
    .eq("status", "ready")
    .is("trashed_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!file?.object_key || !file.mime_type) throw new NotFoundError("File not found.");

  const url = await signDownload(
    file.object_key,
    { name: file.name, mimeType: file.mime_type },
    disposition,
  );
  return { url, expiresIn: DOWNLOAD_URL_TTL };
}
