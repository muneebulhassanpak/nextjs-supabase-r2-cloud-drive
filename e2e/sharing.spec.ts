import { devices, expect, test, type Browser, type Page } from "@playwright/test";

import { field, signInAsNewUser } from "./support";
import { adminClient } from "../tests/support/local-stack";

// Sharing, with two people in separate browsers, and a public link opened signed out.

const row = (page: Page, name: string) =>
  page.getByRole("row", { name, exact: true }).filter({ visible: true });

async function newFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await field(page, "Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(row(page, name)).not.toHaveAttribute("aria-disabled", "true");
}

async function upload(page: Page, name: string, content: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "File upload" }).click();
  await (await chooser).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from(content) });
  await expect(page.getByRole("region", { name: "Uploads" }).getByRole("heading")).toHaveText(
    /complete$/,
  );
  await expect(row(page, name)).toBeVisible();
}

async function openFolder(page: Page, name: string, isMobile: boolean) {
  if (isMobile) await row(page, name).click();
  else await row(page, name).dblclick();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function goHome(page: Page) {
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "My Drive" })
    .click();
  await expect(page.getByRole("heading", { name: "My Drive", exact: true })).toBeVisible();
}

/** A second person's browser, like the first (a phone on the mobile project). */
async function newBrowser(browser: Browser, isMobile: boolean) {
  const { defaultBrowserType: _, ...phone } = devices["Pixel 7"];
  return browser.newContext({
    ...(isMobile && phone),
    baseURL: test.info().project.use.baseURL,
  });
}

/** Opens an item's share dialog from its "More actions" button (a sheet on phones). */
async function openShare(page: Page, item: string, isMobile: boolean) {
  await page
    .getByRole("button", { name: `More actions for ${item}` })
    .filter({ visible: true })
    .click();
  if (isMobile) await page.getByRole("dialog").getByRole("button", { name: "Share" }).click();
  else await page.getByRole("menuitem", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Share “${item}”` });
  await expect(dialog.getByRole("heading", { name: "People with access" })).toBeVisible();
  return dialog;
}

test("an owner shares a folder; the other person sees it, read-only", async ({
  page,
  browser,
  isMobile,
}) => {
  const owner = await signInAsNewUser(page, "e2e-share-owner");
  await newFolder(page, "Team plans");
  await openFolder(page, "Team plans", isMobile);
  await upload(page, "roadmap.txt", "ship sharing");
  await goHome(page);

  // The other person, in their own browser.
  const context = await newBrowser(browser, isMobile);
  const other = await context.newPage();
  const friend = await signInAsNewUser(other, "e2e-share-friend");

  const dialog = await openShare(page, "Team plans", isMobile);
  await dialog.getByLabel("Add people").fill(friend.email);
  await dialog.getByRole("button", { name: "Share", exact: true }).click();
  await expect(dialog.getByText(friend.email)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: `Role for ${friend.email}: Viewer` }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await other.goto("/drive/shared");
  await expect(row(other, "Team plans")).toBeVisible();
  await openFolder(other, "Team plans", isMobile);
  await expect(row(other, "roadmap.txt")).toBeVisible();
  // A viewer can't add anything, and the dialog says why they can't share it on.
  await expect(other.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
  const theirs = await openShare(other, "roadmap.txt", isMobile);
  await expect(theirs.getByText("Only the owner can change who has access.")).toBeVisible();
  await expect(theirs.getByText(owner.email)).toBeVisible();
  await expect(theirs.getByText("From “Team plans”")).toBeVisible();
  await context.close();
});

test("a public link opens signed out, stops when turned off, and says when it expired", async ({
  page,
  browser,
  isMobile,
}) => {
  await signInAsNewUser(page, "e2e-link-owner");
  await newFolder(page, "Holiday");
  await openFolder(page, "Holiday", isMobile);
  await upload(page, "itinerary.txt", "day one: beach");
  await goHome(page);

  const dialog = await openShare(page, "Holiday", isMobile);
  await dialog.getByRole("button", { name: "Create link" }).click();
  const url = await dialog.getByRole("textbox", { name: "Public link" }).inputValue();
  expect(url).toMatch(/\/s\/[\w-]{43}$/);

  const visitor = await (await newBrowser(browser, isMobile)).newPage();
  await visitor.goto(url);
  await expect(visitor.getByRole("heading", { name: "Holiday" })).toBeVisible();
  await visitor.getByRole("button", { name: "Preview itinerary.txt" }).click();
  await expect(visitor.getByText("day one: beach")).toBeVisible();
  await visitor.keyboard.press("Escape");

  // Expired: the link's date is moved into the past, as if a week had gone by.
  const token = new URL(url).pathname.split("/").pop() ?? "";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = `\\x${Buffer.from(hash).toString("hex")}`;
  const { error } = await adminClient()
    .from("share_links")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("token_hash", hex);
  expect(error).toBeNull();
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "This link has expired" })).toBeVisible();

  await dialog.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Link turned off")).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "This link was turned off" })).toBeVisible();
  await visitor.context().close();
});
