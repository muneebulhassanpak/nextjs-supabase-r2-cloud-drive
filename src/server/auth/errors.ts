import "server-only";

import { logger } from "@/server/logger";

import type { AuthError } from "@supabase/supabase-js";

/**
 * A message for people from a Supabase Auth error. Supabase's own wording is written for
 * developers, so it is never shown; unknown errors are logged and get a general message.
 */
export function authErrorMessage(error: AuthError, requestId?: string): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Wrong email or password.";
    case "email_not_confirmed":
      return "Confirm your email address first. Open the link we sent you, or sign up again to get a new one.";
    case "weak_password":
      return "Choose a stronger password: at least 8 characters, with letters and numbers.";
    case "same_password":
      return "Choose a password that's different from your current one.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return "Your session has expired. Sign in again.";
    case "user_banned":
      return "This account is suspended.";
    default:
      logger.error({ err: error, code: error.code, requestId }, "unexpected auth error");
      return "Something went wrong. Try again in a moment.";
  }
}
