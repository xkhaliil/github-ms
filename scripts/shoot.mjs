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
import { fixtures } from "./seed-fixtures.mjs";

const OUT = path.resolve(import.meta.dirname, "..", ".screenshots");
const BASE = "http://127.0.0.1:5123";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--force-color-profile=srgb"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 940 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

/*
 * The app keeps its state in the browser, so the fixtures go in the same way the
 * app writes them: placeholder credentials into sessionStorage, scan and
 * proposals into IndexedDB. Nothing here touches a real account.
 */
await page.goto(BASE, { waitUntil: "networkidle" });
await page.evaluate(async (data) => {
  sessionStorage.setItem("gitms.anthropicKey", "sk-ant-fixture-key-0000");
  sessionStorage.setItem("gitms.githubToken", "ghp_fixture_token_0000");
  sessionStorage.setItem(
    "gitms.githubIdentity",
    JSON.stringify({
      login: "wassim",
      name: "Wassim",
      avatarUrl: "",
      publicRepos: data.inventory.repos.length,
      scopes: ["repo"],
      fineGrained: false,
    }),
  );

  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("gitms", 1);
    r.onupgradeneeded = () => {
      for (const s of ["kv", "proposals", "evidence"]) {
        if (!r.result.objectStoreNames.contains(s))
          r.result.createObjectStore(s);
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const put = (store, key, value) =>
    new Promise((res, rej) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });

  await put("kv", "inventory", data.inventory);
  await put("kv", "audit", data.audit);
  for (const p of data.proposals) await put("proposals", p.name, p);
  for (const [name, e] of Object.entries(data.evidence))
    await put("evidence", name, e);
}, fixtures);

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
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: true,
  });
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
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: true,
  });
  console.log("shot", name);
}

await browser.close();
console.log("screenshots in", OUT);
