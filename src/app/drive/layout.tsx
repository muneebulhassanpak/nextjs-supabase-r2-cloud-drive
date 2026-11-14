import { Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Account, AccountSkeleton } from "@/components/app/account";
import { MobileNav } from "@/components/app/mobile-nav";
import { Nav } from "@/components/app/nav";
import { StorageMeter, StorageMeterSkeleton } from "@/components/app/storage-meter";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";

/**
 * The signed-in app: sidebar, top bar, then the page. The frame is static, so it shows at once;
 * the parts that read the session (storage, account) stream in behind their own boundaries.
 * src/proxy.ts keeps signed-out people out; every data read checks the session again.
 */
export default function DriveLayout({ children }: LayoutProps<"/drive">) {
  const storage = (
    <Suspense fallback={<StorageMeterSkeleton />}>
      <StorageMeter />
    </Suspense>
  );
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between border-r px-3 py-4 md:flex">
        <div className="grid gap-6">
          <Link href="/drive" aria-label="My Drive" className="px-3">
            <Brand />
          </Link>
          <Nav />
        </div>
        {storage}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
          <MobileNav footer={storage} />
          <div className="relative max-w-xl flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search in Lockerly"
              aria-label="Search in Lockerly"
              className="pl-9"
              disabled
              title="Search is coming soon"
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<AccountSkeleton />}>
              <Account />
            </Suspense>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </div>
      <Toaster position="bottom-center" />
    </div>
  );
}
