import { execFileSync } from "node:child_process";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// The daily jobs need these; the demo's tests run one first (e2e/fill-demo.ts). The local key is
// read once, and only from the local stack (workers load this file too, and inherit it).
export const CRON_SECRET = "local-cron-secret-for-browser-tests";
process.env.E2E_SECRET_KEY ??= /^SECRET_KEY="?([^"\n]+)"?$/m.exec(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
)?.[1];

/**
 * End-to-end tests run against a production build (`pnpm build` first) and the local stack
 * (`pnpm db:start`). The app's defaults point at the local stack, so no settings are needed.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  globalSetup: "./e2e/fill-demo.ts",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      LOG_LEVEL: "warn",
      CRON_SECRET,
      SUPABASE_SECRET_KEY: process.env.E2E_SECRET_KEY ?? "",
    },
  },
});
