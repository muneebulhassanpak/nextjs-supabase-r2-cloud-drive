import { ChevronRight } from "lucide-react";
import Link from "next/link";

import type { Crumb } from "@/lib/drive/types";

/** Where this folder is: My Drive (or Shared with me) › … › this folder. */
export function Breadcrumbs({
  crumbs,
  current,
  sharedRoot,
}: {
  crumbs: Crumb[];
  current: string | null;
  sharedRoot: boolean;
}) {
  const root = sharedRoot
    ? { href: "/drive/shared", label: "Shared with me" }
    : { href: "/drive", label: "My Drive" };
  const linkClass =
    "truncate rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-0.5 overflow-x-auto text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">
        {current === null ? (
          <li>
            <h1 className="px-1.5 py-1">{root.label}</h1>
          </li>
        ) : (
          <>
            <li className="min-w-0 shrink-0">
              <Link href={root.href} className={linkClass}>
                {root.label}
              </Link>
            </li>
            {crumbs.map((crumb) => (
              <li key={crumb.id} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Link href={`/drive/folders/${crumb.id}`} className={linkClass}>
                  {crumb.name}
                </Link>
              </li>
            ))}
            <li className="flex min-w-0 items-center gap-0.5">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <h1 className="truncate px-1.5 py-1" aria-current="page">
                {current}
              </h1>
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
