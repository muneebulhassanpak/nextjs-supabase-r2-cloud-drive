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
  image: { icon: FileImage, color: "text-file-image", label: "Image" },
  video: { icon: FileVideo, color: "text-file-video", label: "Video" },
  audio: { icon: FileAudio, color: "text-file-audio", label: "Audio" },
  pdf: { icon: FileText, color: "text-file-pdf", label: "PDF" },
  document: { icon: FileText, color: "text-file-document", label: "Document" },
  spreadsheet: { icon: FileSpreadsheet, color: "text-file-spreadsheet", label: "Spreadsheet" },
  presentation: { icon: Presentation, color: "text-file-presentation", label: "Presentation" },
  text: { icon: FileCode, color: "text-file-text", label: "Text" },
  archive: { icon: FileArchive, color: "text-file-archive", label: "Archive" },
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
    return <Folder className={cn("fill-current text-file-folder", className)} aria-hidden />;
  }
  const { icon: Icon, color } = ICONS[item.category ?? "other"];
  return <Icon className={cn(color, className)} aria-hidden />;
}
