import Link from "next/link";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

import { Container } from "./section";
import { StickyHeader } from "./sticky-header";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#security", label: "Security" },
  { href: "https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive", label: "Source" },
];

/** The header on every public page: the landing page and the auth pages. */
export function SiteHeader() {
  return (
    <StickyHeader>
      <Container className="flex h-16 items-center gap-4">
        <Link href="/" aria-label="Lockerly home" className="rounded-lg">
          <Brand />
        </Link>
        <nav aria-label="Sections" className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className={buttonVariants({ variant: "ghost" })}>
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Account" className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
          <Link href="/sign-up" className={buttonVariants()}>
            Get started
          </Link>
        </nav>
      </Container>
    </StickyHeader>
  );
}
