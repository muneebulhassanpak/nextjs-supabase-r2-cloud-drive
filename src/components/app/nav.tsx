"use client";

import { Clock, HardDrive, Star, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/drive", label: "My Drive", icon: HardDrive },
  { href: "/drive/shared", label: "Shared with me", icon: Users },
  { href: "/drive/recent", label: "Recent", icon: Clock },
  { href: "/drive/starred", label: "Starred", icon: Star },
  { href: "/drive/trash", label: "Trash", icon: Trash2 },
] as const;

/** The section a path belongs to: the longest matching prefix ("/drive/trash/x" → Trash). */
function activeHref(pathname: string): string | undefined {
  return NAV_ITEMS.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

interface NavProps {
  onNavigate?: () => void;
}

/**
 * The main sections of the app. Used in the sidebar and in the phone menu. The current path isn't
 * known while prerendering a dynamic route, so the links show first and the highlight follows.
 */
export function Nav(props: NavProps) {
  return (
    <Suspense fallback={<NavLinks {...props} />}>
      <CurrentNav {...props} />
    </Suspense>
  );
}

function CurrentNav(props: NavProps) {
  return <NavLinks {...props} active={activeHref(usePathname())} />;
}

function NavLinks({ onNavigate, active: activeItem }: NavProps & { active?: string | undefined }) {
  return (
    <nav aria-label="Drive" className="grid gap-1">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === activeItem;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              active && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
