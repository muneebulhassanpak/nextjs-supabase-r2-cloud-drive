import "server-only";

import { env } from "@/env";
import { logger } from "@/server/logger";

// Transactional email from the app itself (auth emails are sent by Supabase). Resend on staging
// and production; with no API key (locally) the email is written to the log instead.

const FROM = "Lockerly <noreply@heymuneeb.dev>";
const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends an email. Throws if the provider refuses it, so callers decide whether that matters. */
export async function sendEmail(email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    logger.info({ to: email.to, subject: email.subject, text: email.text }, "email (not sent)");
    return;
  }
  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: FROM, ...email }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Resend refused the email (${String(response.status)}).`);
  }
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text that came from a person (names), made safe to put in an email's HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}
