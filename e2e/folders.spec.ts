import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { newUser } from "../tests/support/local-stack";

const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });
const row = (page: Page, name: string) => page.getByRole("row", { name, exact: true });

async function signInAsNewUser(page: Page) {
  const user = await newUser("e2e-folders");
  await page.goto("/sign-in");
  await field(page, "Email").fill(user.email);
  await field(page, "Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible();
  return user;
}

async function newFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "New folder" }).click();
  await field(page, "Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(row(page, name)).toBeVisible();
  // Wait for the real folder (the optimistic one can't be opened yet).
  await expect(row(page, name)).not.toHaveAttribute("aria-disabled", "true");
}

async function openFolder(page: Page, name: string, isMobile: boolean) {
  if (isMobile) await row(page, name).click();
  else await row(page, name).dblclick();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function menuAction(page: Page, item: string, action: string, isMobile: boolean) {
  await page.getByRole("button", { name: `More actions for ${item}` }).click();
  if (isMobile) await page.getByRole("dialog").getByRole("button", { name: action }).click();
  else await page.getByRole("menuitem", { name: action }).click();
}

test("build a folder tree, find your way back with breadcrumbs", async ({ page, isMobile }) => {
  await signInAsNewUser(page);
  await expect(page.getByText("Your drive is empty")).toBeVisible();

  await newFolder(page, "Projects");
  await openFolder(page, "Projects", isMobile);
  await expect(page.getByText("This folder is empty")).toBeVisible();
  await newFolder(page, "2026");
  await openFolder(page, "2026", isMobile);
  await newFolder(page, "Taxes");
  await openFolder(page, "Taxes", isMobile);

  const breadcrumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumbs).toContainText("My Drive");
  await expect(breadcrumbs).toContainText("Projects");
  await expect(breadcrumbs).toContainText("2026");
  await breadcrumbs.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(row(page, "2026")).toBeVisible();

  await page.reload();
  await expect(row(page, "2026")).toBeVisible();
  await breadcrumbs.getByRole("link", { name: "My Drive" }).click();
  await expect(row(page, "Projects")).toBeVisible();
});

test("rename and trash, with clashing names caught before saving", async ({ page, isMobile }) => {
  await signInAsNewUser(page);
  await newFolder(page, "Drafts");
  await newFolder(page, "Final");

  await menuAction(page, "Drafts", "Rename", isMobile);
  await field(page, "Name").fill("final");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByText("There's already something called “final” here.")).toBeVisible();
  await field(page, "Name").fill("Notes / ideas");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.getByText("Names can't contain “/”.")).toBeVisible();
  await field(page, "Name").fill("Ideas");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(row(page, "Ideas")).toBeVisible();
  await expect(row(page, "Drafts")).toBeHidden();

  await menuAction(page, "Final", "Move to trash", isMobile);
  await expect(page.getByText("“Final” moved to the trash")).toBeVisible();
  await page.reload();
  await expect(row(page, "Ideas")).toBeVisible();
  await expect(row(page, "Final")).toBeHidden();
});

test("the suggested name works, and keys pressed in a menu stay in the menu", async ({ page }) => {
  await signInAsNewUser(page);
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(row(page, "Untitled folder")).not.toHaveAttribute("aria-disabled", "true");

  await row(page, "Untitled folder").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Open" })).toBeVisible();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await expect(row(page, "Untitled folder")).toBeVisible();
  await page.reload();
  await expect(row(page, "Untitled folder")).toBeVisible();
});

test("grid or list is remembered; sorting is in the address", async ({ page }) => {
  await signInAsNewUser(page);
  await newFolder(page, "b folder 10");
  await newFolder(page, "B folder 2");

  const names = page.getByRole("row").filter({ hasText: "folder" });
  await expect(names).toHaveText([/B folder 2/, /b folder 10/]);

  await page.getByRole("button", { name: /^Sort by/ }).click();
  await page.getByRole("menuitemradio", { name: "Z to A" }).click();
  await expect(page).toHaveURL(/sort=name&order=desc/);
  await expect(names).toHaveText([/b folder 10/, /B folder 2/]);

  await page.getByRole("button", { name: "Show as grid" }).click();
  await expect(page.getByRole("rowgroup", { name: "Folders" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("rowgroup", { name: "Folders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show as list" })).toBeVisible();
});

test("select several with the keyboard and mouse, then trash them", async ({ page, isMobile }) => {
  test.skip(isMobile, "selection with modifier keys is a desktop feature");
  await signInAsNewUser(page);
  for (const name of ["A", "B", "C", "D"]) await newFolder(page, name);

  await row(page, "A").click();
  await row(page, "C").click({ modifiers: ["Shift"] });
  await row(page, "D").click({ modifiers: ["ControlOrMeta"] });
  await row(page, "B").click({ modifiers: ["ControlOrMeta"] });
  for (const name of ["A", "C", "D"])
    await expect(row(page, name)).toHaveAttribute("aria-selected", "true");
  await expect(row(page, "B")).toHaveAttribute("aria-selected", "false");
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Details" })).toContainText(
    "3 items selected",
  );
  await page.getByRole("button", { name: "Close details" }).click();

  await row(page, "A").focus();
  await page.keyboard.press("Delete");
  await expect(page.getByText("3 items moved to the trash")).toBeVisible();
  await expect(row(page, "B")).toBeVisible();
  await expect(page.getByRole("row", { name: /^[ACD]$/ })).toHaveCount(0);

  await row(page, "B").click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Details" })).toContainText("Owner");
  await expect(page.getByRole("complementary", { name: "Details" })).toContainText("You");
});

test("a folder you can't see looks the same as one that doesn't exist", async ({ page }) => {
  const other = await newUser("e2e-other");
  const { data, error } = await other.client
    .from("items")
    .insert({ kind: "folder", name: "Private" })
    .select("id")
    .single();
  if (error) throw error;

  await signInAsNewUser(page);
  await page.goto(`/drive/folders/${data.id}`);
  await expect(page.getByRole("heading", { name: "We couldn't find that folder" })).toBeVisible();
  await page.goto(`/drive/folders/${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "We couldn't find that folder" })).toBeVisible();
  await page.goto("/drive/folders/not-an-id");
  await expect(page.getByRole("heading", { name: "We couldn't find that folder" })).toBeVisible();
});
