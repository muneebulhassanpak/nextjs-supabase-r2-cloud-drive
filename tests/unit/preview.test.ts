import { describe, expect, it } from "vitest";

import { codeLanguage, hasThumbnail, previewKind, THUMBNAIL_MAX_BYTES } from "@/lib/files/preview";

describe("previewKind", () => {
  it.each([
    ["image/png", "image"],
    ["image/webp", "image"],
    ["application/pdf", "pdf"],
    ["video/webm", "video"],
    ["audio/wav", "audio"],
    ["text/plain", "text"],
    ["text/markdown", "text"],
    ["application/json", "text"],
    // Script-capable types: their source as text, never rendered.
    ["text/html", "text"],
    ["image/svg+xml", "text"],
    ["application/xml", "text"],
    // Types browsers can't show (or we won't): a card with a download button.
    ["image/heic", "none"],
    ["video/x-matroska", "none"],
    ["application/zip", "none"],
    ["application/octet-stream", "none"],
    [null, "none"],
  ])("%s → %s", (mimeType, kind) => {
    expect(previewKind(mimeType)).toBe(kind);
  });
});

describe("hasThumbnail", () => {
  it("is for images small enough to load in a grid", () => {
    expect(hasThumbnail({ mimeType: "image/jpeg", size: 1000 })).toBe(true);
    expect(hasThumbnail({ mimeType: "image/jpeg", size: THUMBNAIL_MAX_BYTES + 1 })).toBe(false);
    expect(hasThumbnail({ mimeType: "image/svg+xml", size: 100 })).toBe(false);
    expect(hasThumbnail({ mimeType: "application/pdf", size: 100 })).toBe(false);
  });
});

describe("codeLanguage", () => {
  it.each([
    ["app.ts", "typescript"],
    ["README.MD", "markdown"],
    ["logo.svg", "xml"],
    ["notes.txt", "text"],
    [".env", "text"],
    ["Makefile", "text"],
  ])("%s → %s", (name, language) => {
    expect(codeLanguage(name)).toBe(language);
  });
});
