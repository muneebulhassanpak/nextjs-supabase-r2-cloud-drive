"use client";

import { Loader2, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { suggestItems } from "@/app/drive/search-actions";
import { ItemIcon } from "@/components/drive/item-icon";
import { Input } from "@/components/ui/input";
import { MAX_QUERY_LENGTH, searchHref } from "@/lib/drive/search";
import type { DriveItem } from "@/lib/drive/types";
import { cn } from "@/lib/utils";

/** How long typing must pause before suggestions are fetched. */
const SUGGEST_DELAY_MS = 200;

/** Where a suggestion goes: a folder opens; a file opens in a preview over the results. */
export const itemHref = (item: DriveItem, query: string) =>
  item.kind === "folder"
    ? `/drive/folders/${item.id}`
    : `${searchHref({ q: query })}&open=${item.id}`;

/**
 * The search box in the top bar: suggestions while typing (a combobox: ↑ ↓ to pick, Enter to
 * open, Esc to close), and Enter on the text itself shows every result.
 */
export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onResults = pathname === "/drive/search";
  const [query, setQuery] = useState(onResults ? (params.get("q") ?? "") : "");
  const [suggestions, setSuggestions] = useState<DriveItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only the latest request's answer is shown; a slower earlier one is ignored.
  const latest = useRef(0);
  const listId = useId();

  // The box shows the search being looked at, and clears when leaving the results.
  const urlQuery = onResults ? (params.get("q") ?? "") : "";
  const [shown, setShown] = useState(urlQuery);
  if (shown !== urlQuery) {
    setShown(urlQuery);
    setQuery(urlQuery);
    setOpen(false);
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  function change(text: string) {
    setQuery(text);
    setActive(-1);
    clearTimeout(timer.current);
    const trimmed = text.trim();
    if (trimmed === "") {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    timer.current = setTimeout(() => {
      const request = ++latest.current;
      void suggestItems(trimmed).then((result) => {
        if (request !== latest.current) return;
        setSuggestions(result.ok ? result.data : []);
        setFailed(!result.ok);
        setLoading(false);
      });
    }, SUGGEST_DELAY_MS);
  }

  function go(href: string) {
    setOpen(false);
    clearTimeout(timer.current);
    latest.current += 1;
    router.push(href);
  }

  // While new suggestions load, the old ones are for different words: shown, but not picked.
  const pickable = open && !loading;

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter that confirms an input method's (IME) candidate isn't a search.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && pickable) {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp" && pickable) {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = pickable && active >= 0 ? suggestions[active] : undefined;
      const trimmed = query.trim();
      if (picked) go(itemHref(picked, trimmed));
      else if (trimmed) go(searchHref({ q: trimmed }));
    }
  }

  const showList = open && query.trim() !== "";
  return (
    <div className="relative max-w-xl flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        role="combobox"
        aria-label="Search in Lockerly"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${String(active)}` : undefined}
        placeholder="Search in Lockerly"
        autoComplete="off"
        maxLength={MAX_QUERY_LENGTH}
        className="pl-9"
        value={query}
        onChange={(event) => {
          change(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        // Leaving the box closes the list, after a click on it has landed.
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
      />
      {showList && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="max-h-80 overflow-y-auto p-1"
          >
            {suggestions.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={loading}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                  index === active ? "bg-accent" : "hover:bg-accent/60",
                  loading && "opacity-60",
                )}
                onMouseDown={(event) => {
                  // Keep focus in the box so the list doesn't close before the click.
                  event.preventDefault();
                }}
                onClick={() => {
                  if (!loading) go(itemHref(item, query.trim()));
                }}
              >
                <ItemIcon item={item} className="size-4 shrink-0" />
                <span className="truncate">{item.name}</span>
              </li>
            ))}
            {!loading && failed && (
              <li role="alert" className="px-2.5 py-2 text-sm text-destructive">
                Suggestions aren&apos;t loading. Press Enter to search.
              </li>
            )}
            {!loading && !failed && suggestions.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">No matches yet</li>
            )}
          </ul>
          <button
            type="button"
            className="flex w-full items-center gap-2 border-t px-3.5 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent/60"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => {
              go(searchHref({ q: query.trim() }));
            }}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            <span className="truncate">
              See all results for “<span className="text-foreground">{query.trim()}</span>”
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** What shows until the box can read the URL. */
export function SearchBoxFallback() {
  return (
    <div className="relative max-w-xl flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        aria-label="Search in Lockerly"
        placeholder="Search in Lockerly"
        className="pl-9"
        disabled
      />
    </div>
  );
}
