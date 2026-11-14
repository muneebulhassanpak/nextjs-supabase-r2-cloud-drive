import { z } from "zod";

import { itemNameSchema } from "@/lib/drive/names";
import { MAX_FILE_SIZE } from "@/lib/files/rules";
import { withErrorHandling } from "@/server/errors";
import { noStore, readJson } from "@/server/http";
import { startUpload } from "@/server/services/uploads";

const body = z.object({
  parentId: z.uuid().nullable(),
  name: itemNameSchema,
  size: z.number().int().min(0).max(MAX_FILE_SIZE, "Files can be at most 25 MB."),
  type: z.string().max(255),
});

/** Starts an upload: reserves the space and returns a link to send the bytes to storage. */
export const POST = withErrorHandling(async (request: Request) => {
  const upload = await startUpload(await readJson(request, body));
  return Response.json(upload, { status: 201, headers: noStore });
});
