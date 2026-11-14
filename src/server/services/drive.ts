import "server-only";
import { cache } from "react";

import type { AccessRole, Crumb, DriveItem } from "@/lib/drive/types";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";

// Every read runs as the signed-in person, so row-level security decides what they see.

/** Folders hold at most this many items on one page until paging arrives with search (Phase 9). */
export const FOLDER_PAGE_SIZE = 1000;

const ITEM_COLUMNS =
  "id, kind, name, size, mime_type, category, updated_at, parent_id, owner:profiles!items_owner_id_fkey(id, full_name, email)";

interface ItemRow {
  id: string;
  kind: DriveItem["kind"];
  name: string;
  size: number | null;
  mime_type: string | null;
  category: DriveItem["category"];
  updated_at: string;
  parent_id: string | null;
  owner_id?: string;
  owner: { id: string; full_name: string | null; email: string } | null;
}

function toDriveItem(row: ItemRow): DriveItem {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    size: row.size,
    mimeType: row.mime_type,
    category: row.category,
    updatedAt: row.updated_at,
    parentId: row.parent_id,
    // Owners you can't see (no shared folder in common) stay anonymous.
    owner: {
      id: row.owner?.id ?? "",
      name: row.owner?.full_name ?? null,
      email: row.owner?.email ?? null,
    },
  };
}

export interface FolderView {
  /** null for the top of My Drive. */
  folder: (DriveItem & { role: AccessRole }) | null;
  /** Folders above, top first, as far up as the person can see. */
  crumbs: Crumb[];
  /** Whether the path starts in someone else's drive (shown as "Shared with me"). */
  sharedRoot: boolean;
  items: DriveItem[];
}

/** The top of the signed-in person's own drive. */
export async function getMyDriveRoot(): Promise<FolderView> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(ITEM_COLUMNS)
    .eq("owner_id", user.id)
    .is("parent_id", null)
    .is("trashed_at", null)
    .eq("status", "ready")
    .limit(FOLDER_PAGE_SIZE)
    .overrideTypes<ItemRow[], { merge: false }>();
  if (error) throw error;
  return { folder: null, crumbs: [], sharedRoot: false, items: data.map(toDriveItem) };
}

/**
 * A folder and what's in it, or null when it doesn't exist, isn't a folder, is in the trash, or
 * the person can't see it (all look the same, so ids reveal nothing).
 */
export const getFolder = cache(async (folderId: string): Promise<FolderView | null> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: folder, error } = await supabase
    .from("items")
    .select(`${ITEM_COLUMNS}, ancestors, owner_id, trashed_at`)
    .eq("id", folderId)
    .eq("kind", "folder")
    .maybeSingle<ItemRow & { ancestors: string[]; owner_id: string; trashed_at: string | null }>();
  if (error) throw error;
  if (!folder || folder.trashed_at) return null;

  const [children, above, role] = await Promise.all([
    supabase
      .from("items")
      .select(ITEM_COLUMNS)
      .eq("parent_id", folderId)
      .is("trashed_at", null)
      .eq("status", "ready")
      .limit(FOLDER_PAGE_SIZE)
      .overrideTypes<ItemRow[], { merge: false }>(),
    // An empty list matches nothing, so the top-level case needs no special path.
    supabase.from("items").select("id, name, owner_id").in("id", folder.ancestors),
    supabase.rpc("item_access_role", { p_item_id: folderId }),
  ]);
  if (children.error) throw children.error;
  if (above.error) throw above.error;
  if (role.error) throw role.error;
  // Generated types can't tell that the function returns NULL for items the caller can't see.
  const myRole = role.data as AccessRole | null;
  if (!myRole) return null;

  // Folders above the share point are hidden; keep the visible ones in path order.
  const visible = new Map(above.data.map((row) => [row.id, row]));
  const crumbs = folder.ancestors.flatMap((id) => {
    const row = visible.get(id);
    return row ? [{ id, name: row.name }] : [];
  });
  // The path is in the person's own drive only if they own its top folder (which they can see).
  const top = folder.ancestors[0];
  const topOwner = top ? visible.get(top)?.owner_id : folder.owner_id;

  return {
    folder: { ...toDriveItem(folder), role: myRole },
    crumbs,
    sharedRoot: topOwner !== user.id,
    items: children.data.map(toDriveItem),
  };
});
