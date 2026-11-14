"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/schemas";

import { signUp } from "../actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  const failed = state && !state.ok ? state : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError message={failed?.error.fieldErrors ? undefined : failed?.error.message} />
      <Field
        label="Name"
        name="fullName"
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={failed?.values?.fullName}
        errors={failed?.error.fieldErrors?.fullName}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={failed?.values?.email}
        errors={failed?.error.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers.`}
        errors={failed?.error.fieldErrors?.password}
      />
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
