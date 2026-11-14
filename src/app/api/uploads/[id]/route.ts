import { z } from "zod";

import { NotFoundError, withErrorHandling } from "@/server/errors";
import { cancelUpload } from "@/server/services/uploads";

/** Cancels an upload in progress: frees the space and deletes anything already sent. */
export const DELETE = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/uploads/[id]">) => {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new NotFoundError("Upload not found.");
    await cancelUpload(id);
    return new Response(null, { status: 204 });
  },
);
