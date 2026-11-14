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
}

/** A folder above the current one, for the breadcrumbs. */
export interface Crumb {
  id: string;
  name: string;
}
