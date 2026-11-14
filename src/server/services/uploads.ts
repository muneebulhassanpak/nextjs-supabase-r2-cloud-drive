import "server-only";

import { copyNamesPattern, normaliseContentType, uniqueName } from "@/lib/files/rules";
import { requireApiUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { ConflictError, NotFoundError, pgErrorCode, ValidationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { headObject, removeQuietly, signUpload } from "@/server/storage/objects";

// Uploads in three steps, each as the signed-in person so Postgres checks every one:
//   1. start: `start_upload` checks the folder, size and quota, reserves the space and returns a
//      random storage key; we sign an upload link for exactly that key, size and type.
//   2. the browser sends the bytes straight to storage.
//   3. complete: we check storage really holds that many bytes, then `complete_upload`.

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Tries this many names ("a (1).txt", "a (2).txt"…) before giving up on a busy folder. */
const NAME_ATTEMPTS = 5;

export interface StartUploadInput {
  parentId: string | null;
  name: string;
  size: number;
  type: string;
}

export interface StartedUpload {
  id: string;
  /** The name the file gets, which differs from the one asked for if that was taken. */
  name: string;
  upload: Awaited<ReturnType<typeof signUpload>>;
}

/**
 * The names `uniqueName` must avoid: `name` itself (just found taken) and the copies already made
 * of it ("a (1).txt"), uploads in progress included. Unrelated names that start the same
 * ("a-final.txt") aren't fetched, so even a big folder stays well under the row limit.
 */
async function takenNames(
  supabase: Supabase,
  ownerId: string,
  parentId: string | null,
  name: string,
): Promise<Set<string>> {
  let query = supabase
    .from("items")
    .select("name")
    .is("trashed_at", null)
    .ilike("name", copyNamesPattern(name));
  query = parentId
    ? query.eq("parent_id", parentId)
    : query.is("parent_id", null).eq("owner_id", ownerId);
  const { data, error } = await query.limit(1000);
  if (error) throw error;
  return new Set([name.toLowerCase(), ...data.map((row) => row.name.toLowerCase())]);
}

export async function startUpload(input: StartUploadInput): Promise<StartedUpload> {
  const user = await requireApiUser();
  const supabase = await createClient();
  const type = normaliseContentType(input.type, input.name);

  let name = input.name;
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase
      .rpc("start_upload", {
        // NULL means the top of My Drive; generated types can't say a parameter may be NULL.
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        p_parent_id: input.parentId as string,
        p_name: name,
        p_size: input.size,
        p_mime_type: type,
      })
      .single();
    if (!error) {
      return { id: data.id, name, upload: await signUpload(data.object_key, input.size, type) };
    }
    // The name is taken: pick the next free one, as Drive does, instead of failing.
    if (pgErrorCode(error) !== "23505" || attempt === NAME_ATTEMPTS) throw error;
    name = uniqueName(input.name, await takenNames(supabase, user.id, input.parentId, input.name));
  }
}

/** Gives up on an upload: frees the reserved space and deletes anything already sent. */
export async function cancelUpload(id: string): Promise<void> {
  await requireApiUser();
  const supabase = await createClient();
  const { data: key, error } = await supabase.rpc("cancel_upload", { p_item_id: id });
  if (error) throw error;
  await removeQuietly([key]);
}

export interface CompletedUpload {
  id: string;
  name: string;
}

/**
 * Checks the bytes arrived, then makes the file visible. If another upload took the name in the
 * meantime, this one is renamed ("a (1).txt") rather than lost.
 */
export async function completeUpload(id: string): Promise<CompletedUpload> {
  const user = await requireApiUser();
  const supabase = await createClient();

  const { data: item, error } = await supabase
    .from("items")
    .select("id, name, size, object_key, parent_id, status")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw error;
  // Finished already: the browser asks again when it never got the first answer.
  if (item?.status === "ready") return { id, name: item.name };
  if (!item?.object_key || item.size === null) throw new NotFoundError("Upload not found.");

  const stored = await headObject(item.object_key);
  if (stored?.size !== item.size) {
    // Nothing arrived, or not what was reserved (the signed link makes this unlikely): undo it all.
    // If cancelling fails too, the daily cleanup removes the row (and frees its space) tomorrow.
    const { error: cancelError } = await supabase.rpc("cancel_upload", { p_item_id: id });
    if (cancelError) logger.warn({ err: cancelError, id }, "couldn't cancel a broken upload");
    await removeQuietly([item.object_key]);
    if (!stored) throw new ConflictError("The file didn't reach storage. Try again.");
    throw new ValidationError("The file changed while uploading. Try again.");
  }

  // Another upload may have taken the name since this one started: finish under the next free one.
  let rename: string | undefined;
  for (let attempt = 1; ; attempt++) {
    const { data: name, error: completeError } = await supabase.rpc("complete_upload", {
      p_item_id: id,
      ...(rename && { p_name: rename }),
    });
    if (!completeError) return { id, name };
    if (pgErrorCode(completeError) !== "23505" || attempt === NAME_ATTEMPTS) throw completeError;
    rename = uniqueName(item.name, await takenNames(supabase, user.id, item.parent_id, item.name));
  }
}
