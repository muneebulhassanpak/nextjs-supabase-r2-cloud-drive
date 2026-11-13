import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/env";
import type { Database } from "@/server/db/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers. It acts as the signed-in
 * user (their JWT from the session cookie), so every query goes through row-level security.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components can't set cookies. Refreshing the session in the proxy, so rotated
            // tokens are always written back, comes with sign-in (Phase 03).
          }
        },
      },
    },
  );
}
