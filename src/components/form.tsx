"use client";

import { CircleAlert, Eye, EyeOff, Loader2 } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = ComponentProps<typeof Input> & {
  label: string;
  errors?: string[];
  hint?: string;
  /** Sits at the end of the label's line, e.g. a "Forgot password?" link. */
  action?: ReactNode;
  /** Sits inside the input, at its end (the input leaves room for it). */
  adornment?: ReactNode;
};

/** A labelled input with its validation messages, wired up for screen readers. */
export function Field({ label, errors, hint, action, adornment, className, ...input }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = errors?.[0] ?? hint;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative col-span-2">
        <Input
          id={id}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(adornment && "pr-10", className)}
          {...input}
        />
        {adornment && (
          <div className="absolute inset-y-0 right-1 flex items-center">{adornment}</div>
        )}
      </div>
      {/* After the input in tab order, but shown at the end of the label's line. */}
      {action && <div className="col-start-2 row-start-1">{action}</div>}
      {message && (
        <p
          id={messageId}
          className={cn(
            "col-span-2 text-sm",
            errors?.length ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/** A password field with a button to show what's been typed. */
export function PasswordField(props: Omit<FieldProps, "type" | "adornment">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      adornment={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          onClick={() => {
            setVisible((shown) => !shown);
          }}
        >
          <Icon />
          <span className="sr-only">{visible ? "Hide password" : "Show password"}</span>
        </Button>
      }
    />
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
