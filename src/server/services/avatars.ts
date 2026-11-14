import "server-only";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { isAvatarType, MAX_AVATAR_SIZE } from "@/lib/files/rules";
import { requireApiUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { NotFoundError, ValidationError } from "@/server/errors";
import { headObject, removeQuietly, signAvatar, signUpload } from "@/server/storage/objects";

// Profile pictures use the same signed uploads as files, under `a/<user id>/<random id>`. They
// don't count against the storage quota. The database only accepts keys in the person's own
// folder, so a profile can never point at someone's files.

/** `a/<user id>/<uuid>`, the only shape the database accepts too. */
const isOwnAvatarKey = (userId: string, key: string) => {
  const prefix = `a/${userId}/`;
  return key.startsWith(prefix) && z.uuid().safeParse(key.slice(prefix.length)).success;
};

export async function startAvatarUpload(size: number, type: string) {
  const user = await requireApiUser();
  if (!isAvatarType(type)) throw new ValidationError("Choose a PNG, JPEG, WebP or GIF image.");
  if (size <= 0 || size > MAX_AVATAR_SIZE)
    throw new ValidationError("Pictures can be at most 2 MB.");
  const key = `a/${user.id}/${randomUUID()}`;
  return { key, upload: await signUpload(key, size, type) };
}

/** Uses an uploaded picture, after checking it is one, and deletes the previous picture. */
export async function saveAvatar(key: string): Promise<{ avatarKey: string }> {
  const user = await requireApiUser();
  if (!isOwnAvatarKey(user.id, key)) throw new ValidationError("That isn't one of your pictures.");
  const stored = await headObject(key);
  if (!stored) throw new NotFoundError("The picture didn't reach storage. Try again.");
  if (stored.size > MAX_AVATAR_SIZE || !isAvatarType(stored.contentType ?? "")) {
    await removeQuietly([key]);
    throw new ValidationError("Pictures must be PNG, JPEG, WebP or GIF, up to 2 MB.");
  }
  const previous = await replaceAvatarKey(user.id, key);
  if (previous) await removeQuietly([previous]);
  return { avatarKey: key };
}

export async function removeAvatar(): Promise<void> {
  const user = await requireApiUser();
  const previous = await replaceAvatarKey(user.id, null);
  if (previous) await removeQuietly([previous]);
}

/** Sets the person's picture key and returns the one it replaced. */
async function replaceAvatarKey(userId: string, key: string | null): Promise<string | null> {
  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("profiles")
    .select("avatar_key")
    .eq("id", userId)
    .single();
  if (readError) throw readError;
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_key: key })
    .eq("id", userId)
    .select("id")
    .single();
  if (error) throw error;
  return before.avatar_key === key ? null : before.avatar_key;
}

/** A link to someone's picture, if the signed-in person may see their profile. */
export async function getAvatarUrl(userId: string): Promise<string> {
  await requireApiUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar_key")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.avatar_key) throw new NotFoundError("No picture.");
  return signAvatar(data.avatar_key);
}
