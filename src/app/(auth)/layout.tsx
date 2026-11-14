import Link from "next/link";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" aria-label="Lockerly home">
          <Brand />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </>
  );
}
