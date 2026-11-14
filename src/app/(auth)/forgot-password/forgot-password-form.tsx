"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form";

import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  const failed = state && !state.ok ? state : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
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
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
    </form>
  );
}
