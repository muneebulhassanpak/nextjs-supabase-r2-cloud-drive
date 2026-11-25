import { Suspense } from "react";

import { ActivityFeed } from "@/components/drive/activity-feed";
import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { parseActivityFilters } from "@/lib/drive/activity-filters";
import { requireUser } from "@/server/auth/session";
import { getMyActivity } from "@/server/services/activity";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activity" };

type Props = PageProps<"/drive/activity">;

async function Feed({ searchParams }: Props) {
  const filters = parseActivityFilters(await searchParams);
  const [user, page] = await Promise.all([requireUser(), getMyActivity(filters)]);
  return (
    <ActivityFeed
      // New filters, or something newer at the top, start from the first page.
      key={`${JSON.stringify(filters)}:${String(page.entries[0]?.id ?? "")}`}
      filters={filters}
      initial={page}
      currentUserId={user.id}
    />
  );
}

export default function ActivityPage(props: Props) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <Feed {...props} />
    </Suspense>
  );
}
