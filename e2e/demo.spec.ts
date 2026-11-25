import { expect, test } from "@playwright/test";

// One click into the shared demo, and what it can't do. Both projects share the account, so these
// tests only look.

test("the demo opens in one click, filled in, and can't be changed", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Demo" })).toContainText("resets every day");
  for (const name of ["Projects", "Finance", "Photos", "Welcome to Lockerly.md"]) {
    await expect(page.getByRole("row", { name, exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "More actions for Photos" }).click();
  const menu = isMobile ? page.getByRole("dialog") : page.getByRole("menu");
  await menu.getByText("Share", { exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /Share/ });
  await dialog.getByPlaceholder("Emails, separated by commas").fill("stranger@test.dev");
  await dialog.getByRole("button", { name: "Share", exact: true }).click();
  await expect(dialog.getByText("The demo can only share with")).toBeVisible();

  await page.goto("/drive/activity");
  await expect(page.getByText("downloaded “Employee handbook.pdf”")).toBeVisible();
  await expect(page.getByText("signed in")).toHaveCount(0);

  await page.goto("/drive/settings");
  await expect(page.getByText("can't be changed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out everywhere" })).toHaveCount(0);

  await page.getByRole("button", { name: "Create your own account" }).click();
  await expect(page).toHaveURL("/sign-up");
});

test("keyboard shortcuts search, make a folder and list themselves", async ({ page, isMobile }) => {
  test.skip(isMobile, "no keyboard");
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible();
  await expect(async () => {
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible({
      timeout: 500,
    });
  }).toPass();
  // Nothing else happens behind a dialog.
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "New folder" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("/");
  const search = page.getByRole("combobox", { name: "Search in Lockerly" });
  await expect(search).toBeFocused();
  // While typing, the keys are letters.
  await page.keyboard.type("n?/");
  await expect(search).toHaveValue("n?/");
});
