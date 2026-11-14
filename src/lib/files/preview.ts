import { canShowInline } from "./rules";

// How a file is previewed, decided from its type alone, so the browser and the tests agree. The
// bytes still come from storage with headers the server picks (see `responseHeaders`): a preview
// never makes storage render something it wouldn't send inline.

export type PreviewKind = "image" | "pdf" | "video" | "audio" | "text" | "none";

/** How much of a text file a preview reads: the first 1 MB. */
export const TEXT_PREVIEW_BYTES = 1024 * 1024;
/**
 * Text up to this size is highlighted; longer text is shown plain. Highlighting runs on the main
 * thread, so this keeps it to a blink.
 */
export const HIGHLIGHT_MAX_BYTES = 100 * 1024;
/** Images up to this size get a thumbnail in grid view; bigger ones would be slow to load. */
export const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

// Types that are text, though not `text/*`. HTML, SVG and XML are here too: their source is shown
// as escaped text, never rendered, so their scripts can't run.
const TEXT_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/yaml",
  "application/toml",
  "application/sql",
  "application/x-sh",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/xhtml+xml",
  "image/svg+xml",
]);

export function previewKind(mimeType: string | null): PreviewKind {
  if (!mimeType) return "none";
  if (mimeType.startsWith("text/") || TEXT_TYPES.has(mimeType)) return "text";
  if (!canShowInline(mimeType)) return "none";
  if (mimeType === "application/pdf") return "pdf";
  const group = mimeType.slice(0, mimeType.indexOf("/"));
  return group === "image" || group === "video" || group === "audio" ? group : "none";
}

/** Whether a grid tile can show the picture itself instead of an icon. */
export function hasThumbnail(file: { mimeType: string | null; size: number | null }): boolean {
  return (
    previewKind(file.mimeType) === "image" && file.size !== null && file.size <= THUMBNAIL_MAX_BYTES
  );
}

// Languages the code view knows, by file extension. Anything else is shown as plain text.
const LANGUAGES: Record<string, string> = {
  bash: "bash",
  c: "c",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  go: "go",
  h: "c",
  htm: "html",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  md: "markdown",
  markdown: "markdown",
  mjs: "javascript",
  cjs: "javascript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

/** The highlighting language for a file name ("app.ts" → "typescript"), or "text". */
export function codeLanguage(name: string): string {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return LANGUAGES[extension] ?? "text";
}
