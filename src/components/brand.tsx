import { LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

/** The Lockerly mark on its own: a keyhole on the brand colour. `lg` heads a page or card. */
export function BrandMark({
  size = "default",
  className,
}: {
  size?: "default" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center bg-linear-to-b from-primary to-primary/85 text-primary-foreground shadow-soft",
        size === "lg" ? "size-12 rounded-2xl ring-8 ring-primary-subtle" : "size-7 rounded-lg",
        className,
      )}
    >
      <LockKeyhole className={size === "lg" ? "size-6" : "size-4"} />
    </span>
  );
}

/** The Lockerly wordmark: mark + name. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <BrandMark />
      Lockerly
    </span>
  );
}
