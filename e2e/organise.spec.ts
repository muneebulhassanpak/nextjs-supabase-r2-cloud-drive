import { expect, test, type Page } from "@playwright/test";

import { field, signInAsNewUser } from "./support";
import { adminClient } from "../tests/support/local-stack";

// Organising a drive: moving (by dialog and by dragging), stars, recents, and the trash.

const row = (page: Page, name: string) =>
  page.getByRole("row", { name, exact: true }).filter({ visible: true });

async function newFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await field(page, "Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  // Wait for the real folder (the optimistic one can't be opened or moved yet).
  await expect(row(page, name)).not.toHaveAttribute("aria-disabled", "true");
}

async function upload(page: Page, name: string, bytes: number) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "File upload" }).click();
  await (await chooser).setFiles({ name, mimeType: "text/plain", buffer: Buffer.alloc(bytes, 97) });
  await expect(page.getByRole("region", { name: "Uploads" }).getByRole("heading")).toHaveText(
    /complete$/,
  );
  await expect(row(page, name)).toBeVisible();
}

async function open(page: Page, name: string, isMobile: boolean) {
  if (isMobile) await row(page, name).click();
  else await row(page, name).dblclick();
}

async function openFolder(page: Page, name: string, isMobile: boolean) {
  await open(page, name, isMobile);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

/** Runs an item's action from its "More actions" button: a menu, or a sheet on phones. */
async function menuAction(page: Page, item: string, action: string, isMobile: boolean) {
  await page
    .getByRole("button", { name: `More actions for ${item}` })
    .filter({ visible: true })
    .click();
  if (isMobile) await page.getByRole("dialog").getByRole("button", { name: action }).click();
  else await page.getByRole("menuitem", { name: action }).click();
}

/** Back to the top of My Drive through the breadcrumb, waiting until it's on screen. */
async function goHome(page: Page) {
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "My Drive" })
    .click();
  await expect(page.getByRole("heading", { name: "My Drive", exact: true })).toBeVisible();
}

async function storageUsed(userId: string) {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("storage_used")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data.storage_used;
}

test("move a file with the folder picker", async ({ page, isMobile }) => {
  await signInAsNewUser(page, "e2e-organise");
  await newFolder(page, "Clients");
  await openFolder(page, "Clients", isMobile);
  await newFolder(page, "Acme");
  await goHome(page);
  await upload(page, "brief.txt", 100);

  await menuAction(page, "brief.txt", "Move to…", isMobile);
  const picker = page.getByRole("dialog", { name: "Move “brief.txt”" });
  await expect(picker).toContainText("Already here.");
  await picker.getByRole("button", { name: /Clients/ }).click();
  await picker.getByRole("button", { name: /Acme/ }).click();
  await expect(picker.getByRole("navigation", { name: "Folder path" })).toContainText("Acme");
  await picker.getByRole("button", { name: "Move here" }).click();

  await expect(page.getByText("Moved “brief.txt” to Acme")).toBeVisible();
  await expect(row(page, "brief.txt")).toBeHidden();
  await page
    .getByRole("region", { name: /Notifications/ })
    .getByRole("button", { name: "Open" })
    .click();
  await expect(page.getByRole("heading", { name: "Acme", exact: true })).toBeVisible();
  await expect(row(page, "brief.txt")).toBeVisible();

  // Search finds folders anywhere; a folder can't go inside itself.
  await goHome(page);
  await menuAction(page, "Clients", "Move to…", isMobile);
  const folderPicker = page.getByRole("dialog", { name: "Move “Clients”" });
  await folderPicker.getByRole("searchbox", { name: "Search folders" }).fill("acm");
  await expect(folderPicker.getByRole("list", { name: "Matching folders" })).toContainText("Acme");
  await folderPicker.getByRole("searchbox", { name: "Search folders" }).fill("");
  await expect(folderPicker.getByRole("button", { name: /Clients/ })).toBeDisabled();
});

test("drag items onto a folder, and back up the path", async ({ page, isMobile }) => {
  test.skip(isMobile, "dragging items is a desktop feature");
  await signInAsNewUser(page, "e2e-organise");
  await newFolder(page, "Archive");
  await newFolder(page, "2025");
  await newFolder(page, "2026");

  await row(page, "2025").click();
  await row(page, "2026").click({ modifiers: ["ControlOrMeta"] });
  await row(page, "2026").dragTo(row(page, "Archive"));
  await expect(page.getByText("Moved 2 items to Archive")).toBeVisible();
  await expect(row(page, "2025")).toBeHidden();
  await expect(row(page, "2026")).toBeHidden();

  await openFolder(page, "Archive", isMobile);
  await expect(row(page, "2025")).toBeVisible();
  await row(page, "2026").dragTo(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "My Drive" }),
  );
  await expect(page.getByText("Moved “2026” to My Drive")).toBeVisible();
  await page.reload();
  await expect(row(page, "2025")).toBeVisible();
  await expect(row(page, "2026")).toBeHidden();
});

test("star items, find them in Starred, and see what was opened in Recent", async ({
  page,
  isMobile,
}) => {
  await signInAsNewUser(page, "e2e-organise");
  await newFolder(page, "Plans");
  await upload(page, "roadmap.txt", 50);

  await menuAction(page, "Plans", "Add to Starred", isMobile);
  await expect(row(page, "Plans").getByLabel("Starred")).toBeVisible();
  await page.goto("/drive/starred");
  await expect(page.getByRole("heading", { name: "Starred" })).toBeVisible();
  await expect(row(page, "Plans")).toBeVisible();
  await expect(row(page, "roadmap.txt")).toBeHidden();
  await menuAction(page, "Plans", "Remove from Starred", isMobile);
  await expect(row(page, "Plans")).toBeHidden();
  await page.reload();
  await expect(page.getByText("No starred files")).toBeVisible();

  await page.goto("/drive");
  // A file counts as opened once it has been on screen for a moment.
  const opened = page.waitForResponse(/\/api\/files\/[^/]+\/opened$/);
  await open(page, "roadmap.txt", isMobile);
  await expect(page.getByRole("dialog", { name: "roadmap.txt" })).toBeVisible();
  expect((await opened).ok()).toBe(true);
  await page.keyboard.press("Escape");
  await page.goto("/drive/recent");
  await expect(page.getByRole("gridcell", { name: "Today" })).toBeVisible();
  await expect(row(page, "roadmap.txt")).toBeVisible();
});

test("trash, undo, restore, and delete forever frees the space", async ({ page, isMobile }) => {
  const user = await signInAsNewUser(page, "e2e-organise");
  await upload(page, "keep.txt", 1000);
  await upload(page, "drop.txt", 4000);
  await expect.poll(() => storageUsed(user.id)).toBe(5000);

  await menuAction(page, "keep.txt", "Move to trash", isMobile);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(row(page, "keep.txt")).toBeVisible();
  await page.reload();
  await expect(row(page, "keep.txt")).toBeVisible();

  await menuAction(page, "keep.txt", "Move to trash", isMobile);
  await expect(page.getByText("“keep.txt” moved to the trash")).toBeVisible();
  await menuAction(page, "drop.txt", "Move to trash", isMobile);
  await expect(page.getByText("“drop.txt” moved to the trash")).toBeVisible();

  await page.goto("/drive/trash");
  await expect(
    page.getByText("Items in the trash are deleted forever after 30 days."),
  ).toBeVisible();
  await menuAction(page, "keep.txt", "Restore", isMobile);
  await expect(page.getByText("Restored “keep.txt”")).toBeVisible();
  await expect(row(page, "keep.txt")).toBeHidden();

  await menuAction(page, "drop.txt", "Delete forever", isMobile);
  const confirm = page.getByRole("alertdialog", { name: "Delete “drop.txt” forever?" });
  await confirm.getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByText("“drop.txt” deleted forever")).toBeVisible();
  await expect(page.getByText("Trash is empty")).toBeVisible();
  await expect.poll(() => storageUsed(user.id)).toBe(1000);

  await page.goto("/drive");
  await expect(row(page, "keep.txt")).toBeVisible();
  await expect(row(page, "drop.txt")).toBeHidden();
});

test("empty the trash", async ({ page, isMobile }) => {
  const user = await signInAsNewUser(page, "e2e-organise");
  await upload(page, "a.txt", 300);
  await newFolder(page, "Old");
  await menuAction(page, "a.txt", "Move to trash", isMobile);
  await expect(page.getByText("“a.txt” moved to the trash")).toBeVisible();
  await menuAction(page, "Old", "Move to trash", isMobile);
  await expect(page.getByText("“Old” moved to the trash")).toBeVisible();

  await page.goto("/drive/trash");
  await expect(row(page, "a.txt")).toBeVisible();
  await page.getByRole("button", { name: "Empty trash" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Empty trash" }).click();
  await expect(page.getByText("Trash emptied")).toBeVisible();
  await expect(page.getByText("Trash is empty")).toBeVisible();
  await expect.poll(() => storageUsed(user.id)).toBe(0);
});
