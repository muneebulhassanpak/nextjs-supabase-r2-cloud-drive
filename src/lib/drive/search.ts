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
  /** Custom range, as yyyy-mm-dd (inclusive on both ends), in the time zone `tz`. */
  from: string | null;
  to: string | null;
  /** The searcher's time zone (IANA name), so their days are the ones counted. */
  tz: string | null;
}

/** Longest search the database accepts. */
export const MAX_QUERY_LENGTH = 100;

const DAY_MS = 86_400_000;
// A real calendar day: Date.parse would quietly turn 2026-02-31 into March 3.
const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
};

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value.length <= 64;
  } catch {
    return false;
  }
};

/** How far `zone`'s clocks are ahead of UTC at `time`, in ms. */
function zoneOffset(time: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(time));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wall - Math.floor(time / 1000) * 1000;
}

/** The instant a day starts in `zone` (UTC when there's no zone). */
function startOfDay(date: string, zone: string | null, extraDays = 0): string {
  const utc = Date.parse(`${date}T00:00:00Z`) + extraDays * DAY_MS;
  if (!zone) return new Date(utc).toISOString();
  // Once with the offset at UTC midnight, then again in case a clock change falls in between.
  const guess = utc - zoneOffset(utc, zone);
  return new Date(utc - zoneOffset(guess, zone)).toISOString();
}

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
  const tz = one(params.tz) ?? "";
  return {
    q: (one(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH),
    type: pick(TYPE_FILTERS, one(params.type)) ?? null,
    owner: pick(OWNER_FILTERS, one(params.owner)) ?? "any",
    modified: pick(MODIFIED_FILTERS, one(params.modified)) ?? "any",
    from: isDate(from) ? from : null,
    to: isDate(to) ? to : null,
    tz: isTimeZone(tz) ? tz : null,
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
    if (params.tz && (params.from || params.to)) query.set("tz", params.tz);
  }
  return `/drive/search?${query.toString()}`;
}

/** The modified window as timestamps: from (inclusive) and to (exclusive). */
export function modifiedRange(
  params: Pick<SearchParams, "modified" | "from" | "to" | "tz">,
  now = new Date(),
): { from: string | null; to: string | null } {
  if (params.modified === "custom") {
    return {
      from: params.from ? startOfDay(params.from, params.tz) : null,
      // The "to" day is included: the range ends as the next day starts.
      to: params.to ? startOfDay(params.to, params.tz, 1) : null,
    };
  }
  const days = MODIFIED_FILTERS.find((option) => option.value === params.modified)?.days ?? null;
  return { from: days ? new Date(now.getTime() - days * DAY_MS).toISOString() : null, to: null };
}
