import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** What a section shows while there's nothing in it. */
export function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="font-medium">{title}</h2>
      <p className="max-w-sm text-sm text-balance text-muted-foreground">{children}</p>
    </div>
  );
}
