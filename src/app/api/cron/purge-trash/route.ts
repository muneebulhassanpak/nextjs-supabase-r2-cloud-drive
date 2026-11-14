import { assertCron } from "@/server/cron";
import { withErrorHandling } from "@/server/errors";
import { noStore } from "@/server/http";
import { purgeTrash } from "@/server/jobs/purge-trash";

/** Daily (see vercel.json): deletes what has been in the trash for more than 30 days. */
export const GET = withErrorHandling(async (request: Request) => {
  assertCron(request);
  return Response.json(await purgeTrash(), { headers: noStore });
});
