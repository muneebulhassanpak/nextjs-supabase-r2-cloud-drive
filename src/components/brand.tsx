import { LockKeyhole } from "lucide-react";

import { cn } from "@/lib/utils";

/** The Lockerly wordmark: icon + name. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <LockKeyhole className="size-4" aria-hidden />
      </span>
      Lockerly
    </span>
  );
}
