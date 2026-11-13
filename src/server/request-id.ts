import "server-only";
import { headers } from "next/headers";

import { REQUEST_ID_HEADER } from "@/lib/request-id";

/** The ID set by `src/proxy.ts` for the current request, used in logs and error responses. */
export async function getRequestId(): Promise<string | undefined> {
  return (await headers()).get(REQUEST_ID_HEADER) ?? undefined;
}
