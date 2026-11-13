import "server-only";
import { createClient } from "@supabase/supabase-js";

import { env } from "@/env";
import type { Database } from "@/server/db/database.types";

/**
 * Supabase client with the secret key: it BYPASSES row-level security.
 *
 * Only for work that isn't done on behalf of a user: scheduled jobs (trash purge, upload cleanup)
 * and the demo reset. Never use it to serve a user's request. This is the only file allowed to
 * read SUPABASE_SECRET_KEY (checked in CI).
 */
export function createAdminClient() {
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set. Locally, copy it from `supabase status`.");
  }
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
