import type { ShareInfo } from "./types";

/**
 * Who can open an item, in words. Only owners are told about the public link, so for everyone
 * else this never claims that nobody else can open it.
 */
export function accessLabel(
  info: Pick<ShareInfo, "people" | "link" | "canManage">,
  currentUserId: string,
  now: Date,
): { title: string; detail: string; isPublic: boolean } {
  const { link } = info;
  const isPublic = link !== null && (link.expiresAt === null || new Date(link.expiresAt) > now);
  const others = info.people
    .filter((entry) => entry.person.id !== currentUserId)
    .map((entry) => entry.person.name ?? entry.person.email ?? "Someone");
  const [first, second] = others;
  const who =
    first === undefined
      ? null
      : others.length === 1
        ? first
        : others.length === 2
          ? `${first} and ${String(second)}`
          : `${first} and ${String(others.length - 1)} others`;

  if (isPublic) {
    return {
      title: "Anyone with the link",
      detail: who ? `Also shared with ${who}` : "Can view and download",
      isPublic,
    };
  }
  if (who) {
    return {
      title: `${String(info.people.length)} people have access`,
      detail: `You, ${who}`,
      isPublic,
    };
  }
  return { title: "Private", detail: "Only you can open this", isPublic };
}
