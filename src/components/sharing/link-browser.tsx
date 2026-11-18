"use client";

import { ChevronRight, Download, Eye } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { formatModified } from "@/components/drive/format";
import { ItemIcon, itemTypeLabel } from "@/components/drive/item-icon";
import { downloadWith, LinkFileAccess, useFileAccess } from "@/components/files/file-access";
import { FilePreview } from "@/components/preview/file-preview";
import { PreviewBody } from "@/components/preview/preview-body";
import { Button } from "@/components/ui/button";
import type { DriveItem } from "@/lib/drive/types";
import { formatBytes } from "@/lib/format";

function useDownload() {
  const access = useFileAccess();
  return useCallback(
    (file: DriveItem) => {
      downloadWith(access, file.id).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Couldn't download that.");
      });
    },
    [access],
  );
}

/** A shared file on its own: its name, a download button and the preview, in the page. */
export function LinkFile({ token, file }: { token: string; file: DriveItem }) {
  return (
    <LinkFileAccess token={token}>
      <SharedFile file={file} />
    </LinkFileAccess>
  );
}

function SharedFile({ file }: { file: DriveItem }) {
  const download = useDownload();
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ItemIcon item={file} className="size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{file.name}</h1>
          <p className="text-sm text-muted-foreground">
            {itemTypeLabel(file)}
            {file.size !== null && ` · ${formatBytes(file.size)}`}
          </p>
        </div>
        <Button
          onClick={() => {
            download(file);
          }}
        >
          <Download />
          Download
        </Button>
      </div>
      <div className="flex min-h-[60dvh] flex-1 items-center justify-center rounded-xl border bg-muted/40 p-2 sm:p-4">
        <PreviewBody
          file={file}
          onDownload={() => {
            download(file);
          }}
        />
      </div>
    </div>
  );
}

/** A shared folder, read-only: open folders inside it, preview and download its files. */
export function LinkFolder({
  token,
  path,
  items,
}: {
  token: string;
  path: { id: string; name: string }[];
  items: DriveItem[];
}) {
  return (
    <LinkFileAccess token={token}>
      <SharedFolder token={token} path={path} items={items} />
    </LinkFileAccess>
  );
}

function SharedFolder({
  token,
  path,
  items,
}: {
  token: string;
  path: { id: string; name: string }[];
  items: DriveItem[];
}) {
  const download = useDownload();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const files = items.filter((item) => item.kind === "file");
  const rootId = path[0]?.id;
  const href = (id: string) => (id === rootId ? `/s/${token}` : `/s/${token}?folder=${id}`);
  const closePreview = useCallback(() => {
    setPreviewId(null);
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <nav aria-label="Folders" className="min-w-0">
        <ol className="flex flex-wrap items-center gap-1 text-xl font-semibold tracking-tight">
          {path.map((crumb, index) => {
            const last = index === path.length - 1;
            return (
              <li key={crumb.id} className="flex min-w-0 items-center gap-1">
                {index > 0 && (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                {last ? (
                  <h1 aria-current="page" className="truncate px-1.5 py-1">
                    {crumb.name}
                  </h1>
                ) : (
                  <Link
                    href={href(crumb.id)}
                    className="truncate rounded-md px-1.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {crumb.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          This folder is empty.
        </p>
      ) : (
        <ul aria-label="Files and folders" className="rounded-xl border">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-h-14 items-center gap-3 border-b px-3 last:border-b-0 hover:bg-accent/60 md:min-h-12"
            >
              <ItemIcon item={item} className="size-5 shrink-0" />
              {item.kind === "folder" ? (
                <Link href={href(item.id)} className="min-w-0 flex-1 truncate font-medium">
                  {item.name}
                </Link>
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium"
                  onClick={() => {
                    setPreviewId(item.id);
                  }}
                >
                  {item.name}
                </button>
              )}
              <span className="hidden w-24 text-sm text-muted-foreground sm:block">
                {item.size !== null && item.kind === "file" ? formatBytes(item.size) : "—"}
              </span>
              <span className="hidden w-32 text-sm text-muted-foreground md:block">
                <time dateTime={item.updatedAt} suppressHydrationWarning>
                  {formatModified(item.updatedAt)}
                </time>
              </span>
              {item.kind === "file" ? (
                <span className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setPreviewId(item.id);
                    }}
                  >
                    <Eye />
                    <span className="sr-only">Preview {item.name}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      download(item);
                    }}
                  >
                    <Download />
                    <span className="sr-only">Download {item.name}</span>
                  </Button>
                </span>
              ) : (
                <span className="w-20 shrink-0" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}

      {previewId && (
        <FilePreview
          files={files}
          fileId={previewId}
          onNavigate={setPreviewId}
          onClose={closePreview}
          onDownload={download}
        />
      )}
    </div>
  );
}
