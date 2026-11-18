import { Search } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/app/empty-state";
import { BrowserSkeleton } from "@/components/drive/browser-skeleton";
import { FolderBrowser } from "@/components/drive/folder-browser";
import { SearchFilters } from "@/components/drive/search-filters";
import { modifiedRange, parseSearchParams } from "@/lib/drive/search";
import { parseSort } from "@/lib/drive/sort";
import { searchDrive } from "@/server/services/drive";
import { getMyProfile } from "@/server/services/profile";

import type { Metadata } from "next";

type Props = PageProps<"/drive/search">;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseSearchParams(await searchParams);
  return { title: q ? `“${q}”` : "Search" };
}

async function Results({ searchParams }: Props) {
  const raw = await searchParams;
  const params = parseSearchParams(raw);
  if (!params.q) {
    return (
      <EmptyState icon={Search} title="Search your drive">
        Type part of a name in the search box above. Results include what others have shared with
        you.
      </EmptyState>
    );
  }
  // "Last 7 days" counts back from now, so this is worked out per request.
  await connection();
  const range = modifiedRange(params);
  const open =
    typeof raw.open === "string" && z.uuid().safeParse(raw.open).success ? raw.open : undefined;
  const [items, profile] = await Promise.all([
    searchDrive({
      query: params.q,
      type: params.type,
      owner: params.owner,
      modifiedFrom: range.from,
      modifiedTo: range.to,
    }),
    getMyProfile(),
  ]);
  return (
    <FolderBrowser
      // A new search starts fresh: selection, preview and all.
      key={JSON.stringify(params)}
      mode="search"
      title={`Results for “${params.q}”`}
      toolbar={<SearchFilters params={params} />}
      folder={null}
      items={items}
      crumbs={[]}
      sharedRoot={false}
      sort={parseSort(raw)}
      view={profile.driveView}
      canEdit={false}
      currentUserId={profile.id}
      {...(open && items.some((item) => item.id === open) && { initialPreviewId: open })}
    />
  );
}

export default function SearchPage(props: Props) {
  return (
    <Suspense fallback={<BrowserSkeleton />}>
      <Results {...props} />
    </Suspense>
  );
}
