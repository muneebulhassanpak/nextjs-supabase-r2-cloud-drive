import { describe, expect, it } from "vitest";

import { itemNameSchema } from "@/lib/drive/names";
import { parseSort, sortItems, type Sort } from "@/lib/drive/sort";

describe("itemNameSchema", () => {
  it("trims and accepts ordinary names", () => {
    expect(itemNameSchema.parse("  Tax returns 2026  ")).toBe("Tax returns 2026");
    expect(itemNameSchema.parse("résumé.final (2).pdf")).toBe("résumé.final (2).pdf");
  });

  it.each([
    ["", "Enter a name."],
    ["   ", "Enter a name."],
    ["x".repeat(256), "Keep it under 255 characters."],
    ["a/b", "Names can't contain “/”."],
    ["tab\there", "Names can't contain control characters."],
    [".", "That name is reserved."],
    ["..", "That name is reserved."],
  ])("refuses %j", (name, message) => {
    expect(itemNameSchema.safeParse(name).error?.issues[0]?.message).toBe(message);
  });
});

describe("parseSort", () => {
  it.each([
    [{}, { key: "name", order: "asc" }],
    [{ sort: "size" }, { key: "size", order: "desc" }],
    [
      { sort: "modified", order: "asc" },
      { key: "modified", order: "asc" },
    ],
    [
      { sort: "owner", order: "sideways" },
      { key: "name", order: "asc" },
    ],
    [{ sort: ["size"] }, { key: "name", order: "asc" }],
  ])("%j → %j", (params, expected) => {
    expect(parseSort(params)).toEqual(expected);
  });
});

describe("sortItems", () => {
  const item = (name: string, kind: "file" | "folder", size: number | null, day: number) => ({
    name,
    kind,
    size,
    updatedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
  });
  const items = [
    item("file 10.txt", "file", 300, 3),
    item("Zeta", "folder", null, 1),
    item("file 2.txt", "file", 100, 5),
    item("alpha", "folder", null, 4),
    item("File 1.txt", "file", 100, 2),
  ];
  const names = (sort: Sort) => sortItems(items, sort).map((i) => i.name);

  it("puts folders first and sorts names naturally, ignoring case", () => {
    expect(names({ key: "name", order: "asc" })).toEqual([
      "alpha",
      "Zeta",
      "File 1.txt",
      "file 2.txt",
      "file 10.txt",
    ]);
  });

  it("reverses names but keeps folders first", () => {
    expect(names({ key: "name", order: "desc" })).toEqual([
      "Zeta",
      "alpha",
      "file 10.txt",
      "file 2.txt",
      "File 1.txt",
    ]);
  });

  it("sorts by date modified, newest first", () => {
    expect(names({ key: "modified", order: "desc" })).toEqual([
      "alpha",
      "Zeta",
      "file 2.txt",
      "file 10.txt",
      "File 1.txt",
    ]);
  });

  it("sorts by size, breaking ties by name", () => {
    expect(names({ key: "size", order: "asc" })).toEqual([
      "alpha",
      "Zeta",
      "File 1.txt",
      "file 2.txt",
      "file 10.txt",
    ]);
  });

  it("doesn't change the list it was given", () => {
    const before = items.map((i) => i.name);
    sortItems(items, { key: "size", order: "desc" });
    expect(items.map((i) => i.name)).toEqual(before);
  });
});
