import { Suspense } from "react";

import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { FolderBrowser } from "@/components/drive/folder-browser";
import { parseSort } from "@/lib/drive/sort";
import { getSharedWithMe } from "@/server/services/drive";
import { getMyProfile } from "@/server/services/profile";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Shared with me" };

async function Shared({
  searchParams,
}: {
  searchParams: PageProps<"/drive/shared">["searchParams"];
}) {
  const [items, profile, params] = await Promise.all([
    getSharedWithMe(),
    getMyProfile(),
    searchParams,
  ]);
  return (
    <FolderBrowser
      mode="shared"
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

export default function SharedPage({ searchParams }: PageProps<"/drive/shared">) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <Shared searchParams={searchParams} />
    </Suspense>
  );
}
