import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { FolderBrowser } from "@/components/drive/folder-browser";
import { parseSort } from "@/lib/drive/sort";
import { getFolder } from "@/server/services/drive";
import { getMyProfile } from "@/server/services/profile";

import type { Metadata } from "next";

type Props = PageProps<"/drive/folders/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const view = z.uuid().safeParse(id).success ? await getFolder(id) : null;
  return { title: view?.folder?.name ?? "Folder" };
}

async function Folder({ params, searchParams }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [view, profile, query] = await Promise.all([getFolder(id), getMyProfile(), searchParams]);
  if (!view?.folder) notFound();
  return (
    <FolderBrowser
      folder={{ id: view.folder.id, name: view.folder.name }}
      items={view.items}
      crumbs={view.crumbs}
      sharedRoot={view.sharedRoot}
      sort={parseSort(query)}
      view={profile.driveView}
      canEdit={view.folder.role !== "viewer"}
      currentUserId={profile.id}
    />
  );
}

export default function FolderPage(props: Props) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <Folder {...props} />
    </Suspense>
  );
}
