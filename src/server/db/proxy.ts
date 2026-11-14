import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import type { Database } from "@/server/db/database.types";

/** Headers that stop CDNs from caching a response that sets someone's session cookies. */
const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

/**
 * Refreshes the Supabase session for this request (the proxy is the only place that can always
 * write cookies), and returns the response to continue with plus the verified user id.
 *
 * Rotated tokens are written both to the request, so Server Components see them and don't
 * refresh again (a refresh token can only be used once), and to the response, for the browser.
 */
export async function updateSession(
  request: NextRequest,
  forwardHeaders: Headers,
): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request: { headers: forwardHeaders } });

  // No session cookie, nothing to check or refresh: skip the work on public pages.
  const hasSession = request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token/.test(name));
  if (!hasSession) return { response, userId: null };

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          forwardHeaders.set("cookie", request.headers.get("cookie") ?? "");
          response = NextResponse.next({ request: { headers: forwardHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        },
      },
    },
  );

  // Verifies the token's signature (and refreshes it if expired). Never trust the cookie alone.
  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims.sub ?? null };
}

/** A redirect that keeps any session cookies and cache headers the refresh just set. */
export function redirectKeepingSession(to: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(to);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const name of CACHE_HEADERS) {
    const value = from.headers.get(name);
    if (value) redirect.headers.set(name, value);
  }
  return redirect;
}
