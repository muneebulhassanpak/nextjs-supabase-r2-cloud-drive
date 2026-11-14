const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

const round = (value: number, exponent: number) =>
  value >= 10 || exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;

/** "1.5 MB": bytes in the units people expect (1 KB = 1024 bytes, like most file managers). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  let rounded = round(bytes / 1024 ** exponent, exponent);
  // 1023.97 KB rounds to 1024 KB: show it as 1 MB instead.
  if (rounded >= 1024 && exponent < UNITS.length - 1) {
    exponent += 1;
    rounded = round(bytes / 1024 ** exponent, exponent);
  }
  return `${rounded} ${UNITS[exponent]}`;
}

/** Up to two letters for an avatar: "Ada Lovelace" → "AL", "ada@x.dev" → "A". */
export function initials(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? [words[0], words.at(-1)] : words.length === 1 ? [words[0]] : [email];
  return letters
    .map((word) => Array.from(word ?? "")[0] ?? "")
    .join("")
    .toUpperCase();
}
