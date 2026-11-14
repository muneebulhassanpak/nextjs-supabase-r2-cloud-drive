import { z } from "zod";

import { NotFoundError, withErrorHandling } from "@/server/errors";
import { getAvatarUrl } from "@/server/services/avatars";

/**
 * Someone's profile picture, for people allowed to see their profile: a redirect to a short-lived
 * storage link. Cached briefly by the browser only, and for less time than the link lasts.
 */
export const GET = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/avatars/[userId]">) => {
    const { userId } = await ctx.params;
    if (!z.uuid().safeParse(userId).success) throw new NotFoundError("No picture.");
    const url = await getAvatarUrl(userId);
    return new Response(null, {
      status: 302,
      headers: { location: url, "cache-control": "private, max-age=45" },
    });
  },
);
