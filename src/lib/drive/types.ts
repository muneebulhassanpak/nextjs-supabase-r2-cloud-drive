import type { Database } from "@/server/db/database.types";

type Enums = Database["public"]["Enums"];
export type ItemKind = Enums["item_kind"];
export type ItemCategory = Enums["item_category"];
export type AccessRole = Enums["access_role"];
export type DriveView = Enums["drive_view"];

/** A file or folder as the browser shows it. Safe to send to the client. */
export interface DriveItem {
  id: string;
  kind: ItemKind;
  name: string;
  size: number | null;
  mimeType: string | null;
  category: ItemCategory | null;
  updatedAt: string;
  parentId: string | null;
  owner: { id: string; name: string | null; email: string | null };
  /** Whether the signed-in person starred it. */
  starred: boolean;
  /** When they last opened it (Recent only). */
  openedAt?: string;
  /** When it went to the trash (Trash only). */
  trashedAt?: string;
  /** When it was shared with the person (Shared with me). */
  sharedAt?: string;
}

/** A folder above the current one, for the breadcrumbs. */
export interface Crumb {
  id: string;
  name: string;
}

/** One step of the "Move to" picker: a folder and the folders inside it. */
export interface FolderChoices {
  /** null for the top of My Drive. */
  folder: { id: string; name: string } | null;
  /** Folders above, top first, as far up as the person can see. */
  crumbs: Crumb[];
  /** Whether things can be moved into this folder. */
  canEdit: boolean;
  folders: { id: string; name: string }[];
}

/** Ids of items shown before the server has created them (a new folder, say). */
export const PENDING_PREFIX = "pending-";
