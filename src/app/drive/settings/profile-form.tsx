"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form";

import { updateProfile } from "../actions";

export function ProfileForm({ fullName, email }: { fullName: string | null; email: string }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const failed = state && !state.ok ? state : undefined;
  return (
    <form action={action} className="grid max-w-md gap-4" noValidate>
      <FormError message={failed?.error.fieldErrors ? undefined : failed?.error.message} />
      <Field
        label="Name"
        name="fullName"
        autoComplete="name"
        required
        maxLength={100}
        defaultValue={
          failed?.values?.fullName ?? (state?.ok ? state.data.fullName : (fullName ?? ""))
        }
        errors={failed?.error.fieldErrors?.fullName}
      />
      <Field label="Email" value={email} readOnly disabled />
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} className="justify-self-start">
          Save
        </SubmitButton>
        {state?.ok && !pending && (
          <p role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
            <Check className="size-4" aria-hidden />
            Saved
          </p>
        )}
      </div>
    </form>
  );
}
