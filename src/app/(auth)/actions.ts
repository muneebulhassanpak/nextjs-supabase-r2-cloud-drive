"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNextPath } from "@/lib/auth/next-path";
import { emailSchema, newPasswordSchema, signInSchema, signUpSchema } from "@/lib/auth/schemas";
import { authErrorMessage } from "@/server/auth/errors";
import { createClient } from "@/server/db/server";
import { formError, type ActionResult } from "@/server/errors";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";

export type AuthFormState = ActionResult<never> | undefined;

const text = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

const invalid = (error: z.ZodError, values?: Record<string, string>) =>
  formError(z.flattenError(error), values);

/**
 * Creates an account and sends the confirmation email. The answer is the same whether or not the
 * email is already registered, so the form can't be used to find out who has an account.
 */
export async function signUp(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { fullName: text(formData, "fullName"), email: text(formData, "email") };
  const parsed = signUpSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (error) {
    const requestId = await getRequestId();
    // A weak password says nothing about the account; anything else could, so it isn't shown.
    if (error.code === "weak_password") return formError(authErrorMessage(error), values);
    // So does a failure on Auth's side (e.g. email sending is down): no email will arrive.
    if (error.code === "over_request_rate_limit" || (error.status ?? 0) >= 500) {
      return formError(authErrorMessage(error, requestId), values);
    }
    logger.warn({ code: error.code, requestId }, "sign-up not completed");
  }
  redirect("/check-email");
}

export async function signIn(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = signInSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return formError(authErrorMessage(error, await getRequestId()), values);

  redirect(safeNextPath(formData.get("next")));
}

/** Sends a reset link. Same answer for any email, registered or not. */
export async function requestPasswordReset(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = emailSchema.safeParse(values);
  if (!parsed.success) return invalid(parsed.error, values);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);
  if (error) {
    const requestId = await getRequestId();
    // A failure on Auth's side is shown: it doesn't depend on the account. A per-email rate limit
    // would reveal that the account exists, so that (and anything else) isn't.
    if ((error.status ?? 0) >= 500) return formError(authErrorMessage(error, requestId), values);
    logger.warn({ code: error.code, requestId }, "reset email not sent");
  }
  redirect("/check-email?for=reset");
}

/** How long after opening a reset link the new password can be set. */
const RESET_WINDOW_SECONDS = 15 * 60;

/**
 * Whether this session came from an email link (reset links sign people in with a one-time code)
 * in the last few minutes. Without it, anyone holding a session (a stolen cookie, an unlocked
 * computer) could change the password without knowing the current one.
 */
function signedInByEmailLinkRecently(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  const now = Math.floor(Date.now() / 1000);
  return amr.some(
    (entry: { method?: unknown; timestamp?: unknown }) =>
      entry.method === "otp" &&
      typeof entry.timestamp === "number" &&
      now - entry.timestamp <= RESET_WINDOW_SECONDS,
  );
}

/** Sets a new password. The reset link signed the person in, so this acts on their session. */
export async function setNewPassword(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse({
    password: text(formData, "password"),
    confirmPassword: text(formData, "confirmPassword"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data || !signedInByEmailLinkRecently(data.claims.amr)) {
    return formError("Your reset link has expired. Ask for a new one.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return formError(authErrorMessage(error, await getRequestId()));

  redirect("/drive");
}
