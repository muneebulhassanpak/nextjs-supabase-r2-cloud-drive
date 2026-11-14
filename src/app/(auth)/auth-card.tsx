import { BrandMark } from "@/components/brand";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The card every auth page sits in: the mark (or an icon that says what happened), a heading and
 * a line of help, then the form, and a way to the other auth pages along the bottom.
 */
export function AuthCard({
  title,
  description,
  icon: Icon,
  children,
  footer,
}: {
  title: string;
  icon?: LucideIcon;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card size="lg" className="relative isolate">
      {/* A wash of the brand colour behind the mark. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-48 bg-radial-[at_50%_0%] from-primary-subtle to-transparent to-70%"
      />
      <CardHeader className="justify-items-center gap-2 text-center">
        {Icon ? (
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary-subtle text-primary-subtle-foreground ring-8 ring-primary-subtle/50">
            <Icon className="size-6" aria-hidden />
          </span>
        ) : (
          <BrandMark size="lg" className="mb-4" />
        )}
        <h1 className="text-title">{title}</h1>
        {description && <CardDescription className="text-balance">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && (
        <CardFooter className="justify-center text-center text-sm text-muted-foreground">
          <p>{footer}</p>
        </CardFooter>
      )}
    </Card>
  );
}
