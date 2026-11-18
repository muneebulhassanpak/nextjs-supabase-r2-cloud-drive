"use client";

import {
  Download,
  Eye,
  FolderInput,
  FolderOpen,
  Info,
  LogOut,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import type { DriveItem } from "@/lib/drive/types";

/** Where the browser is: a folder, or one of the collections in the sidebar. */
export type BrowserMode = "folder" | "shared" | "starred" | "recent" | "trash";

export interface ItemAction {
  id:
    | "open"
    | "download"
    | "rename"
    | "move"
    | "share"
    | "leave"
    | "star"
    | "unstar"
    | "details"
    | "trash"
    | "restore"
    | "delete";
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  shortcut?: string;
}

export interface ActionContext {
  mode: BrowserMode;
  /** Whether the person may add, rename, move and trash things here. */
  canEdit: boolean;
  currentUserId: string;
}

/**
 * The actions for what's selected, in one list, so the context menu, the "more" menu and the
 * phone action sheet always offer the same things. The database has the final say on each.
 */
export function actionsFor(selected: DriveItem[], context: ActionContext): ItemAction[] {
  const { mode, canEdit, currentUserId } = context;
  const single = selected.length === 1 ? selected[0] : undefined;
  const count = selected.length;
  const actions: ItemAction[] = [];

  if (mode === "trash") {
    if (count === 0) return actions;
    actions.push({ id: "restore", label: "Restore", icon: RotateCcw });
    if (single) actions.push({ id: "details", label: "Details", icon: Info });
    // Only owners delete for good; files from shared folders go back to their owner's trash.
    if (selected.every((item) => item.owner.id === currentUserId)) {
      actions.push({
        id: "delete",
        label: count > 1 ? `Delete ${String(count)} forever` : "Delete forever",
        icon: Trash2,
        destructive: true,
        shortcut: "Del",
      });
    }
    return actions;
  }

  if (single?.kind === "folder") actions.push({ id: "open", label: "Open", icon: FolderOpen });
  if (single?.kind === "file") {
    actions.push({ id: "open", label: "Preview", icon: Eye });
    actions.push({ id: "download", label: "Download", icon: Download });
  }
  if (single && canEdit)
    actions.push({ id: "rename", label: "Rename", icon: Pencil, shortcut: "F2" });
  if (count > 0 && canEdit) actions.push({ id: "move", label: "Move to…", icon: FolderInput });
  // Everyone sees who has access; only the owner changes it (the dialog says so).
  if (single) actions.push({ id: "share", label: "Share", icon: UserPlus });
  if (count > 0) {
    actions.push(
      selected.every((item) => item.starred)
        ? { id: "unstar", label: "Remove from Starred", icon: StarOff }
        : { id: "star", label: "Add to Starred", icon: Star },
    );
  }
  if (single) actions.push({ id: "details", label: "Details", icon: Info });
  if (mode === "shared" && count > 0) {
    actions.push({
      id: "leave",
      label: "Remove from Shared with me",
      icon: LogOut,
      destructive: true,
      shortcut: "Del",
    });
  }
  if (count > 0 && canEdit) {
    actions.push({
      id: "trash",
      label: count > 1 ? `Move ${String(count)} to trash` : "Move to trash",
      icon: Trash2,
      destructive: true,
      shortcut: "Del",
    });
  }
  return actions;
}
