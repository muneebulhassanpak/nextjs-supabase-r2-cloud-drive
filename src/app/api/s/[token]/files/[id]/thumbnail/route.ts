import { withErrorHandling } from "@/server/errors";
import { getLinkThumbnailUrl } from "@/server/services/public-links";

/** An image's thumbnail on a public link page: a redirect to storage, like the signed-in one. */
export const GET = withErrorHandling(
  async (_request: Request, ctx: RouteContext<"/api/s/[token]/files/[id]/thumbnail">) => {
    const { token, id } = await ctx.params;
    const { url, maxAge } = await getLinkThumbnailUrl(token, id);
    return new Response(null, {
      status: 302,
      // Revoking the link must work at once, so the browser only keeps this briefly.
      headers: {
        location: url,
        "cache-control": `private, max-age=${String(Math.min(maxAge, 300))}`,
      },
    });
  },
);
