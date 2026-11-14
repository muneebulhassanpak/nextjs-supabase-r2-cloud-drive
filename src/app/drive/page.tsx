import { Suspense } from "react";

import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { FolderBrowser } from "@/components/drive/folder-browser";
import { parseSort } from "@/lib/drive/sort";
import { getMyDriveRoot } from "@/server/services/drive";
import { getMyProfile } from "@/server/services/profile";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Drive" };

async function MyDrive({ searchParams }: { searchParams: PageProps<"/drive">["searchParams"] }) {
  const [root, profile, params] = await Promise.all([
    getMyDriveRoot(),
    getMyProfile(),
    searchParams,
  ]);
  return (
    <FolderBrowser
      folder={null}
      items={root.items}
      crumbs={[]}
      sharedRoot={false}
      sort={parseSort(params)}
      view={profile.driveView}
      canEdit
      currentUserId={profile.id}
    />
  );
}

export default function MyDrivePage({ searchParams }: PageProps<"/drive">) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <MyDrive searchParams={searchParams} />
    </Suspense>
  );
}
