import { Backdrop } from "@/components/ui/backdrop";
import { cn } from "@/lib/utils";

import type { ComponentProps, ReactNode } from "react";

/** The width every marketing section lines up to. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />;
}

/** A small label in the brand colour above a heading. */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm font-medium text-primary", className)} {...props} />;
}

/**
 * A section's opening: eyebrow and heading, with the description beside them on wide screens
 * (or under them, centred, when `align="center"`).
 */
export function SectionIntro({
  eyebrow,
  title,
  description,
  align = "split",
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "split" | "center";
  /** Gives the heading an id, for the section's aria-labelledby. */
  id?: string;
}) {
  if (align === "center") {
    return (
      <div className="mx-auto grid max-w-2xl justify-items-center gap-4 text-center">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id} className="text-headline text-balance">
          {title}
        </h2>
        {description && <p className="text-pretty text-muted-foreground">{description}</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr] lg:items-end lg:gap-16">
      <div className="grid gap-4">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={id} className="max-w-2xl text-headline text-balance">
          {title}
        </h2>
      </div>
      {description && <p className="text-pretty text-muted-foreground lg:pb-1">{description}</p>}
    </div>
  );
}

/** An icon on a pale wash of the brand colour (or on a translucent white, on the brand colour). */
export function IconChip({
  children,
  inverse = false,
  className,
}: {
  children: ReactNode;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
        inverse
          ? "bg-brand-foreground/15 text-brand-foreground"
          : "bg-primary-subtle text-primary-subtle-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A large rounded panel that a section sits in, with the grid backdrop: canvas-coloured, or the
 * brand colour for a call to action.
 */
export function Panel({
  tone = "canvas",
  glow = "top",
  className,
  children,
}: {
  tone?: "canvas" | "brand";
  glow?: "center" | "top" | "none";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-4xl px-6 py-12 sm:px-12",
        tone === "brand" ? "bg-brand text-brand-foreground" : "bg-canvas",
        className,
      )}
    >
      <Backdrop glow={glow} inverse={tone === "brand"} />
      {children}
    </div>
  );
}
