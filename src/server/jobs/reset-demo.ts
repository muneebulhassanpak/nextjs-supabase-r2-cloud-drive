import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { env } from "@/env";
import { DEMO_EMAIL, DEMO_FRIEND_EMAIL } from "@/lib/demo";
import { createAdminClient } from "@/server/db/admin";
import { logger } from "@/server/logger";
import { deleteObjects, listObjectsBefore, putObject } from "@/server/storage/objects";

import {
  DEMO_EVENTS,
  DEMO_ITEMS,
  DEMO_LINKS,
  DEMO_SHARES,
  DEMO_STARS,
  type DemoPerson,
} from "./demo-content";

// A daily job, not a user request, so it uses the admin client (no row-level security). It only
// touches the two demo accounts, found by their fixed addresses.

const PEOPLE: Record<DemoPerson, { email: string; fullName: string }> = {
  alex: { email: DEMO_EMAIL, fullName: "Alex Morgan" },
  sam: { email: DEMO_FRIEND_EMAIL, fullName: "Sam Rivera" },
};

const HOUR = 60 * 60 * 1000;

export interface DemoReport {
  items: number;
  removedObjects: number;
  failedDeletes: number;
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The account with this address, made if there isn't one. One made by hand gets its password set
 * before it's locked; once locked, changing it (a new DEMO_PASSWORD) means unsetting is_demo first.
 */
async function account(admin: Admin, person: DemoPerson): Promise<string> {
  const { email, fullName } = PEOPLE[person];
  const found = await admin.from("profiles").select("id, is_demo").eq("email", email).maybeSingle();
  if (found.error) throw found.error;
  // Nobody signs in as the second person.
  const password = person === "alex" ? env.DEMO_PASSWORD : randomBytes(24).toString("base64url");
  if (found.data) {
    if (!found.data.is_demo) {
      const updated = await admin.auth.admin.updateUserById(found.data.id, { password });
      if (updated.error) throw updated.error;
    }
    return found.data.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  return data.user.id;
}

/** The same id every time for the same item of the same account. */
function stableId(ownerId: string, key: string): string {
  const hex = createHash("sha256").update(`lockerly.demo:${ownerId}:${key}`).digest("hex");
  // Shaped like a (version 8, custom) UUID.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function resetDemo(now = new Date()): Promise<DemoReport> {
  const admin = createAdminClient();
  const ids: Record<DemoPerson, string> = {
    alex: await account(admin, "alex"),
    sam: await account(admin, "sam"),
  };
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR).toISOString();
  const idOf = new Map(DEMO_ITEMS.map((item) => [item.key, stableId(ids[item.owner], item.key)]));
  const id = (key: string) => {
    const found = idOf.get(key);
    if (!found) throw new Error(`The demo has no item "${key}".`);
    return found;
  };

  // 1. The bytes, always under the same keys, so a file's row never points at nothing. Stored
  //    again after the rows are in, in case a visitor deleted one of them meanwhile.
  const uploads: (() => Promise<void>)[] = [];
  const items = await Promise.all(
    DEMO_ITEMS.map(async (item) => {
      const ownerId = ids[item.owner];
      const objectKey = item.file ? `u/${ownerId}/${id(item.key)}` : null;
      let size: number | null = null;
      if (item.file && item.type && objectKey) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- names from demo-content.ts
        const bytes = await readFile(join(process.cwd(), "fixtures", item.file));
        const type = item.type;
        const store = () => putObject(objectKey, bytes, type);
        uploads.push(store);
        await store();
        size = bytes.byteLength;
      }
      return {
        id: id(item.key),
        owner_id: ownerId,
        parent_id: item.in ? id(item.in) : null,
        kind: item.file ? "file" : "folder",
        name: item.name,
        size,
        mime_type: item.file ? (item.type ?? null) : null,
        object_key: objectKey,
        created_at: ago(item.hoursAgo),
        trashed_at: item.trashedHoursAgo === undefined ? null : ago(item.trashedHoursAgo),
      };
    }),
  );

  // 2. The rows, all at once.
  const replacedAt = new Date();
  const { error } = await admin.rpc("reset_demo", {
    p_people: (["alex", "sam"] as const).map((person) => ({
      id: ids[person],
      full_name: PEOPLE[person].fullName,
    })),
    p_items: items,
    p_shares: DEMO_SHARES.map((share) => ({
      item_id: id(share.item),
      user_id: ids[share.with],
      role: share.role,
      created_at: ago(share.hoursAgo),
    })),
    p_links: DEMO_LINKS.map((item) => ({
      item_id: id(item),
      // Nobody has the link itself: people see it's on, and can replace it.
      token_hash: randomBytes(32).toString("hex"),
    })),
    p_stars: DEMO_STARS.map((star) => ({
      user_id: ids[star.by],
      item_id: id(star.item),
      created_at: ago(star.hoursAgo),
    })),
    p_activity: [
      ...DEMO_ITEMS.map((item) => ({
        item_id: id(item.key),
        actor_id: ids[item.owner],
        action: item.file ? "uploaded" : "created",
        details: { name: item.name },
        created_at: ago(item.hoursAgo),
      })),
      ...DEMO_EVENTS.map((event) => ({
        item_id: id(event.item),
        actor_id: ids[event.by],
        action: event.action,
        details: {
          ...event.details,
          ...(event.person && { user_id: ids[event.person] }),
          ...(event.from !== undefined && { from: event.from && id(event.from) }),
          ...(event.to !== undefined && { to: event.to && id(event.to) }),
        },
        created_at: ago(event.hoursAgo),
      })),
    ],
  });
  if (error) throw error;
  await Promise.all(uploads.map((store) => store()));

  // 3. What visitors uploaded before that (later uploads have rows), and any second factor someone
  //    added.
  const keep = new Set(items.map((item) => item.object_key));
  const report: DemoReport = { items: items.length, removedObjects: 0, failedDeletes: 0 };
  for (const ownerId of Object.values(ids)) {
    for (const prefix of [`u/${ownerId}/`, `a/${ownerId}/`]) {
      for await (const keys of listObjectsBefore(replacedAt, prefix)) {
        const extra = keys.filter((key) => !keep.has(key));
        report.removedObjects += extra.length;
        report.failedDeletes += (await deleteObjects(extra)).length;
      }
    }
    const factors = await admin.auth.admin.mfa.listFactors({ userId: ownerId });
    if (factors.error) throw factors.error;
    for (const factor of factors.data.factors) {
      const removed = await admin.auth.admin.mfa.deleteFactor({ userId: ownerId, id: factor.id });
      if (removed.error) throw removed.error;
    }
  }

  logger.info({ report }, "demo reset finished");
  return report;
}
