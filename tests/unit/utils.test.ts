import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("knows the design tokens' type sizes aren't colours", () => {
    expect(cn("text-display text-foreground")).toBe("text-display text-foreground");
    expect(cn("text-sm text-title")).toBe("text-title");
  });

  it("knows the grid is a pattern and the elevations are shadows", () => {
    expect(cn("bg-grid bg-canvas")).toBe("bg-grid bg-canvas");
    expect(cn("shadow-sm shadow-soft")).toBe("shadow-soft");
  });

  it("still merges ordinary conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
