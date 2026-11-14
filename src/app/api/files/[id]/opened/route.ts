import { z } from "zod";

import { NotFoundError, withErrorHandling } from "@/server/errors";
import { recordRecent } from "@/server/services/files";

/** Records that the signed-in person opened a file, for Recents. */
export const POST = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/files/[id]/opened">) => {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new NotFoundError("File not found.");
    await recordRecent(id);
    return new Response(null, { status: 204 });
  },
);
