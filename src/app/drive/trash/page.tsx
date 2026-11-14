import { Suspense } from "react";

import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { FolderBrowser } from "@/components/drive/folder-browser";
import { parseSort } from "@/lib/drive/sort";
import { getTrash } from "@/server/services/drive";
import { getMyProfile } from "@/server/services/profile";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trash" };

async function Trash({
  searchParams,
}: {
  searchParams: PageProps<"/drive/trash">["searchParams"];
}) {
  const [items, profile, params] = await Promise.all([getTrash(), getMyProfile(), searchParams]);
  return (
    <FolderBrowser
      mode="trash"
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

export default function TrashPage({ searchParams }: PageProps<"/drive/trash">) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <Trash searchParams={searchParams} />
    </Suspense>
  );
}
