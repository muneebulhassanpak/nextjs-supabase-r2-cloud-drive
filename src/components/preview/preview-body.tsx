"use client";

import { Download, ExternalLink, LoaderCircle, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { ItemIcon, itemTypeLabel } from "@/components/drive/item-icon";
import { Button } from "@/components/ui/button";
import type { DriveItem } from "@/lib/drive/types";
import { fileUrl, readText, TransferError } from "@/lib/files/api";
import { codeLanguage, previewKind, TEXT_PREVIEW_BYTES } from "@/lib/files/preview";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CodeView } from "./code-view";

type Load<T> =
  { state: "loading" } | { state: "ready"; value: T } | { state: "failed"; error: string };

const message = (error: unknown) =>
  error instanceof TransferError ? error.message : "Couldn't load the preview. Try again.";

/** Runs `load` once (and again on retry), keeping its result. Callers key this by file. */
function useLoad<T>(load: () => Promise<T>): [Load<T>, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    load().then(
      (value) => {
        if (live) setResult({ state: "ready", value });
      },
      (error: unknown) => {
        if (live) setResult({ state: "failed", error: message(error) });
      },
    );
    return () => {
      live = false;
    };
    // `load` is fixed for the life of this component (it's keyed by file); `attempt` retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  const retry = () => {
    setResult({ state: "loading" });
    setAttempt((n) => n + 1);
  };
  return [result, retry];
}

/** What a file looks like in the preview: the right viewer for its type, or a card. */
export function PreviewBody({ file, onDownload }: { file: DriveItem; onDownload: () => void }) {
  const kind = previewKind(file.mimeType);
  if (kind === "none") {
    return (
      <Card file={file} onDownload={onDownload}>
        No preview available for this type of file.
      </Card>
    );
  }
  if (kind === "text") return <TextPreview file={file} onDownload={onDownload} />;
  return <MediaPreview file={file} kind={kind} onDownload={onDownload} />;
}

function MediaPreview({
  file,
  kind,
  onDownload,
}: {
  file: DriveItem;
  kind: "image" | "pdf" | "video" | "audio";
  onDownload: () => void;
}) {
  const [link, retry] = useLoad(() => fileUrl(file.id, "inline").then(({ url }) => url));
  const [broken, setBroken] = useState(false);

  if (link.state === "loading") return <Loading />;
  if (link.state === "failed") return <Failed file={file} error={link.error} onRetry={retry} />;
  const url = link.value;

  if (broken) {
    return (
      <Card file={file} onDownload={onDownload}>
        This browser can&apos;t play this file. Download it to open it in another app.
      </Card>
    );
  }
  const onError = () => {
    setBroken(true);
  };
  switch (kind) {
    case "image":
      return <ImageView url={url} name={file.name} onError={onError} />;
    case "pdf":
      return <PdfView url={url} file={file} onDownload={onDownload} />;
    case "video":
      return (
        <video
          src={url}
          controls
          preload="metadata"
          aria-label={file.name}
          onError={onError}
          className="max-h-full w-full max-w-4xl rounded-lg bg-black"
        />
      );
    case "audio":
      return (
        <div className="grid w-full max-w-md justify-items-center gap-6 rounded-xl bg-card p-8 text-card-foreground">
          <ItemIcon item={file} className="size-16" />
          <p className="max-w-full truncate font-medium">{file.name}</p>
          <audio src={url} controls preload="metadata" onError={onError} className="w-full">
            {file.name}
          </audio>
        </div>
      );
  }
}

function ImageView({ url, name, onError }: { url: string; name: string; onError: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const toggle = () => {
    setZoomed(!zoomed);
  };
  return (
    <div className="relative size-full">
      {/* While zoomed, the arrow keys pan the picture instead of changing file. */}
      <div
        data-preview-pan={zoomed || undefined}
        className={cn(
          "size-full",
          zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link, not an app asset */}
        <img
          src={url}
          alt={name}
          onError={onError}
          onClick={toggle}
          className={cn(
            zoomed
              ? "m-auto max-w-none cursor-zoom-out"
              : "max-h-full max-w-full cursor-zoom-in object-contain",
          )}
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={toggle}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-md"
      >
        {zoomed ? <ZoomOut /> : <ZoomIn />}
        {zoomed ? "Fit to screen" : "Actual size"}
      </Button>
    </div>
  );
}

function PdfView({
  url,
  file,
  onDownload,
}: {
  url: string;
  file: DriveItem;
  onDownload: () => void;
}) {
  // Most phone browsers can't show a PDF inside a page: offer to open it on its own instead.
  if (!navigator.pdfViewerEnabled) {
    return (
      <Card
        file={file}
        onDownload={onDownload}
        action={
          <Button asChild variant="secondary">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Open PDF
            </a>
          </Button>
        }
      >
        This browser can&apos;t show PDFs here.
      </Card>
    );
  }
  return <iframe src={url} title={file.name} className="size-full rounded-lg bg-white" />;
}

function TextPreview({ file, onDownload }: { file: DriveItem; onDownload: () => void }) {
  const [text, retry] = useLoad(async () => {
    if (file.size === 0) return "";
    const { url } = await fileUrl(file.id, "inline");
    return readText(url, TEXT_PREVIEW_BYTES);
  });
  if (text.state === "loading") return <Loading />;
  if (text.state === "failed") return <Failed file={file} error={text.error} onRetry={retry} />;
  if (text.value === "") {
    return <Card file={file}>This file is empty.</Card>;
  }
  const truncated = (file.size ?? 0) > TEXT_PREVIEW_BYTES;
  return (
    <div className="flex size-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background text-foreground">
      {truncated && (
        <p className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm text-muted-foreground">
          Showing the first {formatBytes(TEXT_PREVIEW_BYTES)} of {formatBytes(file.size ?? 0)}.
          <Button variant="link" size="sm" onClick={onDownload}>
            Download all
          </Button>
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeView text={text.value} language={codeLanguage(file.name)} />
      </div>
    </div>
  );
}

function Loading() {
  return (
    <LoaderCircle className="size-8 animate-spin text-white/70" aria-label="Loading preview" />
  );
}

function Failed({ file, error, onRetry }: { file: DriveItem; error: string; onRetry: () => void }) {
  return (
    <Card
      file={file}
      action={
        <Button variant="secondary" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      }
    >
      {error}
    </Card>
  );
}

/** A file's icon, name and type, with a message and what to do instead. */
function Card({
  file,
  children,
  action,
  onDownload,
}: {
  file: DriveItem;
  children: ReactNode;
  action?: ReactNode;
  onDownload?: () => void;
}) {
  return (
    <div className="grid w-full max-w-sm justify-items-center gap-4 rounded-xl bg-card p-8 text-center text-card-foreground">
      <ItemIcon item={file} className="size-16" />
      <div className="grid w-full gap-1">
        <p className="font-medium wrap-anywhere">{file.name}</p>
        <p className="text-sm text-muted-foreground">
          {itemTypeLabel(file)}
          {file.size !== null && ` · ${formatBytes(file.size)}`}
        </p>
      </div>
      <p className="text-sm">{children}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {action}
        {onDownload && (
          <Button onClick={onDownload}>
            <Download />
            Download
          </Button>
        )}
      </div>
    </div>
  );
}
