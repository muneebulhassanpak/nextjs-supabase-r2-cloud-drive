import { expect, test, type Page } from "@playwright/test";

import { field, signInAsNewUser } from "./support";

// Search: suggestions while typing, opening one, the full results with filters kept in the URL,
// and what happened to a file in its Activity tab.

const row = (page: Page, name: string) =>
  page.getByRole("row", { name, exact: true }).filter({ visible: true });

async function upload(page: Page, files: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "File upload" }).click();
  await (
    await chooser
  ).setFiles(
    files.map((name) => ({ name, mimeType: "text/plain", buffer: Buffer.from(`about ${name}`) })),
  );
  await expect(page.getByRole("region", { name: "Uploads" }).getByRole("heading")).toHaveText(
    /complete$/,
  );
}

test("search, open a suggestion, then filter the results", async ({ page, isMobile }) => {
  await signInAsNewUser(page, "e2e-search");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  await field(page, "Name").fill("Budget planning");
  await page.getByRole("button", { name: "Create" }).click();
  await upload(page, ["budget-2026.txt", "travel.txt"]);
  await expect(row(page, "travel.txt")).toBeVisible();

  const search = page.getByRole("combobox", { name: "Search in Lockerly" });
  await search.fill("budget");
  const suggestions = page.getByRole("listbox", { name: "Suggestions" });
  await expect(suggestions.getByRole("option")).toHaveText(["Budget planning", "budget-2026.txt"]);
  await suggestions.getByRole("option", { name: "budget-2026.txt" }).click();
  await expect(page.getByRole("dialog", { name: "budget-2026.txt" })).toBeVisible();
  await expect(page.getByText("about budget-2026.txt")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Enter shows every result; a filter narrows them and Back undoes it.
  await search.fill("budget");
  await search.press("Enter");
  await expect(page.getByRole("heading", { name: "Results for “budget”" })).toBeVisible();
  await expect(row(page, "Budget planning")).toBeVisible();
  await page.getByRole("button", { name: "Type" }).click();
  await page.getByRole("menuitemradio", { name: "Folders" }).click();
  await expect(page).toHaveURL(/type=folder/);
  await expect(row(page, "budget-2026.txt")).toBeHidden();
  await expect(row(page, "Budget planning")).toBeVisible();
  await page.goBack();
  await expect(row(page, "budget-2026.txt")).toBeVisible();
  await expect(search).toHaveValue("budget");

  await page.getByRole("button", { name: "Owner" }).click();
  await page.getByRole("menuitemradio", { name: "Not owned by me" }).click();
  await expect(page.getByText("No results")).toBeVisible();

  if (isMobile) return;
  // What happened to the file, on the Activity tab.
  await page.goBack();
  await row(page, "budget-2026.txt").click();
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByRole("list", { name: "Activity" })).toHaveText(
    /You uploaded this file\s*just now/,
  );
});
