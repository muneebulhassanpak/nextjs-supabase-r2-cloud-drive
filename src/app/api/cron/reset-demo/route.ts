import { assertCron } from "@/server/cron";
import { withErrorHandling } from "@/server/errors";
import { noStore } from "@/server/http";
import { resetDemo } from "@/server/jobs/reset-demo";

/** Daily (see vercel.json): puts the demo accounts back as they were, creating them if needed. */
export const GET = withErrorHandling(async (request: Request) => {
  assertCron(request);
  return Response.json(await resetDemo(), { headers: noStore });
});
