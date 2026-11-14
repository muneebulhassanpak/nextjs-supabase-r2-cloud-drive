"use client";

import { ArrowUpDown, FolderPlus, Info, LayoutGrid, List, Plus, Upload } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { createFolder, renameItem, setDriveView, trashItems } from "@/app/drive/item-actions";
import { EmptyState } from "@/components/app/empty-state";
import { FilePreview } from "@/components/preview/file-preview";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUploads } from "@/components/uploads/upload-provider";
import { useMediaQuery } from "@/hooks/use-media-query";
import { TRASH_BATCH_SIZE } from "@/lib/drive/names";
import { sortItems, type Sort, type SortKey } from "@/lib/drive/sort";
import type { Crumb, DriveItem, DriveView } from "@/lib/drive/types";
import { download } from "@/lib/files/api";
import { cn } from "@/lib/utils";

import { Breadcrumbs } from "./breadcrumbs";
import { DetailsPanel } from "./details-panel";
import { actionsFor, type ItemAction } from "./item-actions";
import { ItemIcon } from "./item-icon";
import { GridView, ListView } from "./item-views";
import { NameDialog } from "./name-dialog";

type Change =
  | { type: "add"; item: DriveItem }
  | { type: "rename"; id: string; name: string }
  | { type: "remove"; ids: string[] };

function applyChange(items: DriveItem[], change: Change): DriveItem[] {
  switch (change.type) {
    case "add":
      return [...items, change.item];
    case "rename":
      return items.map((item) => (item.id === change.id ? { ...item, name: change.name } : item));
    case "remove":
      return items.filter((item) => !change.ids.includes(item.id));
  }
}

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  modified: "Last modified",
  size: "Size",
};
const TEMP_PREFIX = "pending-";

export interface FolderBrowserProps {
  /** null at the top of My Drive. */
  folder: { id: string; name: string } | null;
  items: DriveItem[];
  crumbs: Crumb[];
  sharedRoot: boolean;
  sort: Sort;
  view: DriveView | null;
  /** Whether the person may add, rename and trash things here. */
  canEdit: boolean;
  currentUserId: string;
}

/**
 * The file browser: list or grid, selection, menus and the details panel. Changes show at once
 * (optimistic) and roll back with a message if the server refuses them.
 */
export function FolderBrowser(props: FolderBrowserProps) {
  const { folder, canEdit, currentUserId, sort } = props;
  const router = useRouter();
  const pathname = usePathname();
  const isTouch = useMediaQuery("(pointer: coarse)");
  const isWide = useMediaQuery("(min-width: 1024px)");

  const [items, change] = useOptimistic(props.items, applyChange);
  const sorted = useMemo(() => sortItems(items, sort), [items, sort]);
  const pending = useMemo(
    () => new Set(items.filter((i) => i.id.startsWith(TEMP_PREFIX)).map((i) => i.id)),
    [items],
  );
  const takenNames = useMemo(() => new Set(items.map((i) => i.name.toLowerCase())), [items]);

  const [view, setView] = useState<DriveView>(props.view ?? "list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "new" } | { kind: "rename"; item: DriveItem } | null
  >(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<DriveItem | null>(null);
  const uploads = useUploads();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Items can disappear (trashed, refreshed); the selection only ever holds what's on screen.
  const selected = sorted.filter((item) => selectedIds.has(item.id));
  // What ← and → step through in a preview: the folder's files, in the order shown.
  const previewFiles = useMemo(
    () => sorted.filter((item) => item.kind === "file" && !pending.has(item.id)),
    [sorted, pending],
  );
  // Closing a preview leaves the last file viewed selected, as if it had been clicked.
  const closePreview = useCallback(() => {
    if (previewId) setSelectedIds(new Set([previewId]));
    setPreviewId(null);
  }, [previewId]);
  const selectedSet = new Set(selected.map((item) => item.id));
  const detailsItem = selected.length === 1 ? (selected[0] ?? null) : null;
  const location = folder?.name ?? (props.sharedRoot ? "Shared with me" : "My Drive");

  // Changes ------------------------------------------------------------------------------------

  function addFolder(name: string) {
    setDialog(null);
    startTransition(async () => {
      change({
        type: "add",
        item: {
          id: `${TEMP_PREFIX}${crypto.randomUUID()}`,
          kind: "folder",
          name,
          size: null,
          mimeType: null,
          category: null,
          updatedAt: new Date().toISOString(),
          parentId: folder?.id ?? null,
          owner: { id: currentUserId, name: null, email: null },
        },
      });
      const result = await createFolder(folder?.id ?? null, name);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function rename(item: DriveItem, name: string) {
    setDialog(null);
    startTransition(async () => {
      change({ type: "rename", id: item.id, name });
      const result = await renameItem(item.id, name);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function trash(targets: DriveItem[]) {
    if (targets.length === 0) return;
    const ids = targets.map((item) => item.id);
    setSelectedIds(new Set());
    startTransition(async () => {
      change({ type: "remove", ids });
      // The server takes a limited number per request; stop at the first batch that fails.
      for (let start = 0; start < ids.length; start += TRASH_BATCH_SIZE) {
        const result = await trashItems(ids.slice(start, start + TRASH_BATCH_SIZE));
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
      }
      toast.success(
        ids.length === 1
          ? `“${targets[0]?.name}” moved to the trash`
          : `${ids.length} items moved to the trash`,
      );
    });
  }

  function changeView(next: DriveView) {
    setView(next);
    startTransition(async () => {
      const result = await setDriveView(next);
      if (!result.ok) toast.error("Couldn't save your view. It will reset next time.");
    });
  }

  function changeSort(next: Sort) {
    const params = new URLSearchParams({ sort: next.key, order: next.order });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Uploads ------------------------------------------------------------------------------------

  function upload(files: File[]) {
    uploads.add(files, folder?.id ?? null, location);
  }

  /** Files dragged in from the computer (not text or links dragged around the page). */
  const carriesFiles = (event: DragEvent) => canEdit && event.dataTransfer.types.includes("Files");

  function onDragOver(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files: File[] = [];
    let folders = 0;
    for (const entry of Array.from(event.dataTransfer.items)) {
      if (entry.kind !== "file") continue;
      // A dropped folder arrives as an unreadable "file"; folder uploads aren't supported yet.
      if (entry.webkitGetAsEntry()?.isDirectory) folders += 1;
      else {
        const file = entry.getAsFile();
        if (file) files.push(file);
      }
    }
    if (folders > 0)
      toast.info("Folders can't be uploaded yet. Drop the files inside them instead.");
    upload(files);
  }

  // Selection and opening ----------------------------------------------------------------------

  function open(item: DriveItem) {
    if (item.kind === "folder") router.push(`/drive/folders/${item.id}`);
    else setPreviewId(item.id);
  }

  function downloadFile(file: DriveItem) {
    download(file.id).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Couldn't download that.");
    });
  }

  function select(event: MouseEvent | KeyboardEvent, item: DriveItem) {
    const toggle = event.metaKey || event.ctrlKey;
    if (event.shiftKey && anchorId) {
      const ids = sorted.filter((i) => !pending.has(i.id)).map((i) => i.id);
      const [from, to] = [ids.indexOf(anchorId), ids.indexOf(item.id)].sort((a, b) => a - b);
      if (from !== undefined && to !== undefined && from >= 0) {
        const range = ids.slice(from, to + 1);
        setSelectedIds(new Set(toggle ? [...selectedIds, ...range] : range));
        return;
      }
    }
    if (toggle) {
      const next = new Set(selectedIds);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      setSelectedIds(next);
    } else {
      setSelectedIds(new Set([item.id]));
    }
    setAnchorId(item.id);
  }

  function run(action: ItemAction["id"], targets: DriveItem[]) {
    const [first] = targets;
    if (action === "trash") trash(targets);
    else if (first && action === "open") open(first);
    else if (first && action === "download") downloadFile(first);
    else if (first && action === "rename") setDialog({ kind: "rename", item: first });
    else if (first && action === "details") {
      setSelectedIds(new Set([first.id]));
      setDetailsOpen(true);
    }
  }

  /** Right-clicking or opening the menu of an item outside the selection selects just it. */
  function targetsFor(item: DriveItem): DriveItem[] {
    return selectedSet.has(item.id) ? selected : [item];
  }

  function onItemKeyDown(event: KeyboardEvent, item: DriveItem) {
    if (event.key === "Enter") open(item);
    else if (event.key === " ") {
      event.preventDefault();
      select(event, item);
    }
  }

  function onBrowserKeyDown(event: KeyboardEvent) {
    // Menus render in portals, but their key presses still bubble here through React.
    if (dialog || (event.target as HTMLElement).closest("[role=menu]")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") setSelectedIds(new Set());
    else if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedIds(new Set(sorted.filter((i) => !pending.has(i.id)).map((i) => i.id)));
    } else if (
      (event.key === "Delete" || event.key === "Backspace") &&
      canEdit &&
      selected.length
    ) {
      event.preventDefault();
      trash(selected);
    } else if (event.key === "F2" && canEdit && selected.length === 1 && selected[0]) {
      event.preventDefault();
      setDialog({ kind: "rename", item: selected[0] });
    }
  }

  // Menus --------------------------------------------------------------------------------------

  const wrapContextMenu = (item: DriveItem, content: ReactNode) => (
    <ContextMenu
      key={item.id}
      onOpenChange={(isOpen) => {
        if (isOpen && !selectedSet.has(item.id)) setSelectedIds(new Set([item.id]));
      }}
    >
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {actionsFor(targetsFor(item), canEdit).map((action) => (
          <MenuEntry
            key={action.id}
            action={action}
            as="context"
            onSelect={() => {
              run(action.id, targetsFor(item));
            }}
          />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );

  const renderMore = (item: DriveItem, trigger: ReactNode) =>
    isTouch ? (
      <span
        onClickCapture={(event) => {
          event.stopPropagation();
          setSheetItem(item);
        }}
      >
        {trigger}
      </span>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {actionsFor(targetsFor(item), canEdit).map((action) => (
            <MenuEntry
              key={action.id}
              action={action}
              as="dropdown"
              onSelect={() => {
                run(action.id, targetsFor(item));
              }}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const viewProps = {
    items: sorted,
    selected: selectedSet,
    pending,
    currentUserId,
    onOpen: open,
    onKeyDown: onItemKeyDown,
    onClick: (event: MouseEvent, item: DriveItem) => {
      if (isTouch) open(item);
      else select(event, item);
    },
    renderMore,
    wrapContextMenu,
  };

  const details = (
    <DetailsPanel
      item={detailsItem}
      selectedCount={selected.length}
      location={location}
      currentUserId={currentUserId}
      onClose={() => {
        setDetailsOpen(false);
      }}
      showClose={isWide}
    />
  );

  return (
    <div
      className="relative flex min-h-0 flex-1 gap-6"
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
    >
      {dragging && (
        <div
          className="absolute -inset-2 z-30 flex justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[1px]"
          onDragOver={onDragOver}
          onDragLeave={() => {
            setDragging(false);
          }}
          onDrop={onDrop}
        >
          {/* Sticks to the middle of the screen, however long the folder is. */}
          <div className="pointer-events-none sticky top-[calc(50dvh-3rem)] flex h-fit flex-col items-center gap-2 pt-[min(30dvh,8rem)] text-center">
            <Upload className="size-8 text-primary" aria-hidden />
            <p className="font-medium">Drop files to upload</p>
            <p className="text-sm text-muted-foreground">to {location}</p>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Breadcrumbs
            crumbs={props.crumbs}
            current={folder?.name ?? null}
            sharedRoot={props.sharedRoot}
          />
          <div className="flex items-center gap-1">
            {canEdit && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="mr-1">
                      <Plus />
                      New
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onSelect={() => {
                        setDialog({ kind: "new" });
                      }}
                    >
                      <FolderPlus />
                      New folder
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        fileInput.current?.click();
                      }}
                    >
                      <Upload />
                      File upload
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  aria-label="Files to upload"
                  onChange={(event) => {
                    // Copy first: clearing the input empties its file list.
                    upload(Array.from(event.target.files ?? []));
                    event.target.value = "";
                  }}
                />
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <ArrowUpDown />
                  <span className="sr-only">Sort by {SORT_LABELS[sort.key]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sort.key}
                  onValueChange={(key) => {
                    changeSort({ key: key as SortKey, order: key === "name" ? "asc" : "desc" });
                  }}
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {SORT_LABELS[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={sort.order}
                  onValueChange={(order) => {
                    changeSort({ key: sort.key, order: order as Sort["order"] });
                  }}
                >
                  <DropdownMenuRadioItem value="asc">
                    {sort.key === "name"
                      ? "A to Z"
                      : sort.key === "size"
                        ? "Smallest first"
                        : "Oldest first"}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="desc">
                    {sort.key === "name"
                      ? "Z to A"
                      : sort.key === "size"
                        ? "Largest first"
                        : "Newest first"}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                changeView(view === "list" ? "grid" : "list");
              }}
            >
              {view === "list" ? <LayoutGrid /> : <List />}
              <span className="sr-only">{view === "list" ? "Show as grid" : "Show as list"}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={detailsOpen}
              onClick={() => {
                setDetailsOpen(!detailsOpen);
              }}
            >
              <Info />
              <span className="sr-only">Details</span>
            </Button>
          </div>
        </div>

        {/* Clicking empty space clears the selection. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          onKeyDown={onBrowserKeyDown}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedIds(new Set());
          }}
        >
          {sorted.length === 0 ? (
            <EmptyState
              icon={FolderPlus}
              title={folder ? "This folder is empty" : "Your drive is empty"}
            >
              {canEdit
                ? "Drop files here, or use New to upload files or create a folder."
                : "Nothing has been added here yet."}
            </EmptyState>
          ) : view === "grid" ? (
            <GridView {...viewProps} />
          ) : (
            <ListView {...viewProps} />
          )}
          <div
            className="min-h-16 flex-1"
            onClick={() => {
              setSelectedIds(new Set());
            }}
          />
        </div>
      </div>

      {detailsOpen && isWide && (
        <aside
          aria-label="Details"
          className="sticky top-20 hidden w-80 shrink-0 self-start rounded-xl border p-4 lg:block"
        >
          {details}
        </aside>
      )}
      {previewId && (
        <FilePreview
          files={previewFiles}
          fileId={previewId}
          onNavigate={setPreviewId}
          onClose={closePreview}
          onDownload={downloadFile}
        />
      )}
      <Sheet open={detailsOpen && !isWide} onOpenChange={setDetailsOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl p-6">
          <SheetHeader className="sr-only">
            <SheetTitle>Details</SheetTitle>
            <SheetDescription>About the selected item</SheetDescription>
          </SheetHeader>
          {details}
        </SheetContent>
      </Sheet>

      <Sheet
        open={sheetItem !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSheetItem(null);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-2xl pb-6">
          <SheetHeader className="flex-row items-center gap-3">
            {sheetItem && <ItemIcon item={sheetItem} className="size-5 shrink-0" />}
            <SheetTitle className="truncate">{sheetItem?.name}</SheetTitle>
            <SheetDescription className="sr-only">Actions for this item</SheetDescription>
          </SheetHeader>
          <div className="grid px-2">
            {sheetItem &&
              actionsFor([sheetItem], canEdit).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={cn(
                    "flex min-h-12 items-center gap-4 rounded-lg px-3 text-left text-base hover:bg-accent",
                    action.destructive && "text-destructive",
                  )}
                  onClick={() => {
                    const target = sheetItem;
                    setSheetItem(null);
                    run(action.id, [target]);
                  }}
                >
                  <action.icon className="size-5" aria-hidden />
                  {action.label}
                </button>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      <NameDialog
        open={dialog?.kind === "new"}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDialog(null);
        }}
        title="New folder"
        description={`In ${location}`}
        submitLabel="Create"
        initialName="Untitled folder"
        takenNames={takenNames}
        onSubmit={addFolder}
      />
      <NameDialog
        open={dialog?.kind === "rename"}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDialog(null);
        }}
        title="Rename"
        description={dialog?.kind === "rename" ? `Currently “${dialog.item.name}”` : ""}
        submitLabel="Rename"
        initialName={dialog?.kind === "rename" ? dialog.item.name : ""}
        renaming
        hasExtension={dialog?.kind === "rename" && dialog.item.kind === "file"}
        takenNames={takenNames}
        onSubmit={(name) => {
          if (dialog?.kind === "rename") rename(dialog.item, name);
        }}
      />
    </div>
  );
}

function MenuEntry({
  action,
  as,
  onSelect,
}: {
  action: ItemAction;
  as: "context" | "dropdown";
  onSelect: () => void;
}) {
  const Item = as === "context" ? ContextMenuItem : DropdownMenuItem;
  const Shortcut = as === "context" ? ContextMenuShortcut : DropdownMenuShortcut;
  const Separator = as === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  return (
    <>
      {action.destructive && <Separator />}
      <Item variant={action.destructive ? "destructive" : "default"} onSelect={onSelect}>
        <action.icon />
        {action.label}
        {action.shortcut && <Shortcut>{action.shortcut}</Shortcut>}
      </Item>
    </>
  );
}
