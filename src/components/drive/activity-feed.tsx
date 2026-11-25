"use client";

import { History, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import { loadMyActivity } from "@/app/drive/search-actions";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  actorLabel,
  describeActivity,
  type ActivityCursor,
  type ActivityEntry,
} from "@/lib/drive/activity";
import {
  ACTIVITY_TYPES,
  ACTIVITY_WHO,
  activityHref,
  groupByDay,
  type ActivityFilters,
} from "@/lib/drive/activity-filters";
import { searchHref } from "@/lib/drive/search";

import { ACTIVITY_ICONS } from "./activity-icons";
import { FilterMenu } from "./filter-menu";
import { formatDateTime, formatTime } from "./format";

const subscribeNever = () => () => undefined;

/** Where an entry's item can be opened, if it still can. */
function itemHref({ item }: ActivityEntry): string | null {
  if (!item?.id || item.place === "none") return null;
  if (item.place === "trash") return "/drive/trash";
  if (item.kind === "folder") return `/drive/folders/${item.id}`;
  // Search opens a file wherever it is, in a folder the person may not see.
  // (By whole characters, well within what a search may be.)
  const query = Array.from(item.name).slice(0, 50).join("");
  return `${searchHref({ q: query })}&open=${item.id}`;
}

/** Everything that happened, by day, newest first, with filters in the URL. */
export function ActivityFeed({
  filters,
  initial,
  currentUserId,
}: {
  filters: ActivityFilters;
  initial: { entries: ActivityEntry[]; next: ActivityCursor | null };
  currentUserId: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initial.entries);
  const [next, setNext] = useState(initial.next);
  const [error, setError] = useState<string>();
  const [loading, startLoading] = useTransition();
  // Days and times are the viewer's, which the server doesn't know.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const filtered = filters.type !== null || filters.who !== "any";
  const groups = hydrated ? groupByDay(entries, new Date()) : [{ label: "", entries }];

  const apply = (changes: Partial<ActivityFilters>) => {
    router.push(activityHref({ ...filters, ...changes }));
  };

  function more() {
    if (!next) return;
    startLoading(async () => {
      const result = await loadMyActivity(filters, next);
      if (result.ok) {
        setEntries((shown) => [...shown, ...result.data.entries]);
        setNext(result.data.next);
        setError(undefined);
      } else setError(result.error.message);
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="px-1.5 py-1 text-xl font-semibold tracking-tight sm:text-2xl">Activity</h1>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <FilterMenu
          label="What"
          value={filters.type ?? "any"}
          options={[{ value: "any", label: "Everything" }, ...ACTIVITY_TYPES]}
          active={filters.type !== null}
          onChange={(value) => {
            apply({ type: value === "any" ? null : (value as ActivityFilters["type"]) });
          }}
        />
        <FilterMenu
          label="Who"
          value={filters.who}
          options={ACTIVITY_WHO}
          active={filters.who !== "any"}
          onChange={(value) => {
            apply({ who: value as ActivityFilters["who"] });
          }}
        />
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              apply({ type: null, who: "any" });
            }}
          >
            <X />
            Clear filters
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title={filtered ? "Nothing matches" : "Nothing has happened yet"}
        >
          {filtered
            ? "Try other filters."
            : "Uploads, changes, sharing and everything else will show up here."}
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.label} aria-label={group.label || "Activity"} className="grid gap-2">
            <h2 className="min-h-5 px-1.5 text-sm font-medium text-muted-foreground">
              {group.label}
            </h2>
            <ol className="overflow-hidden rounded-2xl border bg-card">
              {group.entries.map((entry) => (
                <FeedRow key={entry.id} entry={entry} currentUserId={currentUserId} />
              ))}
            </ol>
          </section>
        ))
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {next && (
        <Button variant="outline" className="self-center" disabled={loading} onClick={more}>
          {loading && <Loader2 className="animate-spin" />}
          {error ? "Try again" : "Show older"}
        </Button>
      )}
    </div>
  );
}

function FeedRow({ entry, currentUserId }: { entry: ActivityEntry; currentUserId: string }) {
  const Icon = ACTIVITY_ICONS[entry.action];
  const href = itemHref(entry);
  const line = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 wrap-anywhere">
        <span className="font-medium">{actorLabel(entry, currentUserId)}</span>{" "}
        {describeActivity(entry, null)}
      </span>
      <time
        dateTime={entry.createdAt}
        title={formatDateTime(entry.createdAt)}
        className="shrink-0 text-xs text-muted-foreground"
        suppressHydrationWarning
      >
        {formatTime(entry.createdAt)}
      </time>
    </>
  );
  const className = "flex min-h-14 items-center gap-3 px-4 py-2.5 text-sm";
  return (
    <li className="border-b last:border-b-0">
      {href ? (
        <Link
          href={href}
          prefetch={false}
          className={`${className} outline-none hover:bg-accent/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset`}
        >
          {line}
        </Link>
      ) : (
        <div className={className}>{line}</div>
      )}
    </li>
  );
}
