import { expect, test, type Page } from "@playwright/test";

import {
  confirmLink,
  latestEmail,
  newUser,
  testEmail,
  testPassword,
} from "../tests/support/local-stack";

// Email links point at the local site_url (port 3000); the tests run the app on another port, so
// only the path and query of a link are used.
async function openEmailLink(page: Page, email: string, subject: string) {
  const message = await latestEmail(email);
  expect(message.subject).toBe(subject);
  const link = confirmLink(message.html);
  await page.goto(link.pathname + link.search);
}

/**
 * A form field by its label. Next.js keeps the previous page mounted (hidden) for instant back
 * navigation, so only the visible one counts.
 */
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });

async function signIn(page: Page, email: string, password: string) {
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
}

test("sign up, confirm by email, sign out, and sign back in", async ({ page }) => {
  const email = testEmail("e2e-signup");
  const password = testPassword();

  await page.goto("/");
  await page.getByRole("link", { name: "Create a free account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await field(page, "Name").fill("Ada Lovelace");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await openEmailLink(page, email, "Confirm your Lockerly account");
  await expect(page).toHaveURL(/\/drive$/);
  await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible();

  await openAccountMenu(page);
  await expect(page.getByRole("menu")).toContainText("Ada Lovelace");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/drive/settings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdrive%2Fsettings$/);
  await signIn(page, email, "wrong-password1");
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/drive\/settings$/);
  await expect(field(page, "Name")).toHaveValue("Ada Lovelace");
});

test("reset a forgotten password from the emailed link", async ({ page }) => {
  const { email } = await newUser("e2e-reset");
  const password = testPassword();

  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await field(page, "Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account uses that address")).toBeVisible();

  await openEmailLink(page, email, "Reset your Lockerly password");
  await expect(page).toHaveURL(/\/reset-password$/);
  await field(page, "New password").fill(password);
  await field(page, "Confirm new password").fill(`${password}x`);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("The passwords don't match.")).toBeVisible();
  await field(page, "New password").fill(password);
  await field(page, "Confirm new password").fill(password);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/drive$/);

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/sign-in");
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/drive$/);
});

test("settings: change the name, then sign out everywhere", async ({ page }) => {
  const email = testEmail("e2e-settings");
  const password = testPassword();
  await page.goto("/sign-up");
  await field(page, "Name").fill("Grace Hopper");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await openEmailLink(page, email, "Confirm your Lockerly account");

  // Signed in, the sign-in pages send people on to their drive.
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/drive$/);

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await field(page, "Name").fill("Grace B. Hopper");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(field(page, "Name")).toHaveValue("Grace B. Hopper");

  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/drive");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("a session from a password sign-in can't set a new password", async ({ page }) => {
  const { email, password } = await newUser("e2e-no-reset");
  await page.goto("/sign-in");
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/drive$/);

  await page.goto("/reset-password");
  await field(page, "New password").fill("hijacked1234");
  await field(page, "Confirm new password").fill("hijacked1234");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Your reset link has expired. Ask for a new one.")).toBeVisible();
});

test("a used or broken email link explains what happened", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email&next=/drive");
  await expect(page).toHaveURL(/\/auth\/error$/);
  await expect(page.getByRole("heading", { name: "That link didn't work" })).toBeVisible();
});

test("a link can't send people to another site after confirming", async ({ page }) => {
  const email = testEmail("e2e-next");
  await page.goto("/sign-up");
  await field(page, "Name").fill("Eve");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(testPassword());
  await page.getByRole("button", { name: "Create account" }).click();
  const link = confirmLink((await latestEmail(email)).html);
  link.searchParams.set("next", "//evil.example/");
  await page.goto(link.pathname + link.search);
  await expect(page).toHaveURL(/localhost:\d+\/drive$/);
});

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout only");

  test("the menu opens the sections of the drive", async ({ page }) => {
    const { email, password } = await newUser("e2e-phone");
    await page.goto("/sign-in");
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/drive$/);

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Trash" }).click();
    await expect(page).toHaveURL(/\/drive\/trash$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
  });
});
