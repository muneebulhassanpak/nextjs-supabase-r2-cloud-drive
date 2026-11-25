"use client";

import { useState } from "react";

import type { DriveItem } from "@/lib/drive/types";
import { thumbnailSrc } from "@/lib/files/api";
import { hasThumbnail } from "@/lib/files/preview";

import { ItemIcon } from "./item-icon";

type Pictured =
  | Pick<DriveItem, "id" | "kind" | "category" | "mimeType" | "size">
  | { id: string; kind: "folder" };

/** An item at a glance: the image itself, or its icon on a floating card. */
export function ItemPicture({ item }: { item: Pictured }) {
  const [failed, setFailed] = useState(false);
  if (!failed && "mimeType" in item && hasThumbnail(item)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed storage link
      <img
        src={thumbnailSrc(item.id)}
        alt=""
        decoding="async"
        draggable={false}
        onError={() => {
          setFailed(true);
        }}
        className="max-h-full max-w-full rounded-xl object-contain shadow-float max-md:max-h-32"
      />
    );
  }
  return (
    <div className="grid size-32 place-items-center rounded-3xl bg-card shadow-float ring-1 ring-foreground/5">
      <ItemIcon
        item={"category" in item ? item : { kind: "folder", category: null }}
        className="size-14"
      />
    </div>
  );
}
