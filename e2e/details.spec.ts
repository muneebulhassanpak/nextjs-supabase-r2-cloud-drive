import { expect, test, type Page } from "@playwright/test";

import { field, signInAsNewUser } from "./support";

// The details window: what it says, stepping through items, and acting without losing it.

const row = (page: Page, name: string) =>
  page.getByRole("row", { name, exact: true }).filter({ visible: true });
const details = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });

async function newFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await field(page, "Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(row(page, name)).toBeVisible();
  await expect(row(page, name)).not.toHaveAttribute("aria-disabled", "true");
}

test("step through items, act on one, and come back to its row", async ({ page, isMobile }) => {
  test.skip(isMobile, "selecting a row and arrow keys are for computers");
  await signInAsNewUser(page, "e2e-details");
  const button = page.getByRole("button", { name: "Details", exact: true });
  await expect(button).toBeDisabled();
  for (const name of ["Alpha", "Beta"]) await newFolder(page, name);

  await row(page, "Alpha").click();
  await button.click();
  await expect(details(page, "Alpha")).toContainText("1 of 2");
  await expect(details(page, "Alpha")).toContainText("Only you can open this");
  await expect(page.getByRole("button", { name: "Previous item" })).toBeDisabled();

  // The arrows belong to the tabs while they have the focus, and to the items otherwise.
  await page.getByRole("tab", { name: "Details" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(details(page, "Alpha").getByRole("list", { name: "Activity" })).toHaveText(
    /You created this folder\s*just now/,
  );
  await page.getByRole("button", { name: "Next item" }).click();
  await expect(details(page, "Beta")).toContainText("2 of 2");
  // At the end the button keeps the focus, so the arrow keys still work.
  await page.keyboard.press("ArrowLeft");
  await expect(details(page, "Alpha")).toContainText("1 of 2");
  await page.keyboard.press("ArrowRight");
  await expect(details(page, "Beta")).toContainText("2 of 2");
  await page.getByRole("tab", { name: "Details" }).click();

  // Starring and renaming keep the window open; sharing shows up in it.
  await details(page, "Beta").getByRole("button", { name: "Add to Starred" }).click();
  await expect(
    details(page, "Beta").getByRole("button", { name: "Remove from Starred" }),
  ).toBeVisible();
  await details(page, "Beta").getByRole("button", { name: "Share" }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByRole("textbox", { name: "Public link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details(page, "Beta")).toContainText("Anyone with the link");
  await details(page, "Beta").getByRole("button", { name: "Rename" }).click();
  await field(page, "Name").fill("Gamma");
  await page
    .getByRole("dialog", { name: "Rename" })
    .getByRole("button", { name: "Rename" })
    .click();
  await expect(details(page, "Gamma")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row(page, "Gamma")).toBeFocused();

  // Inside a folder with nothing selected, it's about the folder.
  await row(page, "Alpha").dblclick();
  await expect(page.getByText("This folder is empty")).toBeVisible();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(details(page, "Alpha")).toContainText("Empty");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Details", exact: true })).toBeFocused();
});

test("on a phone, details open as a sheet from the item's menu", async ({ page, isMobile }) => {
  test.skip(!isMobile, "computers get a window");
  await signInAsNewUser(page, "e2e-details");
  await newFolder(page, "Alpha");
  await page.getByRole("button", { name: "More actions for Alpha" }).click();
  await page.getByRole("button", { name: "Details", exact: true }).last().click();
  const sheet = details(page, "Alpha");
  await expect(sheet).toContainText("Only you can open this");
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(viewport?.height);
  expect(Math.round(box?.width ?? 0)).toBe(viewport?.width);
});
