import { z } from "zod";

import { NotFoundError, withErrorHandling } from "@/server/errors";
import { noStore } from "@/server/http";
import { completeUpload } from "@/server/services/uploads";

/** Finishes an upload once the bytes are in storage; the file then shows up in its folder. */
export const POST = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) => {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new NotFoundError("Upload not found.");
    return Response.json(await completeUpload(id), { headers: noStore });
  },
);
