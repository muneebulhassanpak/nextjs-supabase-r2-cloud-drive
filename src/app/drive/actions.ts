"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { profileSchema } from "@/lib/auth/schemas";
import { authErrorMessage } from "@/server/auth/errors";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { formError, toErrorBody, type ActionResult } from "@/server/errors";
import { getRequestId } from "@/server/request-id";

export type ProfileFormState = ActionResult<{ fullName: string }> | undefined;

export async function updateProfile(
  _state: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await requireUser();
  const name = formData.get("fullName");
  const values = { fullName: typeof name === "string" ? name : "" };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return formError(z.flattenError(parsed.error), values);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id)
    // Row-level security skips rows silently: no row back means nothing was saved.
    .select("id")
    .single();
  if (error) {
    const { body } = toErrorBody(error, await getRequestId());
    return { ok: false, error: body, values };
  }

  refresh();
  return { ok: true, data: parsed.data };
}

/** Signs out this browser only. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

/** Signs out every device: all sessions of this account end, including this one. */
export async function signOutEverywhere(): Promise<ActionResult<never>> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return formError(authErrorMessage(error, await getRequestId()));
  redirect("/sign-in");
}
