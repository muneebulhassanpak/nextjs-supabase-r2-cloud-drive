import type { DriveItem } from "./types";

export const SORT_KEYS = ["name", "modified", "size"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortOrder = "asc" | "desc";
export interface Sort {
  key: SortKey;
  order: SortOrder;
}

export const DEFAULT_SORT: Sort = { key: "name", order: "asc" };

/** The sort from the URL (`?sort=size&order=desc`); anything unknown falls back to the default. */
export function parseSort(params: { sort?: unknown; order?: unknown }): Sort {
  const key = SORT_KEYS.find((k) => k === params.sort) ?? DEFAULT_SORT.key;
  // Newest first and largest first are what people usually want when they pick those.
  const fallbackOrder: SortOrder = key === "name" ? "asc" : "desc";
  const order = params.order === "asc" || params.order === "desc" ? params.order : fallbackOrder;
  return { key, order };
}

// Natural order: "File 2" before "File 10"; case and accents don't split names apart.
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Folders first, then files, each sorted by the chosen key; ties go by name. */
export function sortItems<T extends Pick<DriveItem, "kind" | "name" | "size" | "updatedAt">>(
  items: readonly T[],
  { key, order }: Sort,
): T[] {
  const direction = order === "asc" ? 1 : -1;
  const byName = (a: T, b: T) => collator.compare(a.name, b.name);
  const byKey = (a: T, b: T) => {
    if (key === "modified") return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
    if (key === "size") return (a.size ?? 0) - (b.size ?? 0);
    return byName(a, b);
  };
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return byKey(a, b) * direction || byName(a, b);
  });
}
