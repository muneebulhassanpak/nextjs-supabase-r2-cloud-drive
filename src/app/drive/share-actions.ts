"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { LINK_EXPIRY_CHOICES, type ShareInfo } from "@/lib/sharing/types";
import { requireUser } from "@/server/auth/session";
import { actionError, formError, type ActionResult } from "@/server/errors";
import { requestOrigin } from "@/server/http";
import {
  createLink,
  getShareInfo,
  leaveShare,
  removeShare,
  revokeLink,
  setShareRole,
  shareWithPeople,
} from "@/server/services/sharing";

// The share dialog's calls. Each checks the signed-in user first (outside any try, so an expired
// session redirects to sign-in), validates what the browser sent, and lets the database decide.

const id = z.uuid();
const role = z.enum(["viewer", "editor"]);
/** People added in one go; the database also limits shares per hour. */
const MAX_EMAILS = 20;
const emails = z
  .array(z.email({ error: (issue) => `“${String(issue.input)}” isn't an email address.` }).max(320))
  .min(1, "Add at least one email address.")
  .max(MAX_EMAILS, `Add up to ${String(MAX_EMAILS)} people at a time.`);
const target = z.union([z.object({ userId: z.uuid() }), z.object({ email: z.email() })]);

const notFound = () => formError("We couldn't find that. It may have been moved or deleted.");

export async function loadShareInfo(itemId: string): Promise<ActionResult<ShareInfo>> {
  await requireUser();
  if (!id.safeParse(itemId).success) return notFound();
  try {
    const info = await getShareInfo(itemId);
    return info ? { ok: true, data: info } : notFound();
  } catch (error) {
    return actionError(error);
  }
}

/** Shares with each address; says how many went if one was refused. */
export async function shareItem(
  itemId: string,
  rawEmails: string[],
  rawRole: string,
): Promise<ActionResult<{ shared: number }>> {
  await requireUser();
  if (!id.safeParse(itemId).success) return notFound();
  const list = emails.safeParse([...new Set(rawEmails.map((email) => email.trim().toLowerCase()))]);
  if (!list.success)
    return formError(list.error.issues[0]?.message ?? "Check the email addresses.");
  const parsedRole = role.safeParse(rawRole);
  if (!parsedRole.success) return formError("Choose Viewer or Editor.");

  const { shared, problem } = await shareWithPeople(
    itemId,
    list.data,
    parsedRole.data,
    await requestOrigin(),
  );
  if (shared.length > 0) refresh();
  if (problem === undefined) return { ok: true, data: { shared: shared.length } };
  const result = await actionError(problem);
  if (shared.length > 0) {
    result.error.message = `Shared with ${String(shared.length)}. ${result.error.message}`;
  }
  return result;
}

export async function changeShareRole(
  itemId: string,
  rawTarget: unknown,
  rawRole: string,
): Promise<ActionResult<null>> {
  await requireUser();
  const who = target.safeParse(rawTarget);
  const parsedRole = role.safeParse(rawRole);
  if (!id.safeParse(itemId).success || !who.success) return notFound();
  if (!parsedRole.success) return formError("Choose Viewer or Editor.");
  try {
    await setShareRole(itemId, who.data, parsedRole.data);
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return actionError(error);
  }
}

export async function removeAccess(
  itemId: string,
  rawTarget: unknown,
): Promise<ActionResult<null>> {
  await requireUser();
  const who = target.safeParse(rawTarget);
  if (!id.safeParse(itemId).success || !who.success) return notFound();
  try {
    await removeShare(itemId, who.data);
    refresh();
    return { ok: true, data: null };
  } catch (error) {
    return actionError(error);
  }
}

/** "Remove from Shared with me": gives up one's own access to an item shared with them. */
export async function leaveItems(itemIds: string[]): Promise<ActionResult<{ left: string[] }>> {
  await requireUser();
  const ids = z.array(id).min(1).max(100).safeParse(itemIds);
  if (!ids.success) return notFound();
  const left: string[] = [];
  try {
    for (const itemId of ids.data) {
      await leaveShare(itemId);
      left.push(itemId);
    }
    return { ok: true, data: { left } };
  } catch (error) {
    return await actionError(error);
  } finally {
    if (left.length > 0) refresh();
  }
}

/** Makes a public link; the token comes back once, to show and copy. */
export async function createShareLink(
  itemId: string,
  expiresInDays: number | null,
): Promise<ActionResult<{ token: string; expiresAt: string | null }>> {
  await requireUser();
  if (!id.safeParse(itemId).success) return notFound();
  if (!(LINK_EXPIRY_CHOICES as readonly (number | null)[]).includes(expiresInDays)) {
    return formError("Choose when the link stops working.");
  }
  try {
    const link = await createLink(itemId, expiresInDays);
    return { ok: true, data: link };
  } catch (error) {
    return actionError(error);
  }
}

export async function revokeShareLink(itemId: string): Promise<ActionResult<null>> {
  await requireUser();
  if (!id.safeParse(itemId).success) return notFound();
  try {
    await revokeLink(itemId);
    return { ok: true, data: null };
  } catch (error) {
    return actionError(error);
  }
}
