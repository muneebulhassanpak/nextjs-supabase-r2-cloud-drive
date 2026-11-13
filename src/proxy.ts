import { NextResponse, type NextRequest } from "next/server";

import { REQUEST_ID_HEADER, VALID_REQUEST_ID } from "@/lib/request-id";

/**
 * Runs before every request and gives it an ID, passed to the app and returned to the caller,
 * so a user's error message can be matched to the server's log line.
 */
export function proxy(request: NextRequest) {
  const incoming = request.headers.get(REQUEST_ID_HEADER) ?? "";
  const requestId = VALID_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  // Skip static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
