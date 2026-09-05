/**
 * Derives the Artifact-format copy of the landing page from site/index.html.
 *
 * The Artifact host supplies its own <!doctype>/<head>/<body> skeleton, so the
 * published copy must be the page content alone. Generating it keeps one
 * canonical source rather than two files drifting apart.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const src = path.resolve(import.meta.dirname, "..", "site", "index.html");
const outDir = process.argv[2];
if (!outDir) throw new Error("usage: node scripts/make-artifact.mjs <output-dir>");

const html = await readFile(src, "utf8");

const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? "";
const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? "";

// Keep the title, the font link and the styles; drop the meta tags the host owns
// and the relative asset paths that only resolve in the repo.
const keep = [
  /<title>[\s\S]*?<\/title>/,
  /<link rel="preconnect"[^>]*>/g,
  /<link rel="stylesheet" href="https:\/\/fonts\.googleapis[^>]*>/,
  /<style>[\s\S]*?<\/style>/,
];

const parts = keep.flatMap((re) => head.match(re) ?? []);

await mkdir(outDir, { recursive: true });
const out = path.join(outDir, "gitms-landing.html");
await writeFile(out, `${parts.join("\n")}\n${body.trim()}\n`, "utf8");
console.log("wrote", out);
