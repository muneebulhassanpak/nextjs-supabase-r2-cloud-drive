import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A whole page that says one thing: not found, or something went wrong. */
export function MessagePage({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary-subtle text-primary-subtle-foreground ring-8 ring-primary-subtle/50">
        <Icon className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-title">{title}</h1>
      <p className="max-w-sm text-balance text-muted-foreground">{children}</p>
      {action}
    </main>
  );
}
