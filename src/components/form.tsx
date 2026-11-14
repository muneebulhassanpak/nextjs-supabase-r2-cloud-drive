"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import { useId, type ComponentProps } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A labelled input with its validation messages, wired up for screen readers. */
export function Field({
  label,
  errors,
  hint,
  ...input
}: ComponentProps<typeof Input> & { label: string; errors?: string[]; hint?: string }) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = errors?.[0] ?? hint;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        {...input}
      />
      {message && (
        <p
          id={messageId}
          className={errors?.length ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** The form-level error, announced when it appears. */
export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  pending,
  children,
  ...props
}: ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button type="submit" size="lg" disabled={pending} aria-disabled={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
