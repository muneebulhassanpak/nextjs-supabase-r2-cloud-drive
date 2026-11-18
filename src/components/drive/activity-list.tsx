"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { loadActivity } from "@/app/drive/search-actions";
import { Button } from "@/components/ui/button";
import {
  actorLabel,
  describeActivity,
  timeAgo,
  type ActivityCursor,
  type ActivityEntry,
} from "@/lib/drive/activity";

const exact = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
/**
 * What happened to an item, newest first; for a folder, to everything inside it too. Loads a page
 * at a time; the time shows exactly on hover.
 */
export function ActivityList({ itemId, currentUserId }: { itemId: string; currentUserId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [next, setNext] = useState<ActivityCursor | null>(null);
  const [error, setError] = useState<string>();
  // A failed "Show older" keeps what's shown and offers another try.
  const [moreError, setMoreError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    let current = true;
    startLoading(async () => {
      const result = await loadActivity(itemId, null);
      if (!current) return;
      if (result.ok) {
        setEntries(result.data.entries);
        setNext(result.data.next);
        setError(undefined);
      } else setError(result.error.message);
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [itemId]);

  function more() {
    if (!next) return;
    startLoading(async () => {
      const result = await loadActivity(itemId, next);
      if (result.ok) {
        setEntries((shown) => [...shown, ...result.data.entries]);
        setNext(result.data.next);
        setMoreError(undefined);
      } else setMoreError(result.error.message);
    });
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!loaded) {
    return (
      <div className="flex justify-center py-8" aria-label="Loading activity">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing has happened here yet.</p>;
  }
  return (
    <div className="grid gap-3">
      <ol aria-label="Activity" className="grid gap-4">
        {entries.map((entry) => (
          <li key={entry.id} className="grid gap-0.5 text-sm">
            <p className="wrap-anywhere">
              <span className="font-medium">{actorLabel(entry, currentUserId)}</span>{" "}
              {describeActivity(entry, itemId)}
            </p>
            <time
              dateTime={entry.createdAt}
              title={exact.format(new Date(entry.createdAt))}
              className="w-fit text-xs text-muted-foreground"
              suppressHydrationWarning
            >
              {timeAgo(entry.createdAt)}
            </time>
          </li>
        ))}
      </ol>
      {moreError && (
        <p role="alert" className="text-sm text-destructive">
          {moreError}
        </p>
      )}
      {next && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={loading}
          onClick={more}
        >
          {loading && <Loader2 className="animate-spin" />}
          {moreError ? "Try again" : "Show older"}
        </Button>
      )}
    </div>
  );
}
