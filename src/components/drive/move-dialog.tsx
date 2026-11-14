"use client";

import { ChevronRight, Folder, Loader2, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { findFolders, getMoveChoices } from "@/app/drive/item-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { DriveItem, FolderChoices } from "@/lib/drive/types";
import { cn } from "@/lib/utils";

/** Where things are being moved to: a folder, or the top of My Drive (id null). */
export interface Destination {
  id: string | null;
  name: string;
}

const SEARCH_DELAY_MS = 250;

/**
 * "Move to": a small folder browser. It opens at the folder the items are in; people step into
 * folders, back up with the path, or search by name, then move the items to where they are.
 * Only folders they can add to accept the move; the database checks again.
 */
export function MoveDialog({
  items,
  from,
  onOpenChange,
  onMove,
}: {
  /** What's being moved; the dialog is open while there is something. */
  items: DriveItem[];
  /** The folder they're in (null: the top of My Drive). */
  from: string | null;
  onOpenChange: (open: boolean) => void;
  onMove: (destination: Destination) => void;
}) {
  return (
    <Dialog open={items.length > 0} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        {items.length > 0 && (
          <Picker
            items={items}
            from={from}
            onMove={onMove}
            onCancel={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  items,
  from,
  onMove,
  onCancel,
}: {
  items: DriveItem[];
  from: string | null;
  onMove: (destination: Destination) => void;
  onCancel: () => void;
}) {
  const [location, setLocation] = useState<string | null>(from);
  const [choices, setChoices] = useState<FolderChoices>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>();
  const [loading, startLoading] = useTransition();
  const moving = new Set(items.map((item) => item.id));

  useEffect(() => {
    let current = true;
    startLoading(async () => {
      const result = await getMoveChoices(location);
      if (!current) return;
      if (result.ok) {
        setChoices(result.data);
        setError(undefined);
      } else setError(result.error.message);
    });
    return () => {
      current = false;
    };
  }, [location]);

  useEffect(() => {
    const text = query.trim();
    if (!text) return;
    let current = true;
    const timer = setTimeout(() => {
      void findFolders(text).then((result) => {
        if (current) setResults(result.ok ? result.data : []);
      });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  function go(folderId: string | null) {
    setQuery("");
    setResults(undefined);
    setLocation(folderId);
  }

  const searching = query.trim().length > 0;
  const here: Destination = { id: location, name: choices?.folder?.name ?? "My Drive" };
  // The listing on screen is for `location` once loading has caught up with it.
  const ready = choices !== undefined && (choices.folder?.id ?? null) === location;
  const alreadyHere = items.every((item) => item.parentId === location);
  // Here, or anywhere inside a folder being moved (search can jump straight in).
  const intoItself =
    location !== null &&
    (moving.has(location) || (ready && choices.crumbs.some((crumb) => moving.has(crumb.id))));
  const canMove = ready && choices.canEdit && !alreadyHere && !intoItself && !searching;
  const reason = !ready
    ? undefined
    : intoItself
      ? "A folder can't go inside itself."
      : !choices.canEdit
        ? "You can only view this folder."
        : alreadyHere
          ? "Already here."
          : undefined;

  const folders = searching ? results : ready ? choices.folders : undefined;
  const title =
    items.length === 1 ? `Move “${items[0]?.name ?? ""}”` : `Move ${String(items.length)} items`;

  return (
    <>
      <DialogHeader className="gap-3 border-b p-6 pb-4">
        <DialogTitle className="truncate pr-6">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a folder, then move the items there.
        </DialogDescription>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (!event.target.value.trim()) setResults(undefined);
            }}
            placeholder="Search folders"
            aria-label="Search folders"
            className="pl-9"
          />
        </div>
        {!searching && (
          <nav aria-label="Folder path" className="min-w-0">
            <ol className="flex items-center gap-0.5 overflow-x-auto text-sm whitespace-nowrap">
              <PathStep
                label="My Drive"
                current={location === null}
                onClick={() => {
                  go(null);
                }}
              />
              {ready &&
                choices.crumbs.map((crumb) => (
                  <PathStep
                    key={crumb.id}
                    label={crumb.name}
                    separator
                    onClick={() => {
                      go(crumb.id);
                    }}
                  />
                ))}
              {ready && choices.folder && (
                <PathStep label={choices.folder.name} separator current />
              )}
            </ol>
          </nav>
        )}
      </DialogHeader>

      <div className="h-72 overflow-y-auto p-2" aria-busy={loading}>
        {error ? (
          <p className="p-4 text-sm text-destructive">{error}</p>
        ) : folders === undefined ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading folders…
          </p>
        ) : folders.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {searching ? "No folders match." : "No folders in here."}
          </p>
        ) : (
          <ul className="grid gap-0.5" aria-label={searching ? "Matching folders" : "Folders"}>
            {folders.map((folder) => {
              const disabled = moving.has(folder.id);
              return (
                <li key={folder.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    title={disabled ? "A folder can't go inside itself" : undefined}
                    onClick={() => {
                      go(folder.id);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Folder className="size-4 shrink-0 fill-current text-file-folder" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="sr-only">Open</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The content has no padding here, so the footer needs none of the usual pull to the edges. */}
      <DialogFooter className="m-0 items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {reason}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canMove}
            onClick={() => {
              onMove(here);
            }}
          >
            Move here
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function PathStep({
  label,
  current = false,
  separator = false,
  onClick,
}: {
  label: string;
  current?: boolean;
  separator?: boolean;
  onClick?: () => void;
}) {
  return (
    <li className={cn("flex min-w-0 items-center gap-0.5", !current && "shrink-0")}>
      {separator && (
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      {current ? (
        <span aria-current="location" className="truncate px-1.5 py-1 font-medium">
          {label}
        </span>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="truncate rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {label}
        </button>
      )}
    </li>
  );
}
