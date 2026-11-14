import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { ReactNode } from "react";

/** The card every auth page sits in: a heading, a line of help, then the form. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {footer && <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>}
    </>
  );
}
