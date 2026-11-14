import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { newUser } from "../tests/support/local-stack";

// Opening files: the right viewer for each type, stepping through a folder with the arrow keys,
// and script-capable files shown only as source.

const FIXTURES = join(process.cwd(), "fixtures", "files");
const TYPES: Record<string, string> = {
  "archive.zip": "application/zip",
  "clip.webm": "video/webm",
  "greet.ts": "text/plain",
  "handbook.pdf": "application/pdf",
  "logo.svg": "image/svg+xml",
  "mountains.jpg": "image/jpeg",
  "page.html": "text/html",
  "tone.wav": "audio/wav",
};

const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });
const row = (page: Page, name: string) =>
  page.getByRole("row", { name, exact: true }).filter({ visible: true });

test.beforeEach(async ({ page }) => {
  const user = await newUser("e2e-previews");
  await page.goto("/sign-in");
  await field(page, "Email").fill(user.email);
  await field(page, "Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "File upload" }).click();
  await (
    await chooser
  ).setFiles(
    Object.entries(TYPES).map(([name, mimeType]) => ({
      name,
      mimeType,
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed fixture names
      buffer: readFileSync(join(FIXTURES, name)),
    })),
  );
  await expect(page.getByRole("region", { name: "Uploads" }).getByRole("heading")).toHaveText(
    "8 uploads complete",
  );
  await expect(row(page, "tone.wav")).toBeVisible();
  // Out of the way of the files' menus.
  await page.getByRole("button", { name: "Close uploads" }).click();
});

test("open each type and step through the folder with the arrow keys", async ({
  page,
  isMobile,
}) => {
  // A tap opens a file on phones; a double-click on desktop.
  if (isMobile) await row(page, "archive.zip").click();
  else await row(page, "archive.zip").dblclick();
  const preview = page.getByRole("dialog", { name: "archive.zip" });
  await expect(preview.getByText("No preview available")).toBeVisible();
  // Where it is in the folder (desktop only: phones keep the header short).
  if (!isMobile) await expect(preview.getByText("1 of 8")).toBeVisible();

  const next = async (name: string) => {
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name })).toBeVisible();
  };

  await next("clip.webm");
  await expect(page.locator("video")).toHaveAttribute("src", /^http/);

  await next("greet.ts");
  // Highlighted: keywords get their own colour.
  await expect(page.getByText("interface", { exact: true })).toHaveAttribute(
    "style",
    /--shiki-light/,
  );

  await next("handbook.pdf");
  // Browsers that can show PDFs embed them; the rest offer to open the PDF on its own.
  await expect(
    page.locator('iframe[title="handbook.pdf"]').or(page.getByRole("link", { name: "Open PDF" })),
  ).toBeVisible();

  await next("logo.svg");
  await expect(page.getByText('<script>alert("this never runs either")</script>')).toBeVisible();

  await next("mountains.jpg");
  const image = page.getByRole("img", { name: "mountains.jpg" });
  await expect(image).toBeVisible();
  expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1200);
  await page.getByRole("button", { name: "Actual size" }).click();
  // Zoomed in, the arrow keys pan the picture rather than change file.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "mountains.jpg" })).toBeVisible();
  await page.getByRole("button", { name: "Fit to screen" }).click();

  await next("page.html");
  await expect(page.getByText("Shown as source, never run")).toBeVisible();

  await next("tone.wav");
  await expect(page.locator("audio")).toHaveAttribute("src", /^http/);
  await page.keyboard.press("ArrowRight"); // the last file: nowhere further to go
  await expect(page.getByRole("dialog", { name: "tone.wav" })).toBeVisible();

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "page.html" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row(page, "page.html")).toHaveAttribute("aria-selected", "true");
});

test("open from the menu and step with the buttons, as on a phone", async ({ page }) => {
  await page
    .getByRole("button", { name: "More actions for mountains.jpg" })
    .filter({ visible: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Preview" })
    .or(page.getByRole("button", { name: "Preview" }))
    .click();
  await expect(page.getByRole("dialog", { name: "mountains.jpg" })).toBeVisible();
  await page.getByRole("button", { name: "Next: page.html" }).click();
  await expect(page.getByRole("dialog", { name: "page.html" })).toBeVisible();
  await page.getByRole("button", { name: "Previous: mountains.jpg" }).click();
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("images show as thumbnails in grid view", async ({ page }) => {
  await page.getByRole("button", { name: "Show as grid" }).click();
  const tile = row(page, "mountains.jpg");
  const thumbnail = tile.locator("img");
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1200);
  // Other files keep their icon.
  await expect(row(page, "greet.ts").locator("img")).toHaveCount(0);
});
