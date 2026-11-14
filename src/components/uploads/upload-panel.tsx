"use client";

import { Check, ChevronDown, ChevronUp, CircleAlert, RotateCw, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useUploads, type Upload } from "./upload-provider";

function summary(uploads: Upload[]): string {
  const left = uploads.filter((u) => u.status === "queued" || u.status === "uploading").length;
  const done = uploads.filter((u) => u.status === "done").length;
  const failed = uploads.filter((u) => u.status === "failed").length;
  const uploadsOf = (n: number) => `${String(n)} ${n === 1 ? "upload" : "uploads"}`;
  if (left > 0) return `Uploading ${String(left)} ${left === 1 ? "file" : "files"}`;
  if (failed > 0 && done > 0) return `${uploadsOf(done)} complete, ${String(failed)} failed`;
  if (failed > 0) return `${uploadsOf(failed)} failed`;
  return `${uploadsOf(done)} complete`;
}

function statusText(upload: Upload): string {
  switch (upload.status) {
    case "queued":
      return "Waiting…";
    case "uploading":
      if (upload.saving) return "Saving…";
      return upload.loaded === 0
        ? "Starting…"
        : `${formatBytes(upload.loaded)} of ${formatBytes(upload.file.size)}`;
    case "done":
      return upload.savedAs && upload.savedAs !== upload.file.name
        ? `Saved as “${upload.savedAs}” in ${upload.destination}`
        : `In ${upload.destination}`;
    case "failed":
      return upload.error ?? "Upload failed";
    case "cancelled":
      return "Cancelled";
  }
}

/** The uploads in progress and just finished, in a corner card that stays across pages. */
export function UploadPanel() {
  const { uploads, cancel, retry, clear } = useUploads();
  const [collapsed, setCollapsed] = useState(false);
  if (uploads.length === 0) return null;

  const busy = uploads.some((u) => u.status === "queued" || u.status === "uploading");
  const title = summary(uploads);

  return (
    <section
      aria-label="Uploads"
      className="fixed inset-x-3 bottom-3 z-40 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
    >
      <header className="flex items-center gap-1 border-b py-2 pr-2 pl-4">
        <h2 className="flex-1 truncate text-sm font-medium" aria-live="polite">
          {title}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={!collapsed}
          onClick={() => {
            setCollapsed(!collapsed);
          }}
        >
          {collapsed ? <ChevronUp /> : <ChevronDown />}
          <span className="sr-only">{collapsed ? "Show uploads" : "Hide uploads"}</span>
        </Button>
        {!busy && (
          <Button variant="ghost" size="icon-sm" onClick={clear}>
            <X />
            <span className="sr-only">Close uploads</span>
          </Button>
        )}
      </header>
      {!collapsed && (
        <ul className="max-h-72 overflow-y-auto py-1">
          {uploads.map((upload) => (
            <li key={upload.key} className="flex items-center gap-3 px-4 py-2">
              <div className="grid min-w-0 flex-1 gap-1">
                <p className="truncate text-sm">{upload.savedAs ?? upload.file.name}</p>
                {upload.status === "uploading" && (
                  <Progress
                    value={upload.file.size ? (upload.loaded / upload.file.size) * 100 : 0}
                    aria-label={`Uploading ${upload.file.name}`}
                  />
                )}
                <p
                  className={cn(
                    "truncate text-xs text-muted-foreground",
                    upload.status === "failed" && "text-destructive",
                  )}
                  title={statusText(upload)}
                >
                  {statusText(upload)}
                </p>
              </div>
              {upload.status === "done" && (
                <Check className="size-4 shrink-0 text-primary" aria-label="Done" />
              )}
              {upload.status === "failed" && !upload.retryable && (
                <CircleAlert className="size-4 shrink-0 text-destructive" aria-label="Failed" />
              )}
              {upload.status === "failed" && upload.retryable && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    retry(upload.key);
                  }}
                >
                  <RotateCw />
                  <span className="sr-only">Retry {upload.file.name}</span>
                </Button>
              )}
              {(upload.status === "queued" ||
                (upload.status === "uploading" && !upload.saving)) && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    cancel(upload.key);
                  }}
                >
                  <X />
                  <span className="sr-only">Cancel {upload.file.name}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
