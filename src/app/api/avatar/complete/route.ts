import { z } from "zod";

import { withErrorHandling } from "@/server/errors";
import { noStore, readJson } from "@/server/http";
import { saveAvatar } from "@/server/services/avatars";

const body = z.object({ key: z.string().max(200) });

/** Uses an uploaded image as the profile picture. */
export const POST = withErrorHandling(async (request: Request) => {
  const { key } = await readJson(request, body);
  return Response.json(await saveAvatar(key), { headers: noStore });
});
