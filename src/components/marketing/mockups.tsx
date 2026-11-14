import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  HardDrive,
  Lock,
  RotateCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { ItemIcon } from "@/components/drive/item-icon";
import type { ItemCategory } from "@/lib/drive/types";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

// Pictures of the product, drawn with the app's own tokens and icons, so they follow the theme
// and never go stale like screenshots. Each is one image to assistive tech, with a description.

type MockItem = { name: string; meta: string } & (
  { kind: "folder"; category: null } | { kind: "file"; category: ItemCategory }
);

const FILES: MockItem[] = [
  { name: "Brand assets", meta: "12 items", kind: "folder", category: null },
  { name: "Quarterly report.pdf", meta: "2.4 MB", kind: "file", category: "pdf" },
  { name: "Team offsite.jpg", meta: "3.1 MB", kind: "file", category: "image" },
  { name: "Launch teaser.webm", meta: "18.2 MB", kind: "file", category: "video" },
  { name: "Budget 2027.csv", meta: "24 KB", kind: "file", category: "spreadsheet" },
  { name: "upload.ts", meta: "6 KB", kind: "file", category: "text" },
];

/** A window frame: the dots, then whatever's inside. */
function Window({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-card text-card-foreground shadow-float ring-1 ring-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Dots() {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="size-2.5 rounded-full bg-border" />
      ))}
    </div>
  );
}

/** A small floating note beside a mockup. */
function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "absolute flex items-center gap-2.5 rounded-xl bg-card px-3 py-2 text-xs shadow-float ring-1 ring-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full bg-primary", className)}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/** The hero's picture: a folder in My Drive, with notes floating around it. */
export function DriveMockup() {
  const nav = [
    { label: "My Drive", icon: HardDrive, active: true },
    { label: "Recent", icon: Clock },
    { label: "Starred", icon: Star },
    { label: "Trash", icon: Trash2 },
  ];
  return (
    <div
      role="img"
      aria-label="Lockerly showing a folder of files: a PDF report, photos, a video, a spreadsheet and code"
      className="relative"
    >
      <Window>
        <div className="flex items-center gap-4 border-b px-4 py-3">
          <Dots />
          <div className="flex h-7 flex-1 items-center gap-2 rounded-lg bg-muted px-2.5 text-xs text-muted-foreground sm:max-w-56">
            <Search className="size-3.5" />
            Search in Lockerly
          </div>
        </div>
        <div className="grid sm:grid-cols-[9.5rem_1fr]">
          <div className="hidden flex-col justify-between gap-6 border-r p-3 sm:flex">
            <div className="grid gap-0.5">
              {nav.map(({ label, icon: Icon, active }) => (
                <span
                  key={label}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                    active
                      ? "bg-primary-subtle font-medium text-primary-subtle-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </span>
              ))}
            </div>
            <div className="grid gap-1.5 text-[0.6875rem] text-muted-foreground">
              <Meter value={38} />
              38 MB of 100 MB
            </div>
          </div>
          <div className="p-3 sm:p-4">
            <p className="mb-2 px-2 text-xs text-muted-foreground">
              My Drive <span className="mx-1">›</span>
              <span className="font-medium text-foreground">Projects</span>
            </p>
            <ul className="grid">
              {FILES.map((item, index) => (
                <li
                  key={item.name}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-2 py-2 text-xs",
                    index === 1 && "bg-primary-subtle",
                  )}
                >
                  <ItemIcon item={item} className="size-4" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                  <span className="text-muted-foreground">{item.meta}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Window>
      <Chip className="-top-4 right-4 hidden sm:flex lg:-right-6">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" />
        </span>
        <span>
          <span className="block font-medium">3 uploads complete</span>
          <span className="text-muted-foreground">Projects</span>
        </span>
      </Chip>
      <Chip className="-bottom-5 left-6 hidden sm:flex lg:-left-8">
        <Lock className="size-4 text-primary" />
        <span className="font-medium">Only you can see this folder</span>
      </Chip>
    </div>
  );
}

/** Storage by kind of file. */
export function StorageMockup() {
  const kinds: { label: string; size: string; share: number; category: ItemCategory }[] = [
    { label: "Videos", size: "18.2 MB", share: 48, category: "video" },
    { label: "Images", size: "9.6 MB", share: 25, category: "image" },
    { label: "Documents", size: "6.1 MB", share: 16, category: "pdf" },
    { label: "Everything else", size: "4.3 MB", share: 11, category: "archive" },
  ];
  const fill: Record<string, string> = {
    video: "bg-file-video",
    image: "bg-file-image",
    pdf: "bg-file-pdf",
    archive: "bg-file-archive",
  };
  return (
    <Window className="w-full max-w-sm">
      <div role="img" aria-label="Storage: 38 MB of 100 MB used, mostly videos and images">
        <div className="flex items-baseline justify-between border-b px-5 py-4">
          <span className="text-sm font-medium">Storage</span>
          <span className="text-xs text-muted-foreground">38 MB of 100 MB</span>
        </div>
        <div className="grid gap-5 p-5">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
            {kinds.map((kind) => (
              <span
                key={kind.label}
                className={fill[kind.category]}
                style={{ width: `${kind.share * 0.38}%` }}
              />
            ))}
          </div>
          <ul className="grid gap-3">
            {kinds.map((kind) => (
              <li key={kind.label} className="flex items-center gap-3 text-xs">
                <span className="grid size-8 place-items-center rounded-lg bg-muted">
                  <ItemIcon item={{ kind: "file", category: kind.category }} className="size-4" />
                </span>
                <span className="flex-1 font-medium">{kind.label}</span>
                <span className="text-muted-foreground">{kind.size}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Window>
  );
}

/** A file open in the viewer: highlighted code, with the files around it a step away. */
export function PreviewMockup() {
  const code: { text: string; className?: string }[][] = [
    [
      { text: "export async function ", className: "text-primary" },
      { text: "upload" },
      { text: "(file: File) {" },
    ],
    [
      { text: "  const ", className: "text-primary" },
      { text: "link = " },
      { text: "await ", className: "text-primary" },
      { text: "signUpload(file);" },
    ],
    [{ text: "  // The bytes go straight to storage.", className: "text-muted-foreground" }],
    [
      { text: "  await ", className: "text-primary" },
      { text: "fetch(link, { method: " },
      { text: '"PUT"', className: "text-chart-5" },
      { text: ", body: file });" },
    ],
    [{ text: "  return ", className: "text-primary" }, { text: "complete(file.name);" }],
    [{ text: "}" }],
  ];
  return (
    <Window className="w-full max-w-md">
      <div role="img" aria-label="A code file open in the viewer, with syntax highlighting">
        <div className="flex items-center gap-2.5 border-b px-4 py-3 text-xs">
          <ItemIcon item={{ kind: "file", category: "text" }} className="size-4" />
          <span className="flex-1 font-medium">upload.ts</span>
          <span className="text-muted-foreground">3 of 8</span>
          <Download className="size-3.5 text-muted-foreground" />
          <X className="size-3.5 text-muted-foreground" />
        </div>
        <div className="relative px-4 py-5">
          <pre className="overflow-hidden font-mono text-[0.6875rem] leading-6">
            {code.map((line, index) => (
              <div key={index} className="flex">
                <span className="w-6 shrink-0 text-muted-foreground/60 select-none">
                  {index + 1}
                </span>
                <span className="whitespace-pre">
                  {line.map((token, part) => (
                    <span key={part} className={token.className}>
                      {token.text}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </pre>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ChevronLeft className="size-3.5" /> Team offsite.jpg
          </span>
          <span className="flex items-center gap-1">
            Budget 2027.csv <ChevronRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Window>
  );
}

/** The uploads panel, part way through. */
export function UploadsMockup() {
  const uploads: { name: string; category: ItemCategory; status: ReactNode; progress?: number }[] =
    [
      {
        name: "Launch teaser.webm",
        category: "video",
        status: "12.4 of 18.2 MB",
        progress: 68,
      },
      {
        name: "Team offsite.jpg",
        category: "image",
        status: (
          <span className="flex items-center gap-1 text-primary">
            <Check className="size-3.5" /> Uploaded
          </span>
        ),
      },
      {
        name: "Quarterly report (1).pdf",
        category: "pdf",
        status: "Renamed: that name was taken",
      },
      {
        name: "Archive.zip",
        category: "archive",
        status: (
          <span className="flex items-center gap-1 text-destructive">
            Connection lost <RotateCw className="size-3" /> Retry
          </span>
        ),
      },
    ];
  return (
    <Window className="w-full max-w-sm">
      <div
        role="img"
        aria-label="The uploads panel: one file uploading, others done, one ready to retry"
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <span className="text-sm font-medium">Uploading 1 of 4</span>
          <X className="size-4 text-muted-foreground" />
        </div>
        <ul className="grid gap-4 p-5">
          {uploads.map((upload) => (
            <li key={upload.name} className="grid gap-2 text-xs">
              <div className="flex items-center gap-3">
                <ItemIcon item={{ kind: "file", category: upload.category }} className="size-4" />
                <span className="min-w-0 flex-1 truncate font-medium">{upload.name}</span>
              </div>
              {upload.progress !== undefined && <Meter value={upload.progress} />}
              <span className="pl-7 text-muted-foreground">{upload.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </Window>
  );
}
