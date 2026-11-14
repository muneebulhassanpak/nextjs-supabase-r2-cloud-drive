"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DriveItem } from "@/lib/drive/types";
import { formatBytes } from "@/lib/format";

import { formatModified } from "./format";
import { ItemIcon, itemTypeLabel } from "./item-icon";

/** What the selected item is: type, size, owner, modified, location. */
export function DetailsPanel({
  item,
  selectedCount,
  location,
  currentUserId,
  onClose,
  showClose = true,
}: {
  item: DriveItem | null;
  selectedCount: number;
  location: string;
  currentUserId: string;
  onClose: () => void;
  showClose?: boolean;
}) {
  return (
    // minmax(0, 1fr): a long name must wrap inside the panel, not stretch it past its width.
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 font-medium wrap-anywhere">{item ? item.name : "Details"}</h2>
        {showClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
            <span className="sr-only">Close details</span>
          </Button>
        )}
      </div>
      {item ? (
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
            <dt className="text-muted-foreground">Location</dt>
            <dd className="truncate">{location}</dd>
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
