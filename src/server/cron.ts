import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import { UnauthorizedError } from "@/server/errors";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; anything else is refused, as is every
 * call when no secret is set. Compared in constant time (hashes, so lengths don't leak either).
 */
export function assertCron(request: Request): void {
  const secret = env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) {
    throw new UnauthorizedError("Not allowed.");
  }
}
