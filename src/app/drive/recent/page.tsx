import { Suspense } from "react";

import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { FolderBrowser } from "@/components/drive/folder-browser";
import { parseSort } from "@/lib/drive/sort";
import { getRecent } from "@/server/services/drive";
import { getMyProfile } from "@/server/services/profile";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Recent" };

async function Recent({
  searchParams,
}: {
  searchParams: PageProps<"/drive/recent">["searchParams"];
}) {
  const [items, profile, params] = await Promise.all([getRecent(), getMyProfile(), searchParams]);
  return (
    <FolderBrowser
      mode="recent"
      folder={null}
      items={items}
      crumbs={[]}
      sharedRoot={false}
      sort={parseSort(params)}
      view={profile.driveView}
      canEdit={false}
      currentUserId={profile.id}
    />
  );
}

export default function RecentPage({ searchParams }: PageProps<"/drive/recent">) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <Recent searchParams={searchParams} />
    </Suspense>
  );
}
