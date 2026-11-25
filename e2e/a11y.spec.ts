import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Every screen against the WCAG 2.1 A and AA rules a machine can check, in light and dark.

const check = async (page: Page, where: string) => {
  // Colours mid-fade would be judged as they are.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map(
      ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(" ")).join(", ")}`,
    ),
    where,
  ).toEqual([]);
};

for (const colorScheme of ["light", "dark"] as const) {
  test(`no accessibility problems in the ${colorScheme} theme`, async ({ page, isMobile }) => {
    test.slow();
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password"]) {
      await page.goto(path);
      await check(page, path);
    }
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Try the demo" }).click();
    await expect(page.getByRole("heading", { name: "My Drive" })).toBeVisible();
    await check(page, "My Drive");
    for (const [path, title] of [
      ["activity", "Activity"],
      ["shared", "Shared with me"],
      ["starred", "Starred"],
      ["trash", "Trash"],
      ["settings", "Settings"],
    ] as const) {
      await page.goto(`/drive/${path}`);
      await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
      await check(page, title);
    }
    await page.goto("/drive");
    await page.getByRole("button", { name: "More actions for Photos" }).click();
    const menu = isMobile ? page.getByRole("dialog") : page.getByRole("menu");
    await menu.getByText("Details").click();
    await expect(page.getByRole("dialog", { name: "Photos" })).toBeVisible();
    await check(page, "details");
  });
}
