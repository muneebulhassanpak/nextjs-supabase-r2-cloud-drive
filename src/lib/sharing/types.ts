// What the share dialog shows. Safe for the browser: no tokens, no storage keys.

export type ShareRole = "viewer" | "editor";

export interface Person {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

/** Someone with access: the owner, a person with an account, or an email invited to sign up. */
export interface AccessEntry {
  kind: "owner" | "person" | "invite";
  /** The person's id, or the invited email. */
  key: string;
  person: Person;
  role: "owner" | ShareRole;
  /** The folder above that gives this role, or null when it's given on the item itself. */
  from: { id: string; name: string } | null;
  /** Shared on this item itself, so it can be changed or removed here. */
  direct: boolean;
}

export interface ShareLinkInfo {
  createdAt: string;
  expiresAt: string | null;
}

export interface ShareInfo {
  item: { id: string; name: string; kind: "folder" | "file" };
  /** Only the owner adds people, changes roles and makes links. */
  canManage: boolean;
  people: AccessEntry[];
  /** The live public link, for the owner (it may have expired). */
  link: ShareLinkInfo | null;
}

/** How long a new public link lasts, in days; null for no expiry. */
export const LINK_EXPIRY_CHOICES = [null, 1, 7, 30] as const;
export type LinkExpiry = (typeof LINK_EXPIRY_CHOICES)[number];
