"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/schemas";

import { setNewPassword } from "../actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(setNewPassword, undefined);
  const failed = state && !state.ok ? state : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError message={failed?.error.fieldErrors ? undefined : failed?.error.message} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers.`}
        errors={failed?.error.fieldErrors?.password}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={failed?.error.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending}>Save password</SubmitButton>
    </form>
  );
}
