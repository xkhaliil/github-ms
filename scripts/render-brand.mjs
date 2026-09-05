/**
 * Renders the raster brand assets from the SVG sources, so the PNGs can never
 * drift from the vectors they came from. Regenerate after any change to
 * brand/mark.svg.
 *
 * Uses the locally installed Chrome - Playwright's own browser download is
 * blocked on this machine.
 */
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BRAND = path.resolve(import.meta.dirname, "..", "brand");
const mark = await readFile(path.join(BRAND, "mark.svg"), "utf8");

const browser = await chromium.launch({ channel: "chrome" });

/* --------------------------------------------------------- app icons --- */

const ICONS = [
  { name: "icon-32.png", size: 32 },
  { name: "icon-180.png", size: 180 }, // apple-touch-icon
  { name: "icon-512.png", size: 512 }, // stores, docs, README hero
];

for (const { name, size } of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0;background:transparent">
       <div style="width:${size}px;height:${size}px">${mark.replace(
         /width="32" height="32"/,
         `width="${size}" height="${size}"`,
       )}</div>
     </body>`,
  );
  await page.screenshot({ path: path.join(BRAND, name), omitBackground: true });
  await page.close();
  console.log("rendered", name);
}

/* -------------------------------------------------------- social card --- */

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const og = `<body style="margin:0">
  <div style="
    width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:#08080A;
    display:flex;flex-direction:column;justify-content:center;
    padding:0 96px;box-sizing:border-box;
    font-family:ui-sans-serif,-apple-system,'Segoe UI',system-ui,sans-serif;
    color:#F2F2F4;position:relative;overflow:hidden;">

    <!-- A single soft wash of Signal, bottom-right, so the card is not a flat slab. -->
    <div style="position:absolute;right:-160px;bottom:-220px;width:620px;height:620px;
                border-radius:50%;background:#6D8FFF;opacity:0.10;filter:blur(40px)"></div>

    <div style="display:flex;align-items:center;gap:18px;margin-bottom:48px">
      ${mark.replace(/width="32" height="32"/, 'width="56" height="56"')}
      <span style="font-size:44px;font-weight:600;letter-spacing:-0.03em">
        <span style="color:#F2F2F4">git</span><span style="color:#6D8FFF">ms</span>
      </span>
    </div>

    <h1 style="margin:0;font-size:62px;line-height:1.1;font-weight:600;letter-spacing:-0.028em;max-width:900px">
      Your repositories,<br/>described from the code
    </h1>

    <p style="margin:28px 0 0;font-size:26px;line-height:1.5;color:#9A9AA5;max-width:820px">
      Descriptions, topics and READMEs written from what your projects actually do —
      reviewed by you before anything is pushed.
    </p>

    <div style="margin-top:52px;display:flex;gap:14px">
      ${["Nothing invented", "Local and private", "You approve every word"]
        .map(
          (chip) => `<span style="
            border:1px solid #212127;background:#0E0E11;color:#9A9AA5;
            border-radius:999px;padding:10px 20px;font-size:20px">${chip}</span>`,
        )
        .join("")}
    </div>
  </div>
</body>`;

const page = await browser.newPage({ viewport: { width: OG_WIDTH, height: OG_HEIGHT } });
await page.setContent(og);
await page.screenshot({ path: path.join(BRAND, "og-image.png") });
console.log("rendered og-image.png");

await browser.close();

/* --------------------------------------------------------- favicon.ico --- */

// Modern browsers take the SVG favicon; this note keeps the ICO question
// answered rather than silently unhandled.
await writeFile(
  path.join(BRAND, "README.md"),
  `# Brand assets

Generated from \`mark.svg\` by \`npm run brand:render\` — do not edit the PNGs by hand.

| File | Size | Use |
| --- | --- | --- |
| \`mark.svg\` | vector | source of truth for every raster below |
| \`mark-mono.svg\` | vector | single-colour variant |
| \`lockup.svg\` | vector | mark + wordmark, dark backgrounds |
| \`lockup-light.svg\` | vector | mark + wordmark, light backgrounds |
| \`favicon.svg\` | vector | shipped at \`web/public/favicon.svg\` |
| \`icon-32.png\` | 32×32 | legacy favicon fallback |
| \`icon-180.png\` | 180×180 | apple-touch-icon |
| \`icon-512.png\` | 512×512 | app listings, README hero |
| \`og-image.png\` | 1200×630 | link previews on social and chat |

No \`.ico\` is generated: every browser gitms supports reads the SVG favicon, and
an ICO would be a second file to keep in sync for no gain.

See \`BRAND.md\` for the rules that govern all of it.
`,
  "utf8",
);
console.log("wrote brand/README.md");
