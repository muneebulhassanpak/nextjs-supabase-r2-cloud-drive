import { Suspense } from "react";

import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { FolderBrowser } from "@/components/drive/folder-browser";
import { parseSort } from "@/lib/drive/sort";
import { getStarred } from "@/server/services/drive";
import { getMyProfile } from "@/server/services/profile";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Starred" };

async function Starred({
  searchParams,
}: {
  searchParams: PageProps<"/drive/starred">["searchParams"];
}) {
  const [items, profile, params] = await Promise.all([getStarred(), getMyProfile(), searchParams]);
  return (
    <FolderBrowser
      mode="starred"
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

export default function StarredPage({ searchParams }: PageProps<"/drive/starred">) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <Starred searchParams={searchParams} />
    </Suspense>
  );
}
