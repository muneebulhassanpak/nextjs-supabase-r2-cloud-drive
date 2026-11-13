import { createBrowserClient } from "@supabase/ssr";

import { env } from "@/env";
import type { Database } from "@/server/db/database.types";

/** Supabase client for Client Components. Uses the publishable key and the user's session. */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
