import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a folder loads: the header and a few rows, so the page doesn't jump. */
export function BrowserSkeleton() {
  return (
    <div className="grid gap-4" aria-busy aria-label="Loading">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
