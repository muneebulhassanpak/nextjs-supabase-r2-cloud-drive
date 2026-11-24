import "server-only";
import { createHash, randomBytes } from "node:crypto";

import { avatarSrc } from "@/lib/files/rules";
import type { AccessEntry, Person, ShareInfo, ShareRole } from "@/lib/sharing/types";
import { requireUser } from "@/server/auth/session";
import { createClient } from "@/server/db/server";
import { escapeHtml, sendEmail } from "@/server/email";
import { NotFoundError } from "@/server/errors";
import { logger } from "@/server/logger";

// Sharing, as the signed-in person: row-level security decides what they see, and the database
// functions decide what they may change (only owners share, make links or change roles).

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } as const;

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  avatar_key: string | null;
}

const PROFILE = "id, full_name, email, avatar_key";

function toPerson(id: string, row: ProfileRow | null): Person {
  // Someone whose profile they can't see (no shared folder in common) stays anonymous.
  return {
    id,
    name: row?.full_name ?? null,
    email: row?.email ?? null,
    avatarUrl: (row && avatarSrc(row.id, row.avatar_key)) ?? null,
  };
}

/** Who has access to an item and how, or null if the person can't see it. */
export async function getShareInfo(itemId: string): Promise<ShareInfo | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("items")
    .select(
      `id, name, kind, owner_id, ancestors, trashed_at, owner:profiles!items_owner_id_fkey(${PROFILE})`,
    )
    .eq("id", itemId)
    .eq("status", "ready")
    .maybeSingle<{
      id: string;
      name: string;
      kind: "folder" | "file";
      owner_id: string;
      ancestors: string[];
      trashed_at: string | null;
      owner: ProfileRow | null;
    }>();
  if (error) throw error;
  if (!item || item.trashed_at) return null;

  const canManage = item.owner_id === user.id;
  // Shares on the item and on every folder above it count (the strongest wins).
  const scope = [...item.ancestors, item.id];
  const [shares, invites, folders, links] = await Promise.all([
    supabase
      .from("item_shares")
      .select(`item_id, user_id, role, user:profiles!item_shares_user_id_fkey(${PROFILE})`)
      .in("item_id", scope)
      .overrideTypes<
        { item_id: string; user_id: string; role: ShareRole; user: ProfileRow | null }[],
        { merge: false }
      >(),
    supabase.from("share_invites").select("item_id, email, role").in("item_id", scope),
    // An empty list matches nothing, so the top-level case needs no special path.
    supabase
      .from("items")
      .select(`id, name, owner_id, owner:profiles!items_owner_id_fkey(${PROFILE})`)
      .in("id", item.ancestors)
      .overrideTypes<
        { id: string; name: string; owner_id: string; owner: ProfileRow | null }[],
        { merge: false }
      >(),
    canManage
      ? supabase
          .from("share_links")
          .select("item_id, created_at, expires_at")
          .in("item_id", scope)
          .is("revoked_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [shares, invites, folders, links]) if (result.error) throw result.error;

  const folderById = new Map((folders.data ?? []).map((row) => [row.id, row]));
  const folderRef = (id: string) => ({ id, name: folderById.get(id)?.name ?? "a folder" });

  // Per person: their share on the item itself, and the strongest one from a folder above.
  interface Access {
    entry: Omit<AccessEntry, "role" | "from" | "direct">;
    own?: ShareRole;
    inherited?: { role: ShareRole; from: { id: string; name: string } };
  }
  const access = new Map<string, Access>();
  const grant = (entry: Access["entry"], role: ShareRole, sharedOn: string) => {
    // The owner already has everything; a share they were given in someone's folder adds nothing.
    if (entry.key === item.owner_id) return;
    const current = access.get(entry.key) ?? { entry };
    if (sharedOn === item.id) current.own = role;
    else if (!current.inherited || ROLE_RANK[role] > ROLE_RANK[current.inherited.role]) {
      current.inherited = { role, from: folderRef(sharedOn) };
    }
    access.set(entry.key, current);
  };
  // Whoever owns the top folder can edit everything inside it, whoever uploaded it.
  const topId = item.ancestors[0];
  const top = topId ? folderById.get(topId) : undefined;
  if (top && top.owner_id !== item.owner_id) {
    access.set(top.owner_id, {
      entry: { kind: "person", key: top.owner_id, person: toPerson(top.owner_id, top.owner) },
      inherited: { role: "editor", from: folderRef(top.id) },
    });
  }
  for (const share of shares.data ?? []) {
    grant(
      { kind: "person", key: share.user_id, person: toPerson(share.user_id, share.user) },
      share.role,
      share.item_id,
    );
  }
  for (const invite of invites.data ?? []) {
    grant(
      {
        kind: "invite",
        key: invite.email,
        person: { id: "", name: null, email: invite.email, avatarUrl: null },
      },
      invite.role,
      invite.item_id,
    );
  }

  // The share here counts (and can change here) unless a folder above gives more.
  const people: AccessEntry[] = [...access.values()].map(({ entry, own, inherited }) =>
    inherited && (own === undefined || ROLE_RANK[inherited.role] > ROLE_RANK[own])
      ? { ...entry, role: inherited.role, from: inherited.from, direct: false }
      : { ...entry, role: own ?? "viewer", from: null, direct: true },
  );

  const label = (entry: AccessEntry) =>
    (entry.person.name ?? entry.person.email ?? "").toLowerCase();
  const others = people.sort(
    (a, b) =>
      Number(a.kind === "invite") - Number(b.kind === "invite") || label(a).localeCompare(label(b)),
  );
  const owner: AccessEntry = {
    kind: "owner",
    key: item.owner_id,
    person: toPerson(item.owner_id, item.owner),
    role: "owner",
    from: null,
    direct: true,
  };

  const link = links.data?.find((row) => row.item_id === item.id);
  return {
    item: { id: item.id, name: item.name, kind: item.kind },
    canManage,
    people: [owner, ...others],
    link: link ? { createdAt: link.created_at, expiresAt: link.expires_at } : null,
    folderLinks: (links.data ?? [])
      .filter((row) => row.item_id !== item.id)
      .map((row) => ({ from: folderRef(row.item_id), expiresAt: row.expires_at })),
  };
}

/**
 * Shares an item with each email, then emails the addresses that are new to it (role changes
 * don't send anything). Sharing stops at the first refusal; emails that fail are only logged,
 * since the share itself worked.
 */
export async function shareWithPeople(
  itemId: string,
  emails: readonly string[],
  role: ShareRole,
  origin: string,
): Promise<{ shared: string[]; problem?: unknown }> {
  const user = await requireUser();
  const supabase = await createClient();
  const shared: string[] = [];
  const added: string[] = [];
  let problem: unknown;
  for (const email of emails) {
    const { data, error } = await supabase.rpc("share_item", {
      p_item_id: itemId,
      p_email: email,
      p_role: role,
    });
    if (error) {
      problem = error;
      break;
    }
    shared.push(email);
    if (data) added.push(email);
  }

  if (added.length > 0) {
    const [item, me] = await Promise.all([
      supabase.from("items").select("name, kind").eq("id", itemId).single(),
      supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
    ]);
    if (item.error || me.error) {
      logger.warn({ err: item.error ?? me.error, itemId }, "share emails not sent");
    } else {
      const sharer = me.data.full_name ?? me.data.email;
      const results = await Promise.allSettled(
        added.map((to) => sendEmail(shareEmail({ to, sharer, item: item.data, role, origin }))),
      );
      for (const result of results) {
        if (result.status === "rejected") {
          logger.warn({ err: result.reason, itemId }, "share email not sent");
        }
      }
    }
  }
  return problem === undefined ? { shared } : { shared, problem };
}

/** The email someone gets when an item is shared with them. */
export function shareEmail({
  to,
  sharer,
  item,
  role,
  origin,
}: {
  to: string;
  sharer: string;
  item: { name: string; kind: "folder" | "file" };
  role: ShareRole;
  origin: string;
}) {
  const what = item.kind === "folder" ? "folder" : "file";
  const can = role === "editor" ? "view and edit" : "view";
  // Both people with an account and people without one get the same email: it mustn't tell the
  // sender's side who has an account. Signing in (or up with this address) shows the item.
  const url = `${origin}/drive/shared`;
  const subject = `${sharer} shared “${item.name}” with you`;
  const text = [
    `${sharer} shared the ${what} “${item.name}” with you on Lockerly. You can ${can} it.`,
    "",
    `Open it: ${url}`,
    "",
    `New to Lockerly? Create an account with this email address (${to}) to see it.`,
  ].join("\n");
  const html = `<p>${escapeHtml(sharer)} shared the ${what} <strong>${escapeHtml(item.name)}</strong> with you on Lockerly. You can ${can} it.</p>
<p><a href="${escapeHtml(url)}">Open it in Lockerly</a></p>
<p style="color:#666">New to Lockerly? Create an account with this email address (${escapeHtml(to)}) to see it.</p>`;
  return { to, subject, text, html };
}

/** Who a role change or removal is about: a person with an account, or an invited email. */
export type ShareTarget = { userId: string } | { email: string };

/** Changes someone's role on the item itself (owner only; row-level security checks). */
export async function setShareRole(itemId: string, target: ShareTarget, role: ShareRole) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } =
    "userId" in target
      ? await supabase
          .from("item_shares")
          .update({ role })
          .eq("item_id", itemId)
          .eq("user_id", target.userId)
          .select("item_id")
      : await supabase
          .from("share_invites")
          .update({ role })
          .eq("item_id", itemId)
          .eq("email", target.email)
          .select("item_id");
  if (error) throw error;
  // Row-level security skips rows silently: nothing back means it wasn't theirs to change.
  if (data.length === 0) throw new NotFoundError("That person doesn't have access here.");
}

/** Takes away a share or an invite on the item itself (owner only). */
export async function removeShare(itemId: string, target: ShareTarget) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } =
    "userId" in target
      ? await supabase
          .from("item_shares")
          .delete()
          .eq("item_id", itemId)
          .eq("user_id", target.userId)
          .select("item_id")
      : await supabase
          .from("share_invites")
          .delete()
          .eq("item_id", itemId)
          .eq("email", target.email)
          .select("item_id");
  if (error) throw error;
  if (data.length === 0) throw new NotFoundError("That person doesn't have access here.");
}

/**
 * Removes the signed-in person's own shares on items ("Remove from Shared with me"), all in one
 * go. Returns the items left; items that weren't shared with them directly are skipped.
 */
export async function leaveShares(itemIds: readonly string[]): Promise<string[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_shares")
    .delete()
    .eq("user_id", user.id)
    .in("item_id", itemIds)
    .select("item_id");
  if (error) throw error;
  if (data.length === 0) throw new NotFoundError("That isn't shared with you directly.");
  return data.map((row) => row.item_id);
}

/** A new public link token: 32 random bytes, so it can't be guessed. */
export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  // Postgres reads bytea from text in hex form.
  const hash = `\\x${createHash("sha256").update(token).digest("hex")}`;
  return { token, hash };
}

/**
 * Makes the item's public link, replacing any it had (owner only). The token is returned once and
 * never stored: the database keeps only its hash.
 */
export async function createLink(
  itemId: string,
  expiresInDays: number | null,
): Promise<{ token: string; expiresAt: string | null }> {
  await requireUser();
  const supabase = await createClient();
  const { token, hash } = newLinkToken();
  const expiresAt =
    expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 86_400_000).toISOString();
  const { error } = await supabase.rpc("create_share_link", {
    p_item_id: itemId,
    p_token_hash: hash,
    ...(expiresAt && { p_expires_at: expiresAt }),
  });
  if (error) throw error;
  return { token, expiresAt };
}

/** Turns off the item's public link (owner only). */
export async function revokeLink(itemId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("item_id", itemId)
    .is("revoked_at", null)
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new NotFoundError("There's no link to turn off.");
}
