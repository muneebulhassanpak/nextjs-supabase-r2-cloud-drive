import "server-only";
import { z } from "zod";

import { ValidationError } from "@/server/errors";

/**
 * The JSON body of a request, checked against a schema. Only `application/json` is accepted: a
 * page on another site can't send that without a CORS preflight, which it won't get past.
 */
export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new ValidationError("Send the request as application/json.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("The request body isn't valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError("Check the request.", z.flattenError(parsed.error).fieldErrors);
  }
  return parsed.data;
}

/** API answers are per person and per moment: never cached. */
export const noStore = { "cache-control": "no-store" } as const;
