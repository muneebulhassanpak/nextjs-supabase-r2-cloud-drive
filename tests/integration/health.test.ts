import { describe, expect, it } from "vitest";

import { checkHealth } from "@/server/services/health";

// Runs against the local stack started by `pnpm db:start` (Supabase + RustFS).
describe("checkHealth against the local stack", () => {
  it("reaches the database through the API and the storage bucket", async () => {
    const report = await checkHealth();
    expect(report.checks).toEqual({ database: "ok", storage: "ok" });
    expect(report.status).toBe("ok");
  });
});
