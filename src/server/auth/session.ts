import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/server/db/server";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * The signed-in user, or null. The session cookie is only trusted after `getClaims()` has checked
 * its signature, so a forged cookie never counts. Read once per request (React `cache`).
 *
 * Reads cookies, so with Cache Components it must run behind a <Suspense> boundary.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const { sub, email } = data.claims;
  if (!sub || typeof email !== "string") return null;
  return { id: sub, email };
});

/** The signed-in user. Sends anyone else to the sign-in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
