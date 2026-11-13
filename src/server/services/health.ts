import "server-only";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";
import type { Database } from "@/server/db/database.types";
import { logger } from "@/server/logger";
import { pingStorage } from "@/server/storage/client";

export type CheckStatus = "ok" | "error";

export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  checks: { database: CheckStatus; storage: CheckStatus };
}

/** A check that hasn't answered by then counts as failed, so the endpoint always answers. */
export const CHECK_TIMEOUT_MS = 5_000;

// An anonymous client, as any visitor would use: no session, created once.
const anonymous = createClient<Database>(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Reaches Postgres through the public API. */
async function pingDatabase(): Promise<void> {
  const { error } = await anonymous.rpc("ping");
  if (error) throw error;
}

function withTimeout(check: () => Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${String(ms)}ms`));
    }, ms);
  });
  return Promise.race([check(), timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function run(name: string, check: () => Promise<void>, ms: number): Promise<CheckStatus> {
  try {
    await withTimeout(check, ms);
    return "ok";
  } catch (error) {
    logger.error({ err: error, check: name }, "health check failed");
    return "error";
  }
}

/** Checks every dependency in parallel. One failure marks the app degraded, not down. */
export async function checkHealth(
  checks = { database: pingDatabase, storage: pingStorage },
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<HealthReport> {
  const [database, storage] = await Promise.all([
    run("database", checks.database, timeoutMs),
    run("storage", checks.storage, timeoutMs),
  ]);
  return {
    status: database === "ok" && storage === "ok" ? "ok" : "degraded",
    version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    checks: { database, storage },
  };
}
