import { z } from "zod";

import { withErrorHandling } from "@/server/errors";
import { noStore, readJson } from "@/server/http";
import { removeAvatar, startAvatarUpload } from "@/server/services/avatars";

const body = z.object({ size: z.number().int().min(1), type: z.string().max(255) });

/** Starts a profile picture upload: returns a link to send the image to storage. */
export const POST = withErrorHandling(async (request: Request) => {
  const { size, type } = await readJson(request, body);
  return Response.json(await startAvatarUpload(size, type), { status: 201, headers: noStore });
});

/** Removes the profile picture. */
export const DELETE = withErrorHandling(async () => {
  await removeAvatar();
  return new Response(null, { status: 204 });
});
