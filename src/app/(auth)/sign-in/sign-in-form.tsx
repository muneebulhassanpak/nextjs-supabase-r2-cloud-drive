"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";

import { Field, FormError, PasswordField, SubmitButton } from "@/components/form";
import { TextLink } from "@/components/text-link";

import { signIn } from "../actions";

/** Carries `?next=` through the form, so people land where they were going. */
function NextInput() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  const failed = state && !state.ok ? state : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <Suspense>
        <NextInput />
      </Suspense>
      <FormError message={failed?.error.fieldErrors ? undefined : failed?.error.message} />
      <Field
        inputSize="lg"
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={failed?.values?.email}
        errors={failed?.error.fieldErrors?.email}
      />
      <PasswordField
        inputSize="lg"
        label="Password"
        name="password"
        autoComplete="current-password"
        required
        errors={failed?.error.fieldErrors?.password}
        action={
          <TextLink href="/forgot-password" tone="muted" className="text-sm">
            Forgot your password?
          </TextLink>
        }
      />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
