"use server";

import { redirect } from "next/navigation";

import { env } from "@/env";
import { DEMO_EMAIL } from "@/lib/demo";
import { createClient } from "@/server/db/server";
import { formError } from "@/server/errors";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";

import type { AuthFormState } from "./actions";

/** "Try the demo": signs in to the shared demo account, unless the person is signed in already. */
export async function startDemo(): Promise<AuthFormState> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) {
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: env.DEMO_PASSWORD,
    });
    if (error) {
      logger.error({ err: error, requestId: await getRequestId() }, "demo sign-in failed");
      return formError("The demo isn't available right now. Try again in a few minutes.");
    }
  }
  redirect("/drive");
}

/** From the demo to making an account: signs out of the demo in this browser first. */
export async function leaveDemo(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-up");
}
