import "server-only";
import { cache } from "react";

import type { AccessRole, Crumb, DriveItem, FolderChoices } from "@/lib/drive/types";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";

// Every read runs as the signed-in person, so row-level security decides what they see.

/** Folders hold at most this many items on one page until paging arrives with search (Phase 9). */
export const FOLDER_PAGE_SIZE = 1000;

/** Most items Recent shows. */
export const RECENT_LIMIT = 100;

const ITEM_FIELDS =
  "id, kind, name, size, mime_type, category, updated_at, parent_id, owner:profiles!items_owner_id_fkey(id, full_name, email)";
// `stars` holds only the caller's own star (row-level security), so it says whether they starred it.
const ITEM_COLUMNS = `${ITEM_FIELDS}, stars(user_id)`;
// `!inner` keeps only items with a star, and the star is always the caller's own.
const STARRED_COLUMNS = `${ITEM_FIELDS}, stars!inner(user_id)`;

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
  stars: { user_id: string }[];
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
    starred: row.stars.length > 0,
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
    // Folders first (the enum lists them first), then by name, so a full page is predictable.
    .order("kind")
    .order("name")
    .order("id")
    .limit(FOLDER_PAGE_SIZE)
    .overrideTypes<ItemRow[], { merge: false }>();
  if (error) throw error;
  return { folder: null, crumbs: [], sharedRoot: false, items: data.map(toDriveItem) };
}

type FolderHeader = Omit<FolderView, "items">;

/**
 * A folder, the path to it and the person's role on it, or null when it doesn't exist, isn't a
 * folder, is in the trash, or the person can't see it (all look the same, so ids reveal nothing).
 */
const getFolderHeader = cache(async (folderId: string): Promise<FolderHeader | null> => {
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

  const [above, role] = await Promise.all([
    // An empty list matches nothing, so the top-level case needs no special path.
    supabase.from("items").select("id, name, owner_id").in("id", folder.ancestors),
    supabase.rpc("item_access_role", { p_item_id: folderId }),
  ]);
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
  };
});

/** A folder and what's in it, or null when the person can't open it (see getFolderHeader). */
export const getFolder = cache(async (folderId: string): Promise<FolderView | null> => {
  const supabase = await createClient();
  // Both start at once; the listing is only used if the folder can be opened.
  const [header, children] = await Promise.all([
    getFolderHeader(folderId),
    supabase
      .from("items")
      .select(ITEM_COLUMNS)
      .eq("parent_id", folderId)
      .is("trashed_at", null)
      .eq("status", "ready")
      .order("kind")
      .order("name")
      .order("id")
      .limit(FOLDER_PAGE_SIZE)
      .overrideTypes<ItemRow[], { merge: false }>(),
  ]);
  if (!header) return null;
  if (children.error) throw children.error;
  return { ...header, items: children.data.map(toDriveItem) };
});

/** What the person starred and can still see, folders first. */
export async function getStarred(): Promise<DriveItem[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(STARRED_COLUMNS)
    .is("trashed_at", null)
    .eq("status", "ready")
    .order("kind")
    .order("name")
    .order("id")
    .limit(FOLDER_PAGE_SIZE)
    .overrideTypes<ItemRow[], { merge: false }>();
  if (error) throw error;
  return data.map(toDriveItem);
}

/** Files the person opened lately and can still see, newest first. */
export async function getRecent(): Promise<DriveItem[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recents")
    .select(`touched_at, item:items!inner(${ITEM_COLUMNS})`)
    .is("item.trashed_at", null)
    .eq("item.status", "ready")
    .order("touched_at", { ascending: false })
    .limit(RECENT_LIMIT)
    .overrideTypes<{ touched_at: string; item: ItemRow }[], { merge: false }>();
  if (error) throw error;
  return data.map((row) => ({ ...toDriveItem(row.item), openedAt: row.touched_at }));
}

/**
 * What was shared with the person directly, newest share first. Things inside a shared folder
 * aren't listed on their own: they're reached by opening the folder.
 */
export async function getSharedWithMe(): Promise<DriveItem[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_shares")
    .select(`created_at, item:items!inner(${ITEM_COLUMNS})`)
    .eq("user_id", user.id)
    .is("item.trashed_at", null)
    .eq("item.status", "ready")
    .order("created_at", { ascending: false })
    .limit(FOLDER_PAGE_SIZE)
    .overrideTypes<{ created_at: string; item: ItemRow }[], { merge: false }>();
  if (error) throw error;
  return data.map((row) => ({ ...toDriveItem(row.item), sharedAt: row.created_at }));
}

/**
 * The person's trash: what they own that's in it, and what they put there from folders shared
 * with them. One row per trash entry; what went in with a folder comes back with it.
 */
export async function getTrash(): Promise<DriveItem[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("trash_entries")
    .select(`${ITEM_COLUMNS}, trashed_at`)
    .limit(FOLDER_PAGE_SIZE)
    .overrideTypes<(ItemRow & { trashed_at: string })[], { merge: false }>();
  if (error) throw error;
  return data.map((row) => ({ ...toDriveItem(row), trashedAt: row.trashed_at }));
}

/** One step of the "Move to" picker: a folder and the folders in it, or null if it's hidden. */
export async function getFolderChoices(folderId: string | null): Promise<FolderChoices | null> {
  const user = await requireUser();
  const header = folderId === null ? null : await getFolderHeader(folderId);
  if (folderId !== null && !header) return null;

  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select("id, name")
    .eq("kind", "folder")
    .is("trashed_at", null)
    .eq("status", "ready");
  query =
    folderId === null
      ? query.eq("owner_id", user.id).is("parent_id", null)
      : query.eq("parent_id", folderId);
  const { data, error } = await query.order("name").order("id").limit(FOLDER_PAGE_SIZE);
  if (error) throw error;

  return {
    folder: header?.folder ? { id: header.folder.id, name: header.folder.name } : null,
    crumbs: header?.crumbs ?? [],
    canEdit: header?.folder?.role !== "viewer",
    folders: data,
  };
}

/** Folders whose name matches `query`, best first, for the picker's search. */
export async function searchFolders(query: string): Promise<{ id: string; name: string }[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("search_items", { p_query: query, p_type: "folder", p_limit: 20 })
    .select("id, name");
  if (error) throw error;
  return data;
}

export interface SearchFilters {
  query: string;
  type: string | null;
  owner: "me" | "others" | "any";
  modifiedFrom: string | null;
  modifiedTo: string | null;
}

/** Everything the person can see whose name matches, best first (never trashed items). */
export async function searchDrive(filters: SearchFilters, limit = 50): Promise<DriveItem[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("search_items", {
      p_query: filters.query,
      p_owner: filters.owner,
      p_limit: limit,
      ...(filters.type && { p_type: filters.type }),
      ...(filters.modifiedFrom && { p_modified_from: filters.modifiedFrom }),
      ...(filters.modifiedTo && { p_modified_to: filters.modifiedTo }),
    })
    .select(ITEM_COLUMNS)
    .overrideTypes<ItemRow[], { merge: false }>();
  if (error) throw error;
  return data.map(toDriveItem);
}
