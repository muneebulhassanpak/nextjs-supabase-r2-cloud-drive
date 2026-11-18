"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { itemNameSchema, ITEMS_PER_REQUEST } from "@/lib/drive/names";
import type { DriveView, FolderChoices } from "@/lib/drive/types";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { actionError, formError, pgErrorCode, type ActionResult } from "@/server/errors";
import { getFolderChoices, searchFolders } from "@/server/services/drive";
import { deleteEntryForever, emptyTrash } from "@/server/services/trash";

// Called from the browser with optimistic updates, so each returns a result instead of throwing.
// The database enforces every rule; these only validate input and turn errors into messages.

const id = z.uuid();

async function failure(error: unknown, name?: string): Promise<ActionResult<never>> {
  // Names are unique per folder (ignoring case): say which name, not "that already exists".
  if (name && pgErrorCode(error) === "23505") {
    return formError(`There's already something called “${name}” here.`);
  }
  return actionError(error);
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

const itemIds = z.array(id).min(1).max(ITEMS_PER_REQUEST);
const tooMany = () => formError(`Choose up to ${String(ITEMS_PER_REQUEST)} items.`);

/**
 * Runs `step` for each item in turn and reports which succeeded, or the first problem (saying how
 * many went before it). One at a time on purpose: a selection can hold a folder and something
 * inside it, and the database locks a whole subtree per call, so running them together would
 * only contend.
 */
async function inTurn<T>(
  ids: string[],
  step: (itemId: string) => PromiseLike<{ data: T | null; error: unknown }>,
  { verb, name }: { verb: string; name?: (itemId: string) => string | undefined },
): Promise<ActionResult<{ done: { id: string; result: T }[] }>> {
  const done: { id: string; result: T }[] = [];
  let problem: { error: unknown; itemId: string } | undefined;
  for (const itemId of ids) {
    const { data, error } = await step(itemId);
    if (error) problem ??= { error, itemId };
    else done.push({ id: itemId, result: data as T });
  }
  if (done.length > 0) refresh();
  if (!problem) return { ok: true, data: { done } };
  const result = await failure(problem.error, name?.(problem.itemId));
  if (!result.ok && done.length > 0) {
    result.error.message = `${String(done.length)} ${verb}. ${result.error.message}`;
    result.error.details = { done: done.map((entry) => entry.id) };
  }
  return result;
}

/** Moves items to the trash; reports how many went and the first problem, if any. */
export async function trashItems(rawIds: string[]): Promise<ActionResult<{ trashed: string[] }>> {
  await requireUser();
  const ids = itemIds.safeParse(rawIds);
  if (!ids.success) return tooMany();
  const supabase = await createClient();
  const result = await inTurn(
    ids.data,
    (itemId) => supabase.rpc("trash_item", { p_item_id: itemId }),
    { verb: "moved to the trash" },
  );
  return result.ok ? { ok: true, data: { trashed: result.data.done.map((d) => d.id) } } : result;
}

/**
 * Moves items into a folder (null: the top of My Drive). `names` are only for messages: a name
 * clash says which name. The database checks rights on both ends and refuses cycles.
 */
export async function moveItems(
  rawIds: string[],
  targetId: string | null,
  names: Record<string, string> = {},
): Promise<ActionResult<{ moved: string[] }>> {
  await requireUser();
  const ids = itemIds.safeParse(rawIds);
  if (!ids.success) return tooMany();
  if (targetId !== null && !id.safeParse(targetId).success) {
    return formError("That folder doesn't exist.");
  }
  const supabase = await createClient();
  const result = await inTurn(
    ids.data,
    (itemId) =>
      supabase.rpc("move_item", {
        p_item_id: itemId,
        // NULL means the top of My Drive; generated types can't say a parameter may be NULL.
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        p_parent_id: targetId as string,
      }),
    { verb: "moved", name: (itemId) => names[itemId] },
  );
  return result.ok ? { ok: true, data: { moved: result.data.done.map((d) => d.id) } } : result;
}

/** Takes items out of the trash; says where each went and under what name. */
export async function restoreItems(
  rawIds: string[],
): Promise<ActionResult<{ restored: { id: string; name: string; parentId: string | null }[] }>> {
  await requireUser();
  const ids = itemIds.safeParse(rawIds);
  if (!ids.success) return tooMany();
  const supabase = await createClient();
  const result = await inTurn<{ name: string; parent_id: string }>(
    ids.data,
    (itemId) => supabase.rpc("restore_item", { p_item_id: itemId }).single(),
    { verb: "restored" },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      restored: result.data.done.map(({ id: itemId, result: row }) => ({
        id: itemId,
        name: row.name,
        // NULL (the top of the owner's drive) arrives as null; the generated type says string.
        parentId: (row.parent_id as string | null) ?? null,
      })),
    },
  };
}

/** Deletes trash entries for good (only the owner can). */
export async function deleteItemsForever(
  rawIds: string[],
): Promise<ActionResult<{ deleted: string[] }>> {
  await requireUser();
  const ids = itemIds.safeParse(rawIds);
  if (!ids.success) return tooMany();
  const result = await inTurn(ids.data, deleteEntryForever, { verb: "deleted" });
  return result.ok ? { ok: true, data: { deleted: result.data.done.map((d) => d.id) } } : result;
}

export async function emptyMyTrash(): Promise<ActionResult<{ deletedFiles: number }>> {
  // Outside the try: signing in again is a redirect, not an error to show.
  await requireUser();
  try {
    const data = await emptyTrash();
    refresh();
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}

/** Stars or unstars items. Anyone who can see an item can star it, for themselves. */
export async function setStarred(rawIds: string[], starred: boolean): Promise<ActionResult<null>> {
  await requireUser();
  const ids = itemIds.safeParse(rawIds);
  if (!ids.success) return tooMany();
  const supabase = await createClient();
  const { error } = starred
    ? await supabase.from("stars").upsert(
        ids.data.map((itemId) => ({ item_id: itemId })),
        { onConflict: "user_id,item_id", ignoreDuplicates: true },
      )
    : await supabase.from("stars").delete().in("item_id", ids.data);
  if (error) return failure(error);
  refresh();
  return { ok: true, data: null };
}

/** One step of the "Move to" picker (null: the top of My Drive). */
export async function getMoveChoices(
  folderId: string | null,
): Promise<ActionResult<FolderChoices>> {
  await requireUser();
  if (folderId !== null && !id.safeParse(folderId).success) {
    return formError("That folder doesn't exist.");
  }
  try {
    const choices = await getFolderChoices(folderId);
    return choices
      ? { ok: true, data: choices }
      : formError("We couldn't find that folder. It may have been moved or deleted.");
  } catch (error) {
    return failure(error);
  }
}

/** Folders matching a search, for the "Move to" picker. */
export async function findFolders(
  rawQuery: string,
): Promise<ActionResult<{ id: string; name: string }[]>> {
  await requireUser();
  const query = z.string().trim().min(1).max(200).safeParse(rawQuery);
  if (!query.success) return { ok: true, data: [] };
  try {
    return { ok: true, data: await searchFolders(query.data) };
  } catch (error) {
    return failure(error);
  }
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
