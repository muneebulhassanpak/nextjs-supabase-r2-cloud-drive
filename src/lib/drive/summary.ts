import type { DriveItem } from "./types";

/** What a selection adds up to. Folders have no size of their own, so only files count in bytes. */
export function summarize(items: Pick<DriveItem, "kind" | "size">[]): {
  folders: number;
  files: number;
  bytes: number;
} {
  const folders = items.filter((item) => item.kind === "folder").length;
  return {
    folders,
    files: items.length - folders,
    bytes: items.reduce((total, item) => total + (item.size ?? 0), 0),
  };
}

/** Folders, then files, each in the order given: how the grid lays them out. */
export function foldersFirst<T extends Pick<DriveItem, "kind">>(items: T[]): T[] {
  return [
    ...items.filter((item) => item.kind === "folder"),
    ...items.filter((item) => item.kind === "file"),
  ];
}

/**
 * Where an item stands among the ones that can be stepped through (not ones still being created),
 * and its neighbour in either direction. Null if it isn't among them.
 */
export function positionOf(
  items: Pick<DriveItem, "id">[],
  id: string,
): { index: number; total: number; previous: string | null; next: string | null } | null {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  return {
    index,
    total: items.length,
    previous: items[index - 1]?.id ?? null,
    next: items[index + 1]?.id ?? null,
  };
}
