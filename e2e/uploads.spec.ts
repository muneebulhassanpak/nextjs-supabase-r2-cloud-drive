import { expect, test, type Page } from "@playwright/test";

import { adminClient, newUser } from "../tests/support/local-stack";

// Uploads and downloads in a real browser: bytes go from the page straight to the local S3 server
// through signed links, as they go to R2 on staging and production.

const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });
const row = (page: Page, name: string) =>
  page.getByRole("row", { name, exact: true }).filter({ visible: true });
const panel = (page: Page) => page.getByRole("region", { name: "Uploads" });

async function signInAsNewUser(page: Page) {
  const user = await newUser("e2e-uploads");
  await page.goto("/sign-in");
  await field(page, "Email").fill(user.email);
  await field(page, "Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible();
  return user;
}

const text = (name: string, content: string) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(content),
});

/** Picks files through New → File upload, as a person would. */
async function chooseFiles(page: Page, files: Parameters<Page["setInputFiles"]>[1]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "File upload" }).click();
  await (await chooser).setFiles(files);
}

test("upload several files, see them arrive, and download one", async ({ page, isMobile }) => {
  await signInAsNewUser(page);
  await chooseFiles(page, [
    text("notes.txt", "first notes"),
    text("todo.txt", "buy milk"),
    { name: "photo.png", mimeType: "image/png", buffer: Buffer.alloc(300_000, 1) },
  ]);

  await expect(panel(page).getByRole("heading")).toHaveText("3 uploads complete");
  for (const name of ["notes.txt", "todo.txt", "photo.png"])
    await expect(row(page, name)).toBeVisible();
  // The storage meter sits in the sidebar (behind the menu on phones).
  if (!isMobile) await expect(page.getByText("293 KB of 100 MB used")).toBeVisible();

  // The same name again is kept apart, not overwritten.
  await chooseFiles(page, [text("notes.txt", "second notes")]);
  await expect(panel(page)).toContainText("Saved as “notes (1).txt”");
  await expect(row(page, "notes (1).txt")).toBeVisible();

  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "More actions for notes.txt" })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Download" })
    .or(page.getByRole("button", { name: "Download" }))
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("notes.txt");
  const stream = await file.createReadStream();
  let content = "";
  for await (const chunk of stream) content += String(chunk);
  expect(content).toBe("first notes");
});

test("files over 25 MB and over the quota are refused with a reason", async ({ page }) => {
  const user = await signInAsNewUser(page);
  await adminClient().from("profiles").update({ storage_quota: 1000 }).eq("id", user.id);

  await chooseFiles(page, [
    {
      name: "huge.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(26 * 1024 * 1024),
    },
    text("too-much.txt", "x".repeat(2000)),
    text("fits.txt", "small"),
  ]);
  await expect(panel(page).getByRole("heading")).toHaveText("1 upload complete, 2 failed");
  await expect(panel(page)).toContainText("Files can be at most 25 MB.");
  await expect(panel(page)).toContainText("Not enough storage space left");
  await expect(row(page, "fits.txt")).toBeVisible();
  await expect(row(page, "too-much.txt")).toBeHidden();
});

test("drop files onto a folder to upload them there", async ({ page, isMobile }) => {
  test.skip(isMobile, "dragging files in is a desktop feature");
  await signInAsNewUser(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await field(page, "Name").fill("Inbox");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(row(page, "Inbox")).not.toHaveAttribute("aria-disabled", "true");
  await row(page, "Inbox").dblclick();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

  const files = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["dropped"], "dropped.txt", { type: "text/plain" }));
    return transfer;
  });
  const empty = page.getByText("This folder is empty").filter({ visible: true });
  await empty.dispatchEvent("dragenter", { dataTransfer: files });
  await empty.dispatchEvent("dragover", { dataTransfer: files });
  await expect(page.getByText("Drop files to upload")).toBeVisible();
  await page.getByText("to Inbox").dispatchEvent("drop", { dataTransfer: files });
  await expect(row(page, "dropped.txt")).toBeVisible();
  await expect(panel(page)).toContainText("In Inbox");
});

test("set and remove a profile picture", async ({ page }) => {
  await signInAsNewUser(page);
  await page.goto("/drive/settings");
  await expect(page.getByRole("button", { name: "Add picture" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add picture" }).click();
  // The smallest valid PNG: one transparent pixel.
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await (await chooser).setFiles({ name: "me.png", mimeType: "image/png", buffer: pixel });
  await expect(page.getByText("Picture updated")).toBeVisible();
  const picture = page.getByRole("img", { name: "Your profile picture" });
  await expect(picture).toBeVisible();
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Picture removed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add picture" })).toBeVisible();
});
