import { expect, type Page } from "@playwright/test";

import { newUser } from "../tests/support/local-stack";

/**
 * How long to wait for the drive after signing in. The first drive page is the heaviest of a run:
 * with every worker landing on one local server at once, and the sidebar prefetching each section,
 * it can take longer than the default five seconds. One person signing in sees it in about two.
 */
export const LANDING_TIMEOUT = 15_000;

export const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });

/** Signs a fresh user in through the form and waits for their drive. */
export async function signInAsNewUser(page: Page, prefix: string) {
  const user = await newUser(prefix);
  await page.goto("/sign-in");
  await field(page, "Email").fill(user.email);
  await field(page, "Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible({
    timeout: LANDING_TIMEOUT,
  });
  return user;
}
