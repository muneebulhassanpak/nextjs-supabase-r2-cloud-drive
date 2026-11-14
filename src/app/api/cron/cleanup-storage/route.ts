import { assertCron } from "@/server/cron";
import { withErrorHandling } from "@/server/errors";
import { noStore } from "@/server/http";
import { cleanupStorage } from "@/server/jobs/cleanup-storage";

/** Daily (see vercel.json): removes abandoned uploads and objects no row points at. */
export const GET = withErrorHandling(async (request: Request) => {
  assertCron(request);
  return Response.json(await cleanupStorage(), { headers: noStore });
});
