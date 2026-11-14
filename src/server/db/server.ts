import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { env } from "@/env";
import type { Database } from "@/server/db/database.types";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers. It acts as the signed-in
 * user (their JWT from the session cookie), so every query goes through row-level security.
 */
export async function createClient() {
  // Supabase Auth reads the clock (token expiry) as soon as the client exists. Wait for the real
  // request, so Next.js never runs that during a prerender (including runtime prefetches).
  await connection();
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
            // Server Components can't set cookies. That's fine: src/proxy.ts refreshes the session
            // before every request, so there is nothing new to write here.
          }
        },
      },
    },
  );
}
