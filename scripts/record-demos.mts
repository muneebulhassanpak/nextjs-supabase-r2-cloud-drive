/**
 * Records the short clips on the landing page (public/demos): a browser drives the real app,
 * with a drawn cursor, and ffmpeg turns each recording into a small looping MP4 and WebM plus a
 * poster frame.
 *
 *   pnpm build && pnpm start          # the app on http://localhost:3000, on the local stack
 *   pnpm record:demos                 # needs ffmpeg
 *
 * Every clip is recorded twice, in the light and the dark theme (`<name>.mp4`, `<name>-dark.mp4`),
 * so the page can show the one that matches. Local only: each theme gets a fresh account
 * (showcase+<time>@demo.dev) with the sample files, so every recording starts from the same state,
 * and it refuses any address but localhost.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser, type Locator, type Page } from "@playwright/test";

const BASE = process.env.DEMO_URL ?? "http://localhost:3000";
if (new URL(BASE).hostname !== "localhost") throw new Error("Record against the local app only.");

const OUT = join(import.meta.dirname, "..", "public", "demos");
const SIZE = { width: 1280, height: 800 };
const password = "showcase-pass-123";

type Theme = "light" | "dark";

// A cursor the recording can see (the real one isn't captured), which dips when it clicks.
const CURSOR = `
addEventListener("DOMContentLoaded", () => {
  const cursor = document.createElement("div");
  cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647",
    pointerEvents: "none", transform: "translate(-100px, -100px)" });
  cursor.firstChild.style.transition = "transform 120ms ease-out";
  cursor.firstChild.style.transformOrigin = "4px 2px";
  document.documentElement.append(cursor);
  addEventListener("mousemove", (event) => {
    cursor.style.transform = "translate(" + (event.clientX - 4) + "px, " + (event.clientY - 2) + "px)";
  }, true);
  addEventListener("mousedown", () => { cursor.firstChild.style.transform = "scale(0.8)"; }, true);
  addEventListener("mouseup", () => { cursor.firstChild.style.transform = ""; }, true);
});`;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Moves the drawn cursor like a hand would: eased, over a third of a second or so. */
class Pointer {
  private x = SIZE.width / 2;
  private y = SIZE.height / 2;
  private readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  async to(target: Locator) {
    await target.waitFor({ state: "visible" });
    const box = await target.boundingBox();
    if (!box) throw new Error("Nothing to point at.");
    const [fromX, fromY] = [this.x, this.y];
    this.x = box.x + box.width / 2;
    this.y = box.y + box.height / 2;
    const steps = 24;
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const eased = 1 - (1 - t) ** 3;
      await this.page.mouse.move(
        fromX + (this.x - fromX) * eased,
        fromY + (this.y - fromY) * eased,
      );
      await pause(14);
    }
    await pause(180);
  }

  async click(target: Locator, { double = false } = {}) {
    await this.to(target);
    await this.page.mouse.click(this.x, this.y, { clickCount: double ? 2 : 1, delay: 70 });
    await pause(250);
  }
}

/** A fresh account with the sample files and a few folders; returns its signed-in state. */
async function prepareAccount(browser: Browser, theme: Theme): Promise<string> {
  const email = `showcase+${theme}-${String(Date.now())}@demo.dev`;
  execFileSync("pnpm", ["seed:files"], {
    env: { ...process.env, SEED_EMAIL: email, SEED_PASSWORD: password, SEED_NAME: "Sam Rivera" },
    stdio: "inherit",
  });
  const context = await browser.newContext({ viewport: SIZE });
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/drive");
  // A few folders, so My Drive looks lived in.
  for (const name of ["Client work", "Invoices", "Photos"]) {
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("menuitem", { name: "New folder" }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("row", { name, exact: true }).first().waitFor();
  }
  const state = join(mkdtempSync(join(tmpdir(), "lockerly-demo-")), "state.json");
  await context.storageState({ path: state });
  await context.close();
  return state;
}

interface Scene {
  /** How My Drive should look when the clip starts: set before recording begins. */
  view: "list" | "grid";
  play: (page: Page, pointer: Pointer) => Promise<void>;
}

async function record(browser: Browser, state: string, theme: Theme, name: string, scene: Scene) {
  const videos = mkdtempSync(join(tmpdir(), `lockerly-${name}-`));
  const context = await browser.newContext({
    viewport: SIZE,
    storageState: state,
    colorScheme: theme,
    recordVideo: { dir: videos, size: SIZE },
  });
  await context.addInitScript(CURSOR);
  const opened = Date.now();
  const page = await context.newPage();
  await page.goto(`${BASE}/drive`);
  await page.getByRole("heading", { name: "My Drive" }).waitFor();
  const other = scene.view === "grid" ? "Show as grid" : "Show as list";
  if (await page.getByRole("button", { name: other }).isVisible()) {
    await page.getByRole("button", { name: other }).click();
  }
  await pause(800);
  // Everything before this point (a blank tab, the first paint) is cut from the clip.
  const start = (Date.now() - opened) / 1000;
  await scene.play(page, new Pointer(page));
  await pause(800);
  const video = page.video();
  await context.close();
  const raw = await video?.path();
  if (!raw) throw new Error(`No recording for ${name}.`);
  encode(raw, theme === "dark" ? `${name}-dark` : name, start);
  rmSync(videos, { recursive: true, force: true });
}

function encode(raw: string, name: string, start: number) {
  const out = (extension: string) => join(OUT, `${name}.${extension}`);
  const trim = ["-y", "-loglevel", "error", "-ss", start.toFixed(2), "-i", raw, "-an"];
  execFileSync("ffmpeg", [
    ...trim,
    ...["-vf", "fps=30", "-c:v", "libx264", "-preset", "slow", "-crf", "23"],
    ...["-pix_fmt", "yuv420p", "-movflags", "+faststart", out("mp4")],
  ]);
  execFileSync("ffmpeg", [
    ...trim,
    ...["-vf", "fps=30", "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1"],
    out("webm"),
  ]);
  // The first frame, so the poster and the start of the loop match.
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    out("mp4"),
    "-frames:v",
    "1",
    "-q:v",
    "3",
    out("jpg"),
  ]);
  console.warn(`Recorded ${name}`);
}

const scenes: Record<string, Scene> = {
  // Several files at once, with progress, landing in the list.
  upload: {
    view: "list",
    async play(page, pointer) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 20,
        downloadThroughput: -1,
        uploadThroughput: 2 * 1024 * 1024,
      });
      const files = [
        { name: "Launch teaser.mp4", mimeType: "video/mp4", size: 4 },
        { name: "Brand guidelines.pdf", mimeType: "application/pdf", size: 2 },
        { name: "Team offsite.jpg", mimeType: "image/jpeg", size: 3 },
        {
          name: "Budget 2027.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          size: 1,
        },
      ];
      await pointer.click(page.getByRole("button", { name: "New", exact: true }));
      const chooser = page.waitForEvent("filechooser");
      await pointer.click(page.getByRole("menuitem", { name: "File upload" }));
      await (
        await chooser
      ).setFiles(
        files.map(({ name, mimeType, size }) => ({
          name,
          mimeType,
          buffer: randomBytes(size * 1024 * 1024),
        })),
      );
      await page
        .getByRole("region", { name: "Uploads" })
        .getByRole("heading", { name: "4 uploads complete" })
        .waitFor({ timeout: 30_000 });
      await pause(600);
      await pointer.to(page.getByRole("row", { name: "Launch teaser.mp4", exact: true }));
      await pause(1200);
    },
  },

  // A new folder, into it and back out by the breadcrumbs, then the grid.
  organise: {
    view: "list",
    async play(page, pointer) {
      await pointer.click(page.getByRole("button", { name: "New", exact: true }));
      await pointer.click(page.getByRole("menuitem", { name: "New folder" }));
      await page.getByLabel("Name", { exact: true }).selectText();
      await page.keyboard.type("Product launch", { delay: 60 });
      await pointer.click(page.getByRole("button", { name: "Create" }));
      const folder = page.getByRole("row", { name: "Product launch", exact: true }).first();
      await pause(700);
      await pointer.click(folder, { double: true });
      await page.getByRole("heading", { name: "Product launch" }).waitFor();
      await pause(1000);
      await pointer.click(
        page
          .getByRole("navigation", { name: "Breadcrumb" })
          .getByRole("link", { name: "My Drive" }),
      );
      await page.getByRole("heading", { name: "My Drive" }).waitFor();
      await pause(600);
      await pointer.click(page.getByRole("button", { name: "Show as grid" }));
      await pause(1800);
    },
  },

  // Thumbnails, then the viewer: a photo, zoomed, then text and code.
  preview: {
    view: "grid",
    async play(page, pointer) {
      await pointer.click(page.getByRole("row", { name: "Samples", exact: true }).first(), {
        double: true,
      });
      await page.getByRole("heading", { name: "Samples" }).waitFor();
      await pause(1400);
      await pointer.click(page.getByRole("row", { name: "meadow.webp", exact: true }).first(), {
        double: true,
      });
      await page.getByRole("dialog", { name: "meadow.webp" }).waitFor();
      await pause(1500);
      await pointer.click(page.getByRole("button", { name: "Next: mountains.jpg" }));
      await pause(1000);
      await pointer.click(page.getByRole("button", { name: "Actual size" }));
      await pause(1300);
      await pointer.click(page.getByRole("button", { name: "Fit to screen" }));
      await pause(600);
      await pointer.click(page.getByRole("button", { name: "Next: notes.md" }));
      await pause(1500);
      await pointer.click(page.getByRole("button", { name: "Next: page.html" }));
      await pause(1700);
      await page.keyboard.press("Escape");
      await pause(900);
    },
  },
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const only = process.argv.slice(2);
  for (const theme of ["light", "dark"] as const) {
    const state = await prepareAccount(browser, theme);
    for (const [name, scene] of Object.entries(scenes)) {
      if (only.length === 0 || only.includes(name)) {
        await record(browser, state, theme, name, scene);
      }
    }
  }
} finally {
  await browser.close();
}
