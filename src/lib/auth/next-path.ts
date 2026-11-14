/** Where people land after signing in when no other page was asked for. */
export const DEFAULT_SIGNED_IN_PATH = "/drive";

/**
 * The page to go to after signing in, from a `next` value the browser sent. Only paths on this
 * site are allowed, so a crafted link can't send someone to another site after they sign in.
 */
export function safeNextPath(value: unknown, fallback = DEFAULT_SIGNED_IN_PATH): string {
  if (typeof value !== "string" || !isLocalPath(value)) return fallback;
  // Control characters (tabs, newlines) are stripped by URL parsers and can hide the checks.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const base = "http://lockerly.invalid";
    const url = new URL(value, base);
    const path = url.pathname + url.search + url.hash;
    // Normalising can create a new "//": "/..//evil.com" becomes "//evil.com". Check the result too.
    return url.origin === base && isLocalPath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}

/** "//evil.com" and "/\\evil.com" are read by browsers as links to another host. */
const isLocalPath = (path: string) =>
  path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
