"use client";

import { Download, Eye, FolderOpen, Info, Pencil, Trash2, type LucideIcon } from "lucide-react";

import type { DriveItem } from "@/lib/drive/types";

export interface ItemAction {
  id: "open" | "download" | "rename" | "details" | "trash";
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  shortcut?: string;
}

/**
 * The actions for what's selected, in one list, so the context menu, the "more" menu and the
 * phone action sheet always offer the same things.
 */
export function actionsFor(selected: DriveItem[], canEdit: boolean): ItemAction[] {
  const single = selected.length === 1 ? selected[0] : undefined;
  const actions: ItemAction[] = [];
  if (single?.kind === "folder") actions.push({ id: "open", label: "Open", icon: FolderOpen });
  if (single?.kind === "file") {
    actions.push({ id: "open", label: "Preview", icon: Eye });
    actions.push({ id: "download", label: "Download", icon: Download });
  }
  if (single && canEdit)
    actions.push({ id: "rename", label: "Rename", icon: Pencil, shortcut: "F2" });
  if (single) actions.push({ id: "details", label: "Details", icon: Info });
  if (selected.length > 0 && canEdit) {
    actions.push({
      id: "trash",
      label: selected.length > 1 ? `Move ${selected.length} to trash` : "Move to trash",
      icon: Trash2,
      destructive: true,
      shortcut: "Del",
    });
  }
  return actions;
}
