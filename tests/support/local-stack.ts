import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/server/db/database.types";

// Helpers for tests that run against the local stack (`pnpm db:start`). They refuse anything else,
// so a mistyped URL can never point them at staging or production.

export const LOCAL_API_URL = "http://127.0.0.1:55321";
export const MAILPIT_URL = "http://127.0.0.1:55324";

export type Client = SupabaseClient<Database>;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function localStatus(): Record<string, string> {
  const output = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line);
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

let status: Record<string, string> | undefined;
function local(key: "PUBLISHABLE_KEY" | "SECRET_KEY"): string {
  status ??= localStatus();
  if (status.API_URL !== LOCAL_API_URL) {
    throw new Error(`Expected the local stack at ${LOCAL_API_URL}, got ${status.API_URL}`);
  }
  const value = status[key];
  if (!value) throw new Error(`supabase status has no ${key}. Is the local stack running?`);
  return value;
}

/** The local publishable key: public, the one the browser uses. */
export const localPublishableKey = () => local("PUBLISHABLE_KEY");

/** A client with only the publishable key, as any visitor would have. */
export function anonClient(): Client {
  return createClient<Database>(LOCAL_API_URL, localPublishableKey(), noSession);
}

/** The local admin API (bypasses row-level security): only for setting up test users. */
export function adminClient(): Client {
  return createClient<Database>(LOCAL_API_URL, local("SECRET_KEY"), noSession);
}

export const testEmail = (prefix: string) => `${prefix}-${randomUUID()}@test.dev`;
export const testPassword = () => `pw-${randomUUID()}`;

/** Creates a confirmed user and returns a client signed in as them. */
export async function newUser(
  prefix = "user",
): Promise<{ client: Client; id: string; email: string; password: string }> {
  const email = testEmail(prefix);
  const password = testPassword();
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { client, id: data.user.id, email, password };
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/** The newest email Mailpit received for this address, waiting up to `timeoutMs` for it. */
export async function latestEmail(
  to: string,
  timeoutMs = 10_000,
): Promise<{ subject: string; html: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = new URLSearchParams({ query: `to:"${to}"`, limit: "1" });
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?${query.toString()}`);
    const { messages } = (await search.json()) as { messages: MailpitMessage[] };
    const [message] = messages;
    if (message) {
      const full = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
      const { HTML } = (await full.json()) as { HTML: string };
      return { subject: message.Subject, html: HTML };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email for ${to} within ${timeoutMs} ms`);
}

/** The /auth/confirm link in an email, as a URL. */
export function confirmLink(html: string): URL {
  const match = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(html);
  if (!match?.[1]) throw new Error("The email has no /auth/confirm link");
  return new URL(match[1].replaceAll("&amp;", "&"));
}
