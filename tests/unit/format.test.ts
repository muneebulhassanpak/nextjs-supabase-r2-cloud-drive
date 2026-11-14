import { describe, expect, it } from "vitest";

import { formatBytes, initials } from "@/lib/format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [-5, "0 B"],
    [Number.NaN, "0 B"],
    [512, "512 B"],
    [1536, "1.5 KB"],
    [104_857_600, "100 MB"],
    [1_048_575, "1 MB"],
    [1024 ** 3 - 1, "1 GB"],
    [5 * 1024 ** 4, "5 TB"],
    [3 * 1024 ** 5, "3072 TB"],
  ])("%d bytes → %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("initials", () => {
  it.each([
    ["Ada Lovelace", "ada@x.dev", "AL"],
    ["  grace   brewster  hopper ", "g@x.dev", "GH"],
    ["Cher", "c@x.dev", "C"],
    [null, "zoe@x.dev", "Z"],
    ["   ", "yan@x.dev", "Y"],
    ["Émile Zola", "e@x.dev", "ÉZ"],
  ])("%j <%s> → %s", (name, email, expected) => {
    expect(initials(name, email)).toBe(expected);
  });
});
