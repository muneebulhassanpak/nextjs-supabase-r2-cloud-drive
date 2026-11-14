// Rules for file bytes, shared by the browser (to fail early) and the server (to decide). The
// database enforces the size limit and quota again, so these are never the only check.

/** The largest file anyone can upload: 25 MB, the same as the database's `items_size_limit`. */
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Profile pictures: small, and only types every browser shows without running anything. */
export const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type AvatarType = (typeof AVATAR_TYPES)[number];

export const isAvatarType = (type: string): type is AvatarType =>
  (AVATAR_TYPES as readonly string[]).includes(type);

const FALLBACK_TYPE = "application/octet-stream";

// The same shape the database accepts (`items_mime_type_valid`).
const MIME_TYPE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

// Browsers leave `File.type` empty for many files (Markdown, code, some archives). The extension
// then decides, so the file gets the right icon and preview later.
const BY_EXTENSION: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  sql: "application/sql",
  sh: "application/x-sh",
  ts: "text/plain",
  tsx: "text/plain",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  heic: "image/heic",
};

/** A clean MIME type for an upload: lowercase, no parameters, guessed from the name if missing. */
export function normaliseContentType(type: string, name: string): string {
  const clean = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (MIME_TYPE.test(clean) && clean.length <= 255) return clean;
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined;
  return (extension && BY_EXTENSION[extension]) ?? FALLBACK_TYPE;
}

// Shown in the browser when asked: types that can't run script on the page that shows them.
// Everything else (HTML, SVG, XML, anything unknown) is always downloaded, never displayed.
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/flac",
]);

/** Whether storage may send this type to be shown in the browser rather than downloaded. */
export const canShowInline = (mimeType: string): boolean => INLINE_TYPES.has(mimeType);

export type Disposition = "inline" | "attachment";

/**
 * How storage should send a file back. Script-capable types are always downloaded as
 * `application/octet-stream`, so even opening the link directly can't render them. Plain text is
 * shown as `text/plain`, whatever text type it was uploaded as.
 */
export function responseHeaders(
  mimeType: string,
  name: string,
  wanted: Disposition,
): { contentType: string; contentDisposition: string } {
  const isText = mimeType.startsWith("text/") && mimeType !== "text/html";
  const canShow = canShowInline(mimeType) || isText;
  const disposition: Disposition = wanted === "inline" && canShow ? "inline" : "attachment";
  const contentType = canShow ? (isText ? "text/plain; charset=utf-8" : mimeType) : FALLBACK_TYPE;
  return { contentType, contentDisposition: contentDisposition(disposition, name) };
}

/**
 * A Content-Disposition header (RFC 6266) that keeps any file name: an ASCII fallback for old
 * clients, and the exact name UTF-8 encoded for everyone else.
 */
export function contentDisposition(disposition: Disposition, name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/["\\]/g, "")
    .trim();
  const fallback = ascii.length > 0 ? ascii : "download";
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Longest name the database takes, in characters (code points, as Postgres counts them). */
export const MAX_NAME_LENGTH = 255;
// Postgres counts a name's length in code points, so these do too (not UTF-16 units).
const codePoints = (text: string) => Array.from(text);
// Room kept for " (n)" when a long name is shortened to fit one: up to " (99999999)".
const COPY_SUFFIX_ROOM = 11;

/** Splits "report.pdf" into "report" and ".pdf". A leading dot (".env") is part of the name. */
function splitName(name: string): [base: string, extension: string] {
  const dot = name.lastIndexOf(".");
  const [base, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  // An "extension" too long to keep a base beside it is just part of the name.
  return codePoints(extension).length > MAX_NAME_LENGTH - COPY_SUFFIX_ROOM - 1
    ? [name, ""]
    : [base, extension];
}

/**
 * The first free name for an upload: "report.pdf", then "report (1).pdf", "report (2).pdf"…
 * `taken` holds the folder's names lowercased (names are unique per folder, ignoring case). Long
 * names lose the end of their base so the copy still fits: "very long… (1).pdf".
 */
export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const [base, extension] = splitName(name);
  const chars = codePoints(base);
  for (let n = 1; ; n++) {
    const suffix = ` (${String(n)})`;
    const room = MAX_NAME_LENGTH - suffix.length - codePoints(extension).length;
    const candidate = `${chars.slice(0, room).join("")}${suffix}${extension}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * An `ilike` pattern matching the copies `uniqueName` makes of `name` ("report (1).pdf"), even
 * shortened ones, and not unrelated names that merely start the same ("report-final.pdf").
 */
export function copyNamesPattern(name: string): string {
  const [base, extension] = splitName(name);
  const escape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);
  const stem = codePoints(base).slice(
    0,
    MAX_NAME_LENGTH - COPY_SUFFIX_ROOM - codePoints(extension).length,
  );
  return `${escape(stem.join(""))}% (%)${escape(extension)}`;
}

/**
 * Where the browser loads someone's profile picture. The key's last part changes with every new
 * picture, so a new one never shows an old cached image.
 */
export function avatarSrc(userId: string, avatarKey: string | null): string | undefined {
  return avatarKey ? `/api/avatars/${userId}?v=${avatarKey.split("/").pop() ?? ""}` : undefined;
}
