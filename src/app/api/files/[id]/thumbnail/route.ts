import { z } from "zod";

import { NotFoundError, withErrorHandling } from "@/server/errors";
import { getThumbnailUrl } from "@/server/services/files";

/**
 * An image for grid view: a redirect to a storage link that stays the same for a while, so the
 * browser can reuse the image. Cached by the browser only, and only while that link is current.
 */
export const GET = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/files/[id]/thumbnail">) => {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new NotFoundError("No thumbnail.");
    const { url, maxAge } = await getThumbnailUrl(id);
    return new Response(null, {
      status: 302,
      headers: { location: url, "cache-control": `private, max-age=${String(maxAge)}` },
    });
  },
);
