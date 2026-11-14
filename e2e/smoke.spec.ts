import { expect, test } from "@playwright/test";

test("the health check passes against the local stack", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "ok",
    checks: { database: "ok", storage: "ok" },
  });
  expect(response.headers()["x-request-id"]).toBeTruthy();
});

test("the home page shows the product and switches theme", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Lockerly");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("people who prefer less motion get a still page, with every section shown", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const animations = await page
    .locator("h1, .reveal")
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
  expect(animations.length).toBeGreaterThan(1);
  expect(new Set(animations)).toEqual(new Set(["none"]));
  await page.getByRole("link", { name: "Get started free" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Start with 100 MB, free" })).toHaveCSS(
    "opacity",
    "1",
  );
});
