import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it.each([
    ["/drive", "/drive"],
    ["/drive/settings?tab=profile#name", "/drive/settings?tab=profile#name"],
    ["/drive/../drive/trash", "/drive/trash"],
  ])("keeps a path on this site: %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "drive",
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "/..//evil.example",
    "/.//evil.example",
    "/%2e%2e//evil.example",
    "/drive/../..//evil.example",
  ])("refuses anything that could leave the site: %j", (input) => {
    expect(safeNextPath(input)).toBe("/drive");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//x", "/")).toBe("/");
  });
});
