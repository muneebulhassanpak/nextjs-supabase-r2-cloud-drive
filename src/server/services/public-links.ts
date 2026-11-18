import "server-only";
import { cache } from "react";
import { z } from "zod";

import type { DriveItem } from "@/lib/drive/types";
import type { Disposition } from "@/lib/files/rules";
import { createClient } from "@/server/db/server";
import { NotFoundError } from "@/server/errors";
import { signFileUrl } from "@/server/services/files";

// Public links, for anyone holding the token, signed in or not. The database functions take the
// token and decide everything: whether it's live, and whether an item is inside what it shares.

/** Tokens the app makes: 32 random bytes in base64url. Anything else can't be a link. */
const TOKEN = z.string().regex(/^[\w-]{43}$/);
export const isLinkToken = (token: string) => TOKEN.safeParse(token).success;

export type LinkStatus = "ok" | "revoked" | "expired" | "unavailable" | "missing";

interface LinkRow {
  id: string;
  kind: "folder" | "file";
  name: string;
  size: number | null;
  mime_type: string | null;
  category: DriveItem["category"];
  updated_at: string;
}

/** Shown in the shared lists, which reuse the drive's item type: the owner stays private. */
const NOBODY = { id: "", name: null, email: null };

function toItem(row: LinkRow, parentId: string | null): DriveItem {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    size: row.size,
    mimeType: row.mime_type,
    category: row.category,
    updatedAt: row.updated_at,
    parentId,
    owner: NOBODY,
    starred: false,
  };
}

/** Why a link doesn't open (or "ok"). Once per request. */
export const getLinkStatus = cache(
  async (token: string): Promise<{ status: LinkStatus; expiresAt: string | null }> => {
    if (!isLinkToken(token)) return { status: "missing", expiresAt: null };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("share_link_status", { p_token: token });
    if (error) throw error;
    const [row] = data;
    return row
      ? { status: row.status as LinkStatus, expiresAt: row.expires_at }
      : { status: "missing", expiresAt: null };
  },
);

/** What the link shares, or null if it doesn't open. Once per request. */
export const getLinkRoot = cache(async (token: string): Promise<DriveItem | null> => {
  if (!isLinkToken(token)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_share_link", { p_token: token });
  if (error) throw error;
  const [row] = data as LinkRow[];
  return row ? toItem(row, null) : null;
});

/**
 * A folder inside a shared folder (or the shared folder itself): its path from the shared folder
 * down, and what's in it. Null if the folder isn't reached by the link.
 */
export const getLinkFolder = cache(
  async (
    token: string,
    folderId: string,
  ): Promise<{ path: { id: string; name: string }[]; items: DriveItem[] } | null> => {
    if (!isLinkToken(token)) return null;
    const supabase = await createClient();
    const [path, children] = await Promise.all([
      supabase.rpc("share_link_path", { p_token: token, p_item_id: folderId }),
      supabase.rpc("share_link_children", { p_token: token, p_folder_id: folderId }),
    ]);
    if (path.error) throw path.error;
    if (children.error) throw children.error;
    // Only folders open as a folder page; a file's id here would show as an empty folder.
    if (path.data.at(-1)?.kind !== "folder") return null;
    return {
      path: path.data.map(({ id, name }) => ({ id, name })),
      items: (children.data as LinkRow[]).map((row) => toItem(row, folderId)),
    };
  },
);

/** A file reached by the link, with what's needed to sign a storage link to it. */
async function linkedFile(token: string, fileId: string) {
  if (!isLinkToken(token) || !z.uuid().safeParse(fileId).success) {
    throw new NotFoundError("File not found.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("share_link_file", {
    p_token: token,
    p_item_id: fileId,
  });
  if (error) throw error;
  const [file] = data;
  if (!file?.object_key || !file.mime_type) throw new NotFoundError("File not found.");
  return { ...file, object_key: file.object_key, mime_type: file.mime_type };
}

/** A short-lived link to a file's bytes, the same as for signed-in people. */
export async function getLinkFileUrl(token: string, fileId: string, disposition: Disposition) {
  return signFileUrl(await linkedFile(token, fileId), disposition);
}
