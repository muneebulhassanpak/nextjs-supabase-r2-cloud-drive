import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
  type LucideIcon,
} from "lucide-react";

import type { DriveItem, ItemCategory } from "@/lib/drive/types";
import { cn } from "@/lib/utils";

const ICONS: Record<ItemCategory, { icon: LucideIcon; color: string; label: string }> = {
  image: { icon: FileImage, color: "text-rose-500", label: "Image" },
  video: { icon: FileVideo, color: "text-violet-500", label: "Video" },
  audio: { icon: FileAudio, color: "text-amber-500", label: "Audio" },
  pdf: { icon: FileText, color: "text-red-500", label: "PDF" },
  document: { icon: FileText, color: "text-blue-500", label: "Document" },
  spreadsheet: { icon: FileSpreadsheet, color: "text-green-600", label: "Spreadsheet" },
  presentation: { icon: Presentation, color: "text-orange-500", label: "Presentation" },
  text: { icon: FileCode, color: "text-slate-500", label: "Text" },
  archive: { icon: FileArchive, color: "text-yellow-600", label: "Archive" },
  other: { icon: File, color: "text-muted-foreground", label: "File" },
};

/** "Folder", "PDF", "Spreadsheet"… */
export function itemTypeLabel(item: Pick<DriveItem, "kind" | "category">): string {
  return item.kind === "folder" ? "Folder" : ICONS[item.category ?? "other"].label;
}

export function ItemIcon({
  item,
  className,
}: {
  item: Pick<DriveItem, "kind" | "category">;
  className?: string;
}) {
  if (item.kind === "folder") {
    return <Folder className={cn("fill-current text-sky-500", className)} aria-hidden />;
  }
  const { icon: Icon, color } = ICONS[item.category ?? "other"];
  return <Icon className={cn(color, className)} aria-hidden />;
}
