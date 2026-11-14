"use client";

import { EllipsisVertical } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { DriveItem } from "@/lib/drive/types";
import { thumbnailSrc } from "@/lib/files/api";
import { hasThumbnail } from "@/lib/files/preview";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

import { formatModified } from "./format";
import { ItemIcon } from "./item-icon";

import type { ComponentProps, KeyboardEvent, MouseEvent, ReactNode } from "react";

export interface ItemHandlers {
  onClick: (event: MouseEvent, item: DriveItem) => void;
  onOpen: (item: DriveItem) => void;
  onKeyDown: (event: KeyboardEvent, item: DriveItem) => void;
  /** The "more" button: a dropdown on desktop, an action sheet on phones. */
  renderMore: (item: DriveItem, trigger: ReactNode) => ReactNode;
  /** Wraps an item in its right-click menu. */
  wrapContextMenu: (item: DriveItem, content: ReactNode) => ReactNode;
}

interface ViewProps extends ItemHandlers {
  items: DriveItem[];
  selected: Set<string>;
  pending: Set<string>;
  currentUserId: string;
}

/** The "more" button. Passes through what a menu trigger adds (handlers, aria, ref). */
function MoreButton({
  item,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { item: DriveItem }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-10 shrink-0 md:size-8"
      {...props}
      onClick={(event) => {
        // The row would select (or open) the item too.
        event.stopPropagation();
        onClick?.(event);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
    >
      <EllipsisVertical />
      <span className="sr-only">More actions for {item.name}</span>
    </Button>
  );
}

function rowProps(item: DriveItem, props: ViewProps, className: string) {
  const isSelected = props.selected.has(item.id);
  const isPending = props.pending.has(item.id);
  return {
    role: "row",
    tabIndex: isPending ? -1 : 0,
    "aria-selected": isSelected,
    "aria-disabled": isPending || undefined,
    "aria-label": item.name,
    "data-item-id": item.id,
    onClick: (event: MouseEvent) => {
      if (!isPending) props.onClick(event, item);
    },
    onDoubleClick: () => {
      if (!isPending) props.onOpen(item);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (!isPending) props.onKeyDown(event, item);
    },
    className: cn(
      "group outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none",
      isSelected ? "bg-primary/10 dark:bg-primary/20" : "hover:bg-accent/60",
      isPending && "pointer-events-none opacity-60",
      className,
    ),
  } as const;
}

export function ListView(props: ViewProps) {
  return (
    <div role="grid" aria-label="Files and folders" aria-multiselectable className="text-sm">
      <div role="rowgroup">
        <div
          role="row"
          className="grid grid-cols-[1fr_auto] items-center gap-4 border-b px-3 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_8rem_auto] lg:grid-cols-[1fr_10rem_8rem_6rem_auto]"
        >
          <div role="columnheader">Name</div>
          <div role="columnheader" className="hidden lg:block">
            Owner
          </div>
          <div role="columnheader" className="hidden sm:block">
            Modified
          </div>
          <div role="columnheader" className="hidden lg:block">
            Size
          </div>
          <div role="columnheader" className="w-10 md:w-8">
            <span className="sr-only">Actions</span>
          </div>
        </div>
      </div>
      <div role="rowgroup">
        {props.items.map((item) =>
          props.wrapContextMenu(
            item,
            <div
              key={item.id}
              {...rowProps(
                item,
                props,
                "grid min-h-14 grid-cols-[1fr_auto] items-center gap-4 border-b px-3 sm:grid-cols-[1fr_8rem_auto] md:min-h-12 lg:grid-cols-[1fr_10rem_8rem_6rem_auto]",
              )}
            >
              <div role="gridcell" className="flex min-w-0 items-center gap-3">
                <ItemIcon item={item} className="size-5 shrink-0" />
                <span className="truncate font-medium">{item.name}</span>
              </div>
              <div role="gridcell" className="hidden truncate text-muted-foreground lg:block">
                {item.owner.id === props.currentUserId
                  ? "me"
                  : (item.owner.name ?? item.owner.email ?? "—")}
              </div>
              <div role="gridcell" className="hidden text-muted-foreground sm:block">
                <time dateTime={item.updatedAt} suppressHydrationWarning>
                  {formatModified(item.updatedAt)}
                </time>
              </div>
              <div role="gridcell" className="hidden text-muted-foreground lg:block">
                {item.size === null ? "—" : formatBytes(item.size)}
              </div>
              <div role="gridcell">{props.renderMore(item, <MoreButton item={item} />)}</div>
            </div>,
          ),
        )}
      </div>
    </div>
  );
}

export function GridView(props: ViewProps) {
  const folders = props.items.filter((item) => item.kind === "folder");
  const files = props.items.filter((item) => item.kind === "file");
  const section = (title: string, items: DriveItem[]) =>
    items.length > 0 && (
      <div role="rowgroup" aria-label={title} className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) =>
            props.wrapContextMenu(
              item,
              <div
                key={item.id}
                {...rowProps(
                  item,
                  props,
                  cn(
                    "flex min-w-0 flex-col rounded-xl border bg-card p-1.5",
                    props.selected.has(item.id) && "border-primary/40",
                  ),
                )}
              >
                {item.kind === "file" && (
                  <div
                    role="gridcell"
                    className="mb-1 grid aspect-[4/3] place-items-center rounded-lg bg-muted"
                  >
                    <TilePicture item={item} />
                  </div>
                )}
                <div role="gridcell" className="flex min-w-0 items-center gap-2 pl-2">
                  <ItemIcon item={item} className="size-4 shrink-0" />
                  <span className="truncate text-sm font-medium">{item.name}</span>
                  <span className="ml-auto">
                    {props.renderMore(item, <MoreButton item={item} />)}
                  </span>
                </div>
              </div>,
            ),
          )}
        </div>
      </div>
    );
  return (
    <div role="grid" aria-label="Files and folders" aria-multiselectable className="grid gap-6">
      {section("Folders", folders)}
      {section("Files", files)}
    </div>
  );
}

/** An image file's picture (loaded only when scrolled into view), or the icon for its type. */
function TilePicture({ item }: { item: DriveItem }) {
  const [failed, setFailed] = useState(false);
  if (failed || !hasThumbnail(item)) return <ItemIcon item={item} className="size-10" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed storage link
    <img
      src={thumbnailSrc(item.id)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        setFailed(true);
      }}
      className="size-full rounded-lg object-cover"
    />
  );
}
