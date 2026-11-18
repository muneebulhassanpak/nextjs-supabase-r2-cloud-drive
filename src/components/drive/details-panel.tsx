"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PENDING_PREFIX, type DriveItem } from "@/lib/drive/types";
import { formatBytes } from "@/lib/format";

import { ActivityList } from "./activity-list";
import { formatModified } from "./format";
import { ItemIcon, itemTypeLabel } from "./item-icon";

/**
 * The selected item: what it is (type, size, owner, modified, location), and what happened to it.
 * With nothing selected in a folder, the Activity tab shows the folder's.
 */
export function DetailsPanel({
  item,
  selectedCount,
  location,
  folder,
  currentUserId,
  onClose,
  showClose = true,
}: {
  item: DriveItem | null;
  selectedCount: number;
  /** The folder it's in, when the page is a folder (collections span many). */
  location?: string | undefined;
  /** The folder being looked at, if any. */
  folder?: { id: string; name: string } | null;
  currentUserId: string;
  onClose: () => void;
  showClose?: boolean;
}) {
  const [tab, setTab] = useState<"details" | "activity">("details");
  const subject = item ?? (selectedCount === 0 ? (folder ?? null) : null);
  const title = item?.name ?? (tab === "activity" && subject ? subject.name : "Details");
  return (
    // minmax(0, 1fr): a long name must wrap inside the panel, not stretch it past its width.
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-medium wrap-anywhere">{title}</h2>
        {showClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
            <span className="sr-only">Close details</span>
          </Button>
        )}
      </div>
      <div
        role="tablist"
        aria-label="Show"
        className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm"
      >
        {(["details", "activity"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={
              tab === name
                ? "rounded-md bg-background px-3 py-1.5 font-medium shadow-sm"
                : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
            }
            onClick={() => {
              setTab(name);
            }}
          >
            {name === "details" ? "Details" : "Activity"}
          </button>
        ))}
      </div>
      {tab === "activity" ? (
        subject?.id.startsWith(PENDING_PREFIX) ? (
          <p className="text-sm text-muted-foreground">Nothing has happened here yet.</p>
        ) : subject ? (
          // Reloads when the item changes (a rename made while the tab is open, say).
          <ActivityList
            key={`${subject.id}:${item?.updatedAt ?? ""}`}
            itemId={subject.id}
            currentUserId={currentUserId}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {selectedCount > 1
              ? "Select one item to see what happened to it."
              : "Select a file or folder to see what happened to it."}
          </p>
        )
      ) : item ? (
        <>
          <div className="grid aspect-video place-items-center rounded-xl bg-muted">
            <ItemIcon item={item} className="size-12" />
          </div>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{itemTypeLabel(item)}</dd>
            {item.size !== null && (
              <>
                <dt className="text-muted-foreground">Size</dt>
                <dd>{formatBytes(item.size)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="truncate">
              {item.owner.id === currentUserId
                ? "You"
                : (item.owner.name ?? item.owner.email ?? "Someone else")}
            </dd>
            <dt className="text-muted-foreground">Modified</dt>
            <dd>
              <time dateTime={item.updatedAt} suppressHydrationWarning>
                {formatModified(item.updatedAt)}
              </time>
            </dd>
            {item.trashedAt && (
              <>
                <dt className="text-muted-foreground">Trashed</dt>
                <dd>
                  <time dateTime={item.trashedAt} suppressHydrationWarning>
                    {formatModified(item.trashedAt)}
                  </time>
                </dd>
              </>
            )}
            {location && (
              <>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="truncate">{location}</dd>
              </>
            )}
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {selectedCount > 1
            ? `${String(selectedCount)} items selected.`
            : "Select a file or folder to see its details."}
        </p>
      )}
    </div>
  );
}
