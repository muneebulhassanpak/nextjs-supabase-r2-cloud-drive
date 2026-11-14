import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// Lockerly's signature shape: a card with a folder tab on its top-left corner. The tab and the
// body share one fill, so tones are solid colours without borders; pick the tone that stands out
// from what the card sits on (card on canvas, canvas on the page, brand anywhere).
const tone = cva("", {
  variants: {
    tone: {
      brand: "bg-brand fill-brand text-brand-foreground",
      card: "bg-card fill-card text-card-foreground",
      canvas: "bg-canvas fill-canvas text-foreground",
      subtle: "bg-primary-subtle fill-primary-subtle text-foreground",
    },
  },
  defaultVariants: { tone: "canvas" },
});

function FolderCard({
  className,
  tone: toneName,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof tone>) {
  const fill = tone({ tone: toneName });
  return (
    <div
      data-slot="folder-card"
      className={cn("relative flex flex-col pt-5", className)}
      {...props}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 flex h-5">
        <div className={cn("h-full w-2/5 max-w-40 rounded-tl-2xl", fill)} />
        {/* The tab's sloped edge, meeting the top of the card. */}
        <svg
          viewBox="0 0 28 20"
          preserveAspectRatio="none"
          className={cn("-ml-px h-full w-7", fill, "bg-transparent")}
        >
          <path d="M0 0h3c6 0 8.5 3 11.5 9.5S21 20 28 20H0Z" />
        </svg>
      </div>
      <div className={cn("flex flex-1 flex-col rounded-2xl rounded-tl-none p-6", fill)}>
        {children}
      </div>
    </div>
  );
}

export { FolderCard };
