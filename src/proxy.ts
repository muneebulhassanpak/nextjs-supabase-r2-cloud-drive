import { type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/next-path";
import { REQUEST_ID_HEADER, VALID_REQUEST_ID } from "@/lib/request-id";
import { redirectKeepingSession, updateSession } from "@/server/db/proxy";

/** Pages only for signed-in people. Each page checks again on the server; this is the fast path. */
const isAppPage = (path: string) => path === "/drive" || path.startsWith("/drive/");

/** Pages that make no sense once signed in. */
const SIGNED_OUT_PAGES = new Set(["/sign-in", "/sign-up", "/forgot-password"]);

/**
 * Runs before every request:
 * 1. Gives it an ID, passed to the app and returned to the caller, so a user's error message can be
 *    matched to the server's log line.
 * 2. Refreshes the Supabase session, so Server Components always see a valid one.
 * 3. Sends signed-out people to sign in, and signed-in people past the sign-in pages.
 */
export async function proxy(request: NextRequest) {
  const incoming = request.headers.get(REQUEST_ID_HEADER) ?? "";
  const requestId = VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set(REQUEST_ID_HEADER, requestId);

  const { response, userId } = await updateSession(request, forwardHeaders);

  const { pathname, search, searchParams } = request.nextUrl;
  // Server Actions check the session themselves (requireUser) and redirect properly; a proxy
  // redirect would re-send their POST to a page that doesn't know the action.
  const isServerAction = request.method === "POST" && request.headers.has("next-action");
  let redirectTo: URL | undefined;
  if (isServerAction) {
    redirectTo = undefined;
  } else if (!userId && isAppPage(pathname)) {
    redirectTo = new URL("/sign-in", request.url);
    redirectTo.searchParams.set("next", pathname + search);
  } else if (!userId && pathname === "/reset-password") {
    // Only reachable from a reset link, which signs the person in first.
    redirectTo = new URL("/forgot-password", request.url);
  } else if (userId && SIGNED_OUT_PAGES.has(pathname)) {
    redirectTo = new URL(safeNextPath(searchParams.get("next")), request.url);
  }

  const result = redirectTo ? redirectKeepingSession(redirectTo, response) : response;
  result.headers.set(REQUEST_ID_HEADER, requestId);
  return result;
}

export const config = {
  // Skip static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
