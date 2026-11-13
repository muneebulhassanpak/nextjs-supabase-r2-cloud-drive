import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <>
      <header className="flex items-center justify-between px-6 py-4">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your files, safe and in one place.
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Upload, organise, preview and share files. Coming soon.
        </p>
      </main>
    </>
  );
}
