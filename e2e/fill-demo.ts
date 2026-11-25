import { CRON_SECRET } from "../playwright.config";

import type { FullConfig } from "@playwright/test";

/** Fills the demo accounts before the tests, through the same job that resets them every day. */
export default async function fillDemo(config: FullConfig) {
  const base = config.projects[0]?.use.baseURL ?? "";
  const response = await fetch(`${base}/api/cron/reset-demo`, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!response.ok) throw new Error(`The demo reset answered ${String(response.status)}.`);
}
