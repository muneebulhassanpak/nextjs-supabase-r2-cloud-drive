import { describe, expect, it } from "vitest";

import { checkHealth } from "@/server/services/health";

const ok = () => Promise.resolve();
const hang = () => new Promise<void>(() => undefined);
const fail = () => Promise.reject(new Error("unreachable"));

describe("checkHealth", () => {
  it("is ok when every dependency answers", async () => {
    const report = await checkHealth({ database: ok, storage: ok });
    expect(report).toEqual({
      status: "ok",
      version: "local",
      checks: { database: "ok", storage: "ok" },
    });
  });

  it.each([
    ["database", { database: fail, storage: ok }, { database: "error", storage: "ok" }],
    ["storage", { database: ok, storage: fail }, { database: "ok", storage: "error" }],
    ["both", { database: fail, storage: fail }, { database: "error", storage: "error" }],
  ] as const)("is degraded when %s fails", async (_name, checks, expected) => {
    const report = await checkHealth(checks);
    expect(report.status).toBe("degraded");
    expect(report.checks).toEqual(expected);
  });

  it("counts a check that never answers as failed", async () => {
    const report = await checkHealth({ database: hang, storage: ok }, 20);
    expect(report.status).toBe("degraded");
    expect(report.checks).toEqual({ database: "error", storage: "ok" });
  });
});
