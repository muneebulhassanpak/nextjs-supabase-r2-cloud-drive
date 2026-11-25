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

test("the recorded clips match the theme and can be paused", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const clips = page.locator("[aria-roledescription=slide]").first().locator("video:visible");
  await expect(clips).toHaveCount(1);
  await clips.evaluate((video) => {
    video.scrollIntoView({ block: "center" });
  });
  await expect(clips.locator("source").first()).toHaveAttribute("src", "/demos/upload-dark.webm");

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  expect(await clips.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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

test("unknown pages say so, and no page can be framed", async ({ page }) => {
  const response = await page.goto("/nothing-here");
  expect(response?.status()).toBe(404);
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await page.getByRole("link", { name: "Go to the home page" }).click();
  await expect(page).toHaveURL("/");
});
