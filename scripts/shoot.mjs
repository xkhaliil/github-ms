/**
 * Visual QA: renders every screen in a real browser and writes PNGs to
 * .screenshots/ so the design can be reviewed rather than assumed.
 *
 * Development tool only. Uses the locally installed Chrome because Playwright's
 * own browser download is blocked on this machine.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "..", ".screenshots");
const BASE = "http://127.0.0.1:5123";

await mkdir(OUT, { recursive: true });

/*
 * Placeholder credentials, memory-only, so the authenticated screens render.
 * They are re-seeded on every run because the dev server restarts on file
 * changes and in-memory keys correctly do not survive that.
 */
const token = (await (await fetch(`${BASE}/api/session`)).json()).token;
await fetch(`${BASE}/api/auth/save`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-gitms-session": token },
  body: JSON.stringify({
    anthropicKey: "sk-ant-fixture-key-0000",
    githubToken: "ghp_fixture_token_0000",
    remember: false,
  }),
});

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--force-color-profile=srgb"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 940 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

const shots = [
  ["setup", "#/setup"],
  ["dashboard", "#/dashboard"],
  ["repo-detail", "#/repo/raycast-timezones"],
  ["runs", "#/run"],
  ["settings", "#/settings"],
];

for (const [name, hash] of shots) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log("shot", name);
}

// Narrow viewport - the table and the two-column detail view are the parts most
// likely to break, so check them explicitly rather than trusting the classes.
await page.setViewportSize({ width: 860, height: 900 });
for (const [name, hash] of [
  ["dashboard-narrow", "#/dashboard"],
  ["repo-detail-narrow", "#/repo/raycast-timezones"],
]) {
  await page.goto(`${BASE}/${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log("shot", name);
}

await browser.close();
console.log("screenshots in", OUT);
