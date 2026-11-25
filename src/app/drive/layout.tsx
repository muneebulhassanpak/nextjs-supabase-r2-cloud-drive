import Link from "next/link";
import { Suspense } from "react";

import { Account, AccountSkeleton } from "@/components/app/account";
import { DemoBanner } from "@/components/app/demo-banner";
import { MobileNav } from "@/components/app/mobile-nav";
import { Nav } from "@/components/app/nav";
import { SearchBox, SearchBoxFallback } from "@/components/app/search-box";
import { ShortcutsHelp } from "@/components/app/shortcuts-help";
import { StorageMeter, StorageMeterSkeleton } from "@/components/app/storage-meter";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { UploadProvider } from "@/components/uploads/upload-provider";

/**
 * The signed-in app: sidebar, top bar, then the page. The frame is static, so it shows at once;
 * the parts that read the session (storage, account) stream in behind their own boundaries.
 * src/proxy.ts keeps signed-out people out; every data read checks the session again.
 * Uploads run above the pages, so they carry on while people move between folders.
 */
export default function DriveLayout({ children }: LayoutProps<"/drive">) {
  const storage = (
    <Suspense fallback={<StorageMeterSkeleton />}>
      <StorageMeter />
    </Suspense>
  );
  return (
    <UploadProvider>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between border-r px-3 py-4 md:flex">
          <div className="grid gap-6">
            <Link href="/drive" aria-label="Lockerly: My Drive" className="px-3">
              <Brand />
            </Link>
            <Nav />
          </div>
          {storage}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
            <MobileNav footer={storage} />
            <Suspense fallback={<SearchBoxFallback />}>
              <SearchBox />
            </Suspense>
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <Suspense fallback={<AccountSkeleton />}>
                <Account />
              </Suspense>
            </div>
          </header>
          <Suspense>
            <DemoBanner />
          </Suspense>
          <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
        </div>
        <ShortcutsHelp />
        <Toaster position="bottom-center" />
      </div>
    </UploadProvider>
  );
}
