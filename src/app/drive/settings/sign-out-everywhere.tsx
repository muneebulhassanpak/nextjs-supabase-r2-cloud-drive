"use client";

import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/form";

import { signOutEverywhere } from "../actions";

export function SignOutEverywhere() {
  const [state, action, pending] = useActionState(signOutEverywhere, undefined);
  return (
    <form action={action} className="grid max-w-md gap-4">
      <FormError message={state && !state.ok ? state.error.message : undefined} />
      <SubmitButton pending={pending} variant="outline" className="justify-self-start">
        Sign out everywhere
      </SubmitButton>
    </form>
  );
}
