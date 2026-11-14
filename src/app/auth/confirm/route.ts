import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/server/db/server";
import { logger } from "@/server/logger";

import type { EmailOtpType } from "@supabase/supabase-js";

/** Link types our email templates send (supabase/templates). */
const LINK_TYPES = new Set<EmailOtpType>(["email", "signup", "recovery", "email_change"]);

/**
 * Every link in our emails lands here: confirm an account, reset a password, confirm a new email.
 * The token hash is checked with Supabase, which signs the person in, then they go on to `next`.
 * Works on any device, unlike PKCE links, which only work in the browser that asked for them.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));

  let destination = "/auth/error";
  if (tokenHash && type && LINK_TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) destination = next;
    else logger.info({ code: error.code, type }, "email link rejected");
  }

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  // The response sets session cookies: never let a CDN cache it.
  response.headers.set("cache-control", "private, no-store");
  return response;
}
