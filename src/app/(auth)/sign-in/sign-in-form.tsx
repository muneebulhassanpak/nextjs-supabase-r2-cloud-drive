"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form";

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
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={failed?.values?.email}
        errors={failed?.error.fieldErrors?.email}
      />
      <div className="grid gap-2">
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          errors={failed?.error.fieldErrors?.password}
        />
        <Link
          href="/forgot-password"
          className="justify-self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Forgot your password?
        </Link>
      </div>
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
