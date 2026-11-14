"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, type DragEvent } from "react";

import { ItemIcon } from "@/components/drive/item-icon";
import { Button } from "@/components/ui/button";
import type { DriveItem } from "@/lib/drive/types";
import { markOpened } from "@/lib/files/api";
import { cn } from "@/lib/utils";

import { PreviewBody } from "./preview-body";

/** How long a file must stay on screen to count as opened (for Recents). */
const RECENT_AFTER_MS = 1000;

/**
 * A file on its own, over the page: its name, download and close at the top, and the files around
 * it a step away (buttons, or ← and →). Focus stays inside until it closes (Esc).
 */
export function FilePreview({
  files,
  fileId,
  onNavigate,
  onClose,
  onDownload,
}: {
  /** The folder's files, in the order the folder shows them. */
  files: DriveItem[];
  fileId: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onDownload: (file: DriveItem) => void;
}) {
  const index = files.findIndex((file) => file.id === fileId);
  const file = files[index];
  const previous = index > 0 ? files[index - 1] : undefined;
  const next = index >= 0 ? files[index + 1] : undefined;

  // A file looked at for a moment goes to the top of Recents; one stepped past on the way doesn't.
  useEffect(() => {
    const timer = setTimeout(() => {
      void markOpened(fileId);
    }, RECENT_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [fileId]);

  // ← and → step through the folder. Listened for on the window, so they work wherever focus is.
  const previousId = previous?.id;
  const nextId = next?.id;
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      // Alt+← is Back, ⌘/Ctrl+arrows move by words or lines: those belong to the browser.
      if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      // Players and inputs use the arrow keys themselves (seeking, moving the cursor), and so does
      // a zoomed picture (panning).
      const target = event.target as HTMLElement | null;
      if (target?.closest("video, audio, input, textarea, [contenteditable]")) return;
      if (document.querySelector("[data-preview-pan]")) return;
      const id =
        event.key === "ArrowLeft" ? previousId : event.key === "ArrowRight" ? nextId : null;
      if (!id) return;
      event.preventDefault();
      onNavigate(id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previousId, nextId, onNavigate]);

  // The file went away (trashed, or the folder changed): nothing left to show.
  useEffect(() => {
    if (!file) onClose();
  }, [file, onClose]);
  if (!file) return null;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-neutral-950 data-open:animate-in data-open:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Files dragged over a preview aren't uploads, and mustn't open in the browser either.
          onDragEnter={refuseDrag}
          onDragOver={refuseDrag}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          className="fixed inset-0 z-50 flex flex-col text-white outline-none data-open:animate-in data-open:fade-in-0"
        >
          <header className="flex items-center gap-2 px-2 py-2 sm:px-4">
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="hover:bg-white/10 hover:text-white">
                <ArrowLeft />
                <span className="sr-only">Close preview</span>
              </Button>
            </DialogPrimitive.Close>
            <ItemIcon item={file} className="size-5 shrink-0" />
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">
              {file.name}
            </DialogPrimitive.Title>
            {files.length > 1 && (
              <span className="hidden text-sm text-white/70 sm:inline">
                {index + 1} of {files.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-white/10 hover:text-white"
              onClick={() => {
                onDownload(file);
              }}
            >
              <Download />
              <span className="sr-only">Download</span>
            </Button>
          </header>

          {/* Phones step with buttons in a strip at the bottom, clear of the file; wider screens at the sides. */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-16 sm:px-16 sm:pb-4">
            <PreviewBody
              key={file.id}
              file={file}
              onDownload={() => {
                onDownload(file);
              }}
            />
            {previous && (
              <StepButton
                side="left"
                label={`Previous: ${previous.name}`}
                onClick={() => {
                  onNavigate(previous.id);
                }}
              />
            )}
            {next && (
              <StepButton
                side="right"
                label={`Next: ${next.name}`}
                onClick={() => {
                  onNavigate(next.id);
                }}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function refuseDrag(event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "none";
}

function StepButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute bottom-3 rounded-full opacity-80 shadow-md hover:opacity-100 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      <Icon />
    </Button>
  );
}
