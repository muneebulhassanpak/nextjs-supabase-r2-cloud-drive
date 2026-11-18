import type { ItemCategory } from "./types";

// Search filters, kept in the URL (?q=…&type=…&owner=…&modified=…&from=…&to=…) so a search can
// be shared, bookmarked and stepped back to.

export const TYPE_FILTERS = [
  { value: "folder", label: "Folders" },
  { value: "document", label: "Documents" },
  { value: "spreadsheet", label: "Spreadsheets" },
  { value: "presentation", label: "Presentations" },
  { value: "pdf", label: "PDFs" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "text", label: "Text and code" },
  { value: "archive", label: "Archives" },
] as const satisfies readonly { value: "folder" | ItemCategory; label: string }[];

export const OWNER_FILTERS = [
  { value: "any", label: "Anyone" },
  { value: "me", label: "Owned by me" },
  { value: "others", label: "Not owned by me" },
] as const;

/** Rolling windows, so they mean the same in every time zone; "custom" uses from/to. */
export const MODIFIED_FILTERS = [
  { value: "any", label: "Any time", days: null },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "365d", label: "Last 12 months", days: 365 },
  { value: "custom", label: "Custom range", days: null },
] as const;

export type TypeFilter = (typeof TYPE_FILTERS)[number]["value"];
export type OwnerFilter = (typeof OWNER_FILTERS)[number]["value"];
export type ModifiedFilter = (typeof MODIFIED_FILTERS)[number]["value"];

export interface SearchParams {
  q: string;
  type: TypeFilter | null;
  owner: OwnerFilter;
  modified: ModifiedFilter;
  /** Custom range, as yyyy-mm-dd (inclusive on both ends). */
  from: string | null;
  to: string | null;
}

/** Longest search the database accepts. */
export const MAX_QUERY_LENGTH = 100;

const DAY_MS = 86_400_000;
const isDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function pick<T extends string>(options: readonly { value: T }[], value: string | undefined) {
  return options.find((option) => option.value === value)?.value;
}

/** Reads the filters from a page's search params; anything unknown falls back to the default. */
export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
): SearchParams {
  const from = one(params.from) ?? "";
  const to = one(params.to) ?? "";
  return {
    q: (one(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    type: pick(TYPE_FILTERS, one(params.type)) ?? null,
    owner: pick(OWNER_FILTERS, one(params.owner)) ?? "any",
    modified: pick(MODIFIED_FILTERS, one(params.modified)) ?? "any",
    from: isDate(from) ? from : null,
    to: isDate(to) ? to : null,
  };
}

/** The URL for a search, leaving out defaults so links stay short. */
export function searchHref(params: Partial<SearchParams> & { q: string }): string {
  const query = new URLSearchParams({ q: params.q });
  if (params.type) query.set("type", params.type);
  if (params.owner && params.owner !== "any") query.set("owner", params.owner);
  if (params.modified && params.modified !== "any") query.set("modified", params.modified);
  if (params.modified === "custom") {
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
  }
  return `/drive/search?${query.toString()}`;
}

/** The modified window as timestamps: from (inclusive) and to (exclusive). */
export function modifiedRange(
  params: Pick<SearchParams, "modified" | "from" | "to">,
  now = new Date(),
): { from: string | null; to: string | null } {
  if (params.modified === "custom") {
    return {
      from: params.from ? new Date(`${params.from}T00:00:00Z`).toISOString() : null,
      // The "to" day is included: the range ends at the start of the next day.
      to: params.to ? new Date(Date.parse(`${params.to}T00:00:00Z`) + DAY_MS).toISOString() : null,
    };
  }
  const days = MODIFIED_FILTERS.find((option) => option.value === params.modified)?.days ?? null;
  return { from: days ? new Date(now.getTime() - days * DAY_MS).toISOString() : null, to: null };
}
