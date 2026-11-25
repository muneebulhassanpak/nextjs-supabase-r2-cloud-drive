"use client";

import { Loader2, Play } from "lucide-react";
import { useActionState } from "react";

import { startDemo } from "@/app/(auth)/demo-actions";
import { Button } from "@/components/ui/button";

import type { ComponentProps } from "react";

/** Signs in to the shared demo account in one click. */
export function DemoButton({
  className,
  ...props
}: Pick<ComponentProps<typeof Button>, "variant" | "size" | "className">) {
  const [state, action, pending] = useActionState(startDemo, undefined);
  return (
    <form action={action} className="grid gap-2">
      <Button type="submit" aria-disabled={pending} className={className} {...props}>
        {pending ? <Loader2 className="animate-spin" /> : <Play />}
        {pending ? "Opening the demo…" : "Try the demo"}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="max-w-xs text-sm text-destructive">
          {state.error.message}
        </p>
      )}
    </form>
  );
}
