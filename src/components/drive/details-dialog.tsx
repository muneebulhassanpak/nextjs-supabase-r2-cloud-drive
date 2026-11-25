"use client";

import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  HardDrive,
  Layers,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import { Tabs } from "radix-ui";
import { useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { noFileDrops } from "@/components/files/no-file-drops";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { summarize } from "@/lib/drive/summary";
import type { DriveItem } from "@/lib/drive/types";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

import { AccessSummary } from "./access-summary";
import { ActivityList } from "./activity-list";
import { formatDateTime } from "./format";
import { ItemIcon, itemTypeLabel } from "./item-icon";
import { ItemPicture } from "./item-picture";

import type { ItemAction } from "./item-actions";

/** The actions offered as buttons here; the rest stay in the item's menu. */
const QUICK_ACTIONS = new Set<ItemAction["id"]>([
  "open",
  "download",
  "share",
  "rename",
  "star",
  "unstar",
  "restore",
]);

export interface DetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What's selected. With nothing selected, the window is about `folder`. */
  selected: DriveItem[];
  /** The folder being looked at, if any, and how many things it holds. */
  folder: { id: string; name: string; count: number } | null;
  /** The folder the selection is in, when the page is a folder (collections span many). */
  location?: string | undefined;
  currentUserId: string;
  actions: ItemAction[];
  onAction: (action: ItemAction["id"]) => void;
  /** Where the item stands among the ones on screen, to step through them. */
  position: { index: number; total: number } | null;
  onStep: (by: 1 | -1) => void;
  /** Changes when access has changed, to load it and the activity again. */
  accessVersion: number;
  /** Gets the focus on closing when there's no item to go back to. */
  returnFocus: RefObject<HTMLElement | null>;
}

/**
 * About the selected item: what it looks like, its facts, who has access and what happened to it.
 * A window on computers (← and → step through the items) and a bottom sheet on phones.
 */
export function DetailsDialog({ open, onOpenChange, returnFocus, ...props }: DetailsDialogProps) {
  const { selected, position, onStep } = props;
  const title = useRef<HTMLHeadingElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    // The tabs use the arrows too, and say so by preventing the default.
    if (event.defaultPrevented || !position || event.metaKey || event.ctrlKey || event.altKey)
      return;
    if (event.key === "ArrowLeft") onStep(-1);
    else if (event.key === "ArrowRight") onStep(1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "grid-cols-[minmax(0,1fr)] gap-0 overflow-y-auto rounded-3xl p-0 shadow-float sm:max-w-3xl",
          "max-md:top-auto max-md:bottom-0 max-md:max-h-[88dvh] max-md:max-w-full max-md:translate-y-0 max-md:rounded-b-none",
          "md:h-[min(35rem,88dvh)] md:overflow-hidden",
          // Closes at once: its item may already be gone, leaving nothing to fade out.
          "data-closed:animate-none",
          selected.length <= 1 && "md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]",
          selected.length > 1 && "md:h-auto md:max-w-md",
        )}
        onKeyDown={onKeyDown}
        {...noFileDrops}
        // Reading starts at the title, not at whichever button comes first.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // Back to the item, which may not be the one the window was opened on.
          const id = selected[0]?.id;
          const row =
            id === undefined ? null : document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
          event.preventDefault();
          (row ?? returnFocus.current)?.focus();
        }}
      >
        {selected.length > 1 ? (
          <Summary items={selected} titleRef={title} />
        ) : (
          <Subject {...props} titleRef={title} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type TitleRef = RefObject<HTMLHeadingElement | null>;

function Subject({
  selected,
  folder,
  location,
  currentUserId,
  actions,
  onAction,
  position,
  onStep,
  accessVersion,
  titleRef,
}: Omit<DetailsDialogProps, "open" | "onOpenChange" | "returnFocus"> & { titleRef: TitleRef }) {
  const [tab, setTab] = useState("details");
  const item = selected[0] ?? null;
  const subject = item ?? folder;
  if (!subject) return null;

  const size = item?.size ?? null;
  const kind = item ? itemTypeLabel(item) : "Folder";
  const subtitle = [
    kind,
    size === null ? null : formatBytes(size),
    item ? null : countLabel(folder?.count ?? 0),
  ].filter(Boolean);
  const quick = actions.filter((action) => QUICK_ACTIONS.has(action.id));

  return (
    <>
      <div className="relative flex min-h-48 flex-col overflow-hidden bg-canvas max-md:h-52 md:border-r">
        <div aria-hidden className="absolute inset-0 bg-grid opacity-60" />
        <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center p-6 max-md:p-4">
          <ItemPicture key={subject.id} item={item ?? { id: subject.id, kind: "folder" }} />
        </div>
        {position && position.total > 1 && (
          <div className="relative flex items-center justify-center gap-2 pb-4 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon-sm"
              // Not `disabled`, which would drop the focus, and the arrow keys with it.
              aria-disabled={position.index === 0}
              className="aria-disabled:opacity-40"
              onClick={() => {
                onStep(-1);
              }}
            >
              <ChevronLeft />
              <span className="sr-only">Previous item</span>
            </Button>
            <span className="tabular-nums">
              {position.index + 1} of {position.total}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-disabled={position.index === position.total - 1}
              className="aria-disabled:opacity-40"
              onClick={() => {
                onStep(1);
              }}
            >
              <ChevronRight />
              <span className="sr-only">Next item</span>
            </Button>
          </div>
        )}
      </div>

      <Tabs.Root value={tab} onValueChange={setTab} className="flex min-h-0 min-w-0 flex-col">
        <div className="grid gap-4 px-6 pt-6">
          <div className="grid gap-1 pr-8">
            {/* Very long names scroll rather than push everything else out of the window. */}
            <DialogTitle
              ref={titleRef}
              tabIndex={-1}
              className="max-h-24 overflow-y-auto text-title wrap-anywhere outline-none"
            >
              {subject.name}
            </DialogTitle>
            <DialogDescription>{subtitle.join(" · ")}</DialogDescription>
          </div>
          {quick.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quick.map((action, index) => (
                <QuickAction
                  key={action.id}
                  action={action}
                  primary={index === 0}
                  onClick={() => {
                    onAction(action.id);
                  }}
                />
              ))}
            </div>
          )}
          <Tabs.List aria-label="Show" className="flex gap-6 border-b text-sm">
            {[
              ["details", "Details"],
              ["activity", "Activity"],
            ].map(([value = "", label]) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className="-mb-px rounded-t-sm border-b-2 border-transparent pb-2.5 font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=active]:border-primary data-[state=active]:text-foreground"
              >
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content
          value="details"
          className="grid min-h-0 content-start gap-6 px-6 py-5 outline-none md:overflow-y-auto"
        >
          {/* Nobody else sees things in the trash, so there's no access to list. */}
          {!item?.trashedAt && (
            <AccessSummary
              key={subject.id}
              version={accessVersion}
              itemId={subject.id}
              currentUserId={currentUserId}
            />
          )}
          <dl className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <Fact icon={item?.kind === "file" ? File : Folder} label="Type">
              {kind}
            </Fact>
            {size !== null && (
              <Fact icon={Layers} label="Size">
                {formatBytes(size)}
              </Fact>
            )}
            {!item && (
              <Fact icon={Layers} label="Contains">
                {countLabel(folder?.count ?? 0)}
              </Fact>
            )}
            {item && (
              <>
                <Fact icon={User} label="Owner">
                  {item.owner.id === currentUserId
                    ? "You"
                    : (item.owner.name ?? item.owner.email ?? "Someone else")}
                </Fact>
                <Fact icon={Calendar} label="Modified">
                  <time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time>
                </Fact>
                {item.trashedAt && (
                  <Fact icon={Trash2} label="Trashed">
                    <time dateTime={item.trashedAt}>{formatDateTime(item.trashedAt)}</time>
                  </Fact>
                )}
                {location && (
                  <Fact icon={HardDrive} label="Location">
                    {location}
                  </Fact>
                )}
              </>
            )}
          </dl>
        </Tabs.Content>
        <Tabs.Content
          value="activity"
          className="min-h-0 px-6 py-5 outline-none md:overflow-y-auto"
        >
          {/* Reloads when the item changes (a rename made while the tab is open, say). */}
          <ActivityList
            key={`${subject.id}:${item?.updatedAt ?? ""}:${String(accessVersion)}`}
            itemId={subject.id}
            currentUserId={currentUserId}
          />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}

/** The first action is spelled out; the others are icons with a tooltip, so they fit on one line. */
function QuickAction({
  action,
  primary,
  onClick,
}: {
  action: ItemAction;
  primary: boolean;
  onClick: () => void;
}) {
  return primary ? (
    <Button onClick={onClick}>
      <action.icon />
      {action.label}
    </Button>
  ) : (
    <Button variant="outline" size="icon" title={action.label} onClick={onClick}>
      <action.icon className={cn(action.id === "unstar" && "text-star")} />
      <span className="sr-only">{action.label}</span>
    </Button>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    // Only terms and descriptions may sit in a list like this, so the icon is part of the term.
    <div className="relative flex min-h-9 min-w-0 flex-col justify-center pl-12">
      <dt className="text-xs text-muted-foreground">
        <span className="absolute inset-y-0 left-0 my-auto grid size-9 place-items-center rounded-xl bg-muted">
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </dt>
      <dd className="truncate font-medium">{children}</dd>
    </div>
  );
}

/** Several items selected: how many, of what, and their size together. */
function Summary({ items, titleRef }: { items: DriveItem[]; titleRef: TitleRef }) {
  const { folders, files, bytes } = summarize(items);
  return (
    <div className="grid gap-5 p-6">
      <div className="grid gap-1 pr-8">
        <DialogTitle ref={titleRef} tabIndex={-1} className="text-title outline-none">
          {items.length} items selected
        </DialogTitle>
        <DialogDescription>
          {[
            folders > 0 && `${String(folders)} ${folders === 1 ? "folder" : "folders"}`,
            files > 0 && `${String(files)} ${files === 1 ? "file" : "files"}`,
            files > 0 && formatBytes(bytes),
          ]
            .filter(Boolean)
            .join(" · ")}
        </DialogDescription>
      </div>
      <ul className="grid max-h-72 gap-1 overflow-y-auto">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/60 p-2.5"
          >
            <ItemIcon item={item} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
            {item.size !== null && (
              <span className="text-xs text-muted-foreground">{formatBytes(item.size)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function countLabel(count: number): string {
  return count === 0 ? "Empty" : count === 1 ? "1 item" : `${String(count)} items`;
}
