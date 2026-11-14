import { Cloud } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";
import { getMyProfile } from "@/server/services/profile";

/** How much of the storage quota is used. Reads the profile, so render it inside <Suspense>. */
export async function StorageMeter() {
  const { storageUsed, storageQuota } = await getMyProfile();
  const percent = Math.min(100, Math.round((storageUsed / storageQuota) * 100));
  return (
    <div className="grid gap-2 px-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Cloud className="size-4" aria-hidden />
        Storage
      </div>
      <Progress value={percent} aria-label={`Storage ${percent}% used`} />
      <p className="text-xs text-muted-foreground">
        {formatBytes(storageUsed)} of {formatBytes(storageQuota)} used
      </p>
    </div>
  );
}

export function StorageMeterSkeleton() {
  return (
    <div className="grid gap-2 px-3" aria-hidden>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
