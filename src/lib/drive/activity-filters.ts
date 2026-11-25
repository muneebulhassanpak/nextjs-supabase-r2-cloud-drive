import { localDay } from "./days";

// Filters on the Activity screen, kept in the URL (?type=…&who=…).

export const ACTIVITY_TYPES = [
  { value: "files", label: "Files and folders" },
  { value: "sharing", label: "Sharing" },
  { value: "trash", label: "Trash" },
  { value: "account", label: "Account" },
] as const;

export const ACTIVITY_WHO = [
  { value: "any", label: "Anyone" },
  { value: "me", label: "By me" },
  { value: "others", label: "By others" },
] as const;

export interface ActivityFilters {
  type: (typeof ACTIVITY_TYPES)[number]["value"] | null;
  who: (typeof ACTIVITY_WHO)[number]["value"];
}

/** Reads the filters from a page's search params; anything unknown falls back to the default. */
export function parseActivityFilters(
  params: Record<string, string | string[] | undefined>,
): ActivityFilters {
  return {
    type: ACTIVITY_TYPES.find((option) => option.value === params.type)?.value ?? null,
    who: ACTIVITY_WHO.find((option) => option.value === params.who)?.value ?? "any",
  };
}

/** The Activity screen's URL, leaving out defaults. */
export function activityHref({ type, who }: ActivityFilters): string {
  const query = new URLSearchParams();
  if (type) query.set("type", type);
  if (who !== "any") query.set("who", who);
  const text = query.toString();
  return text ? `/drive/activity?${text}` : "/drive/activity";
}

/** Entries (newest first) under the day they happened on, on the viewer's calendar. */
export function groupByDay<T extends { createdAt: string }>(
  entries: readonly T[],
  now: Date,
): { label: string; entries: T[] }[] {
  const groups: { label: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const label = localDay(new Date(entry.createdAt), now);
    const last = groups.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}
