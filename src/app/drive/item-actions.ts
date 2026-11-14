"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { itemNameSchema, TRASH_BATCH_SIZE } from "@/lib/drive/names";
import type { DriveView } from "@/lib/drive/types";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { formError, pgErrorCode, toErrorBody, type ActionResult } from "@/server/errors";
import { getRequestId } from "@/server/request-id";

// Called from the browser with optimistic updates, so each returns a result instead of throwing.
// The database enforces every rule; these only validate input and turn errors into messages.

const id = z.uuid();

async function failure(error: unknown, name?: string): Promise<ActionResult<never>> {
  // Names are unique per folder (ignoring case): say which name, not "that already exists".
  if (name && pgErrorCode(error) === "23505") {
    return formError(`There's already something called “${name}” here.`);
  }
  const { body } = toErrorBody(error, await getRequestId());
  return { ok: false, error: body };
}

export async function createFolder(
  parentId: string | null,
  rawName: string,
): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const name = itemNameSchema.safeParse(rawName);
  if (!name.success) return formError(name.error.issues[0]?.message ?? "That name won't work.");
  if (parentId !== null && !id.safeParse(parentId).success) {
    return formError("That folder doesn't exist.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({ kind: "folder", name: name.data, parent_id: parentId })
    .select("id")
    .single();
  if (error) return failure(error, name.data);
  refresh();
  return { ok: true, data };
}

export async function renameItem(
  itemId: string,
  rawName: string,
): Promise<ActionResult<{ name: string }>> {
  await requireUser();
  const name = itemNameSchema.safeParse(rawName);
  if (!name.success) return formError(name.error.issues[0]?.message ?? "That name won't work.");
  if (!id.safeParse(itemId).success) return formError("We couldn't find that.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ name: name.data })
    .eq("id", itemId)
    // Row-level security skips rows silently: no row back means nothing was renamed.
    .select("id")
    .single();
  if (error) {
    if (error.code === "PGRST116") return formError("You can't rename that.");
    return failure(error, name.data);
  }
  refresh();
  return { ok: true, data: { name: name.data } };
}

/** Moves items to the trash, one by one; reports how many went and the first problem, if any. */
export async function trashItems(itemIds: string[]): Promise<ActionResult<{ trashed: string[] }>> {
  await requireUser();
  const ids = z.array(id).min(1).max(TRASH_BATCH_SIZE).safeParse(itemIds);
  if (!ids.success) return formError(`Choose up to ${String(TRASH_BATCH_SIZE)} items.`);

  const supabase = await createClient();
  const trashed: string[] = [];
  let problem: unknown;
  // One at a time on purpose: a selection can hold a folder and something inside it, and the
  // database locks a whole subtree per call, so running them together would only contend.
  for (const itemId of ids.data) {
    const { error } = await supabase.rpc("trash_item", { p_item_id: itemId });
    if (error) problem ??= error;
    else trashed.push(itemId);
  }
  if (trashed.length > 0) refresh();
  if (problem) {
    const result = await failure(problem);
    if (!result.ok && trashed.length > 0) {
      result.error.message = `${trashed.length} moved to the trash. ${result.error.message}`;
      result.error.details = { trashed };
    }
    return result;
  }
  return { ok: true, data: { trashed } };
}

export async function setDriveView(view: DriveView): Promise<ActionResult<null>> {
  const user = await requireUser();
  // Arrives from the browser: the type says grid or list, the request may say anything.
  if (!z.enum(["grid", "list"]).safeParse(view).success) return formError("Choose grid or list.");
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ drive_view: view }).eq("id", user.id);
  if (error) return failure(error);
  // Pages the router already holds were drawn with the old view.
  refresh();
  return { ok: true, data: null };
}
