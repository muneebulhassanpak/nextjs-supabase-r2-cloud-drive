"use client";

import { useRef, useState, type DragEvent } from "react";

import type { DriveItem } from "@/lib/drive/types";

import type { ItemElementProps } from "./item-views";
import type { Destination } from "./move-dialog";

/** Marks a drag as Lockerly items (not files from the computer, or text). */
const ITEMS_TYPE = "application/x-lockerly-items";

/** What a drop target spreads onto its element, and whether something is hovering over it. */
export interface DropTargetProps {
  active: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
}

/**
 * Dragging items onto folders (rows, tiles, breadcrumbs) to move them. Dragging an item that's
 * selected takes the whole selection; any other item goes alone and becomes the selection.
 */
export function useItemDrag({
  enabled,
  selected,
  select,
  onMove,
}: {
  enabled: boolean;
  /** The current selection, in order. */
  selected: DriveItem[];
  select: (item: DriveItem) => void;
  onMove: (items: DriveItem[], destination: Destination) => void;
}) {
  const dragged = useRef<DriveItem[] | null>(null);
  // The folder under the pointer: an id, null for the top of My Drive, undefined for none.
  const [over, setOver] = useState<string | null | undefined>(undefined);

  function stop() {
    dragged.current = null;
    setOver(undefined);
  }

  function dropTarget(destination: Destination): DropTargetProps {
    const accepts = (event: DragEvent) =>
      enabled &&
      event.dataTransfer.types.includes(ITEMS_TYPE) &&
      !dragged.current?.some((item) => item.id === destination.id);
    return {
      active: over !== undefined && over === destination.id,
      onDragOver: (event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        if (over !== destination.id) setOver(destination.id);
      },
      onDragLeave: (event) => {
        // Moving onto a child of the target (an icon, the name) isn't leaving it.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (over === destination.id) setOver(undefined);
      },
      onDrop: (event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.stopPropagation();
        const items = dragged.current;
        stop();
        if (items) onMove(items, destination);
      },
    };
  }

  /** Props for an item: draggable, and a drop target if it's a folder. */
  function itemProps(item: DriveItem, pending: boolean): ItemElementProps {
    if (!enabled || pending) return {};
    const target =
      item.kind === "folder" ? dropTarget({ id: item.id, name: item.name }) : undefined;
    const { active, ...targetHandlers } = target ?? { active: false };
    return {
      draggable: true,
      onDragStart: (event) => {
        const items = selected.some((entry) => entry.id === item.id) ? selected : [item];
        if (items.length === 1) select(item);
        dragged.current = items;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(ITEMS_TYPE, items.map((entry) => entry.id).join(","));
        if (items.length > 1) showCount(event, items.length);
      },
      onDragEnd: stop,
      ...targetHandlers,
      ...(target && { "data-drop-target": active }),
    };
  }

  return { itemProps, dropTarget };
}

/** A small "3 items" badge under the pointer instead of a picture of one row. */
function showCount(event: DragEvent, count: number) {
  const badge = document.createElement("div");
  badge.textContent = `${String(count)} items`;
  badge.className =
    "fixed -top-40 left-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-float";
  document.body.append(badge);
  event.dataTransfer.setDragImage(badge, 16, 16);
  // The browser copies the picture when the drag starts; the element can go right after.
  requestAnimationFrame(() => {
    badge.remove();
  });
}
