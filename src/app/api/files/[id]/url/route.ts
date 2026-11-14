import { z } from "zod";

import { NotFoundError, withErrorHandling } from "@/server/errors";
import { noStore } from "@/server/http";
import { getFileUrl } from "@/server/services/files";

/** A link to a file's bytes for 60 seconds: `?disposition=inline` to view, else a download. */
export const GET = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/files/[id]/url">) => {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new NotFoundError("File not found.");
    const wanted = new URL(request.url).searchParams.get("disposition");
    const link = await getFileUrl(id, wanted === "inline" ? "inline" : "attachment");
    return Response.json(link, { headers: noStore });
  },
);
