import { cn } from "@/lib/utils";

/**
 * Decoration behind a section: the faint grid, fading out towards the edges, and a soft glow of
 * the brand colour. Put it first inside a `relative isolate` container; it never takes clicks.
 */
export function Backdrop({
  glow = "center",
  inverse = false,
  className,
}: {
  /** Where the glow sits: behind the middle, along the top edge, or nowhere. */
  glow?: "center" | "top" | "none";
  /** On a brand-coloured surface: light grid lines, no glow. */
  inverse?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        inverse && "[--grid-line:color-mix(in_oklch,var(--brand-foreground)_14%,transparent)]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-grid mask-radial-from-10% mask-radial-to-70%" />
      {glow !== "none" && !inverse && (
        <div
          className={cn(
            "absolute left-1/2 h-112 w-[min(56rem,100%)] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl dark:bg-primary/10",
            glow === "center" ? "top-1/2 -translate-y-1/2" : "-top-56",
          )}
        />
      )}
    </div>
  );
}
