"use server";

import { z } from "zod";

import type { ActivityCursor, ActivityEntry } from "@/lib/drive/activity";
import { MAX_QUERY_LENGTH } from "@/lib/drive/search";
import type { DriveItem } from "@/lib/drive/types";
import { requireUser } from "@/server/auth/session";
import { actionError, formError, type ActionResult } from "@/server/errors";
import { getActivity } from "@/server/services/activity";
import { searchDrive } from "@/server/services/drive";

// Search suggestions and the Activity tab, called from the browser as people type and scroll.

/** Suggestions shown under the search box while typing. */
const SUGGESTIONS = 8;

export async function suggestItems(rawQuery: string): Promise<ActionResult<DriveItem[]>> {
  await requireUser();
  const query = rawQuery.trim();
  if (query === "") return { ok: true, data: [] };
  if (query.length > MAX_QUERY_LENGTH) return formError("That search is too long.");
  try {
    const items = await searchDrive(
      { query, type: null, owner: "any", modifiedFrom: null, modifiedTo: null },
      SUGGESTIONS,
    );
    return { ok: true, data: items };
  } catch (error) {
    return await actionError(error);
  }
}

const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.number().int() });

export async function loadActivity(
  itemId: string,
  rawCursor: ActivityCursor | null,
): Promise<ActionResult<{ entries: ActivityEntry[]; next: ActivityCursor | null }>> {
  await requireUser();
  const cursor = rawCursor === null ? null : cursorSchema.safeParse(rawCursor);
  if (!z.uuid().safeParse(itemId).success || (cursor && !cursor.success)) {
    return formError("We couldn't find that.");
  }
  try {
    return { ok: true, data: await getActivity(itemId, cursor?.data ?? null) };
  } catch (error) {
    return await actionError(error);
  }
}
