import { withErrorHandling } from "@/server/errors";
import { noStore } from "@/server/http";
import { getLinkFileUrl } from "@/server/services/public-links";

/** A file reached through a public link, for 60 seconds: `?disposition=inline` to view. */
export const GET = withErrorHandling(
  async (request: Request, ctx: RouteContext<"/api/s/[token]/files/[id]/url">) => {
    const { token, id } = await ctx.params;
    const wanted = new URL(request.url).searchParams.get("disposition");
    const link = await getLinkFileUrl(token, id, wanted === "inline" ? "inline" : "attachment");
    return Response.json(link, { headers: noStore });
  },
);
