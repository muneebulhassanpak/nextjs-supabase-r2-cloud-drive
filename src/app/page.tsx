import Link from "next/link";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <>
      <header className="flex items-center justify-between gap-2 px-6 py-4">
        <Brand />
        <nav className="flex items-center gap-1" aria-label="Account">
          <ThemeToggle />
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
            Sign in
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your files, safe and in one place.
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Upload, organise, preview and share files. Start with 100 MB free.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
            Create a free account
          </Link>
          <Link href="/sign-in" className={buttonVariants({ size: "lg", variant: "outline" })}>
            Sign in
          </Link>
        </div>
      </main>
    </>
  );
}
