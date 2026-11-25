import { expect, test, type Page } from "@playwright/test";

import { field, signInAsNewUser } from "./support";

// The Activity screen: what people did shows up, can be filtered, and outlives what it's about.

const open = async (page: Page, section: string, isMobile: boolean) => {
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("navigation", { name: "Drive" })
    .getByRole("link", { name: section })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: section, level: 1 }).filter({ visible: true }),
  ).toBeVisible();
};

test("everything done shows up by day, filtered, even once it's deleted", async ({
  page,
  isMobile,
}) => {
  await signInAsNewUser(page, "e2e-activity");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await field(page, "Name").fill("Plans");
  await page.getByRole("button", { name: "Create" }).click();
  const row = page.getByRole("row", { name: "Plans", exact: true }).filter({ visible: true });
  await expect(row).not.toHaveAttribute("aria-disabled", "true");
  await page.getByRole("button", { name: "More actions for Plans" }).click();
  const menu = isMobile ? page.getByRole("dialog") : page.getByRole("menu");
  await menu.getByText("Move to trash").click();
  await expect(page.getByText("moved to the trash")).toBeVisible();

  await open(page, "Activity", isMobile);
  const today = page.getByRole("region", { name: "Today" }).filter({ visible: true });
  await expect(today.getByRole("listitem")).toContainText([
    "You moved “Plans” to the trash",
    "You created “Plans”",
    "You signed in",
  ]);

  await open(page, "Trash", isMobile);
  await page.getByRole("button", { name: "Empty trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Empty trash" }).click();
  await expect(page.getByText("Trash is empty")).toBeVisible();

  await open(page, "Activity", isMobile);
  await expect(today.getByRole("listitem").first()).toContainText("You deleted “Plans” forever");
  await expect(today.getByRole("link")).toHaveCount(0);

  await page.getByRole("button", { name: "What" }).filter({ visible: true }).click();
  await page.getByRole("menuitemradio", { name: "Account" }).click();
  await expect(page).toHaveURL(/type=account/);
  await expect(today.getByRole("listitem")).toHaveText([/You signed in/, /You signed in/]); // the helper, then the form
  await page.getByRole("button", { name: "Who" }).filter({ visible: true }).click();
  await page.getByRole("menuitemradio", { name: "By others" }).click();
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).filter({ visible: true }).click();
  await expect(today.getByRole("listitem").first()).toContainText("deleted “Plans” forever");
});

test("an entry opens the file it's about", async ({ page, isMobile }) => {
  await signInAsNewUser(page, "e2e-activity");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "File upload" }).click();
  await (
    await chooser
  ).setFiles({ name: "hello.txt", mimeType: "text/plain", buffer: Buffer.from("hi there") });
  await expect(
    page.getByRole("row", { name: "hello.txt" }).filter({ visible: true }),
  ).toBeVisible();
  await open(page, "Activity", isMobile);
  await page.getByRole("link", { name: /uploaded “hello.txt”/ }).click();
  await expect(page.getByRole("dialog", { name: "hello.txt" })).toBeVisible();
  await expect(page.getByText("hi there")).toBeVisible();
});
