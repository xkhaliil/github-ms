
<div align="center">

<img src="brand/icon-512.png" width="72" alt="">

# gitms

**Your repositories, described from the code.**

![TypeScript](https://img.shields.io/badge/TypeScript-83%25-3178c6)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

Descriptions, topics and READMEs written from what your projects actually do —
reviewed by you before anything is pushed.

</div>

---

A profile full of unlabelled repositories reads as abandoned work, whatever the code is like. gitms fixes the three things a visitor actually sees: the one-line description under the repo name, the topic tags, and the README that loads when they click in.

It runs entirely in your browser, reads your repos through your own GitHub token, and writes nothing to GitHub until you approve it, repo by repo.

## What it does

- **Scans** your GitHub account via Octokit, pulling one file tree per repo (read-only, free).
- **Audits** each repo with rule-based hygiene checks — missing description, topics, README, license, staleness — into a 0–100 health score, no AI involved.
- **Generates** a proposal per selected repo: builds an evidence bundle (file tree, parsed dependency manifests, entry-point source, recent commit messages, existing README) and asks Claude for a description, topics and a README, each schema-validated against GitHub's real limits (350-character descriptions, 3–6 lowercase topics).
- **Reviews**, side by side with the exact evidence the model saw — every proposal is editable and carries a confidence rating plus the model's own account of what it based the description on; unresolved details become `<!-- TODO -->` placeholders instead of guesses.
- **Applies** only what you approved, with dry run on by default (prints the exact API calls without sending them). README commits pass the current file `sha`, so a since-scan change causes a clean 409 rather than a silent overwrite.

The scan, every proposal and its evidence are stored in the browser (IndexedDB) only — nothing is uploaded, and closing the tab stops a run while keeping everything finished so far.

## Tech stack

- **UI**: React, Vite, Tailwind CSS (`@tailwindcss/vite`)
- **GitHub**: `@octokit/rest` with `@octokit/plugin-retry` and `@octokit/plugin-throttling`
- **AI**: `@anthropic-ai/sdk`, with proposal shapes validated by `zod`
- **README rendering**: `marked` + `dompurify`
- **Language**: TypeScript throughout (`core/`, `web/`, `shared/`)
- **Testing**: Vitest, Playwright (used by the `qa:shoot` screenshot script)

## Getting started

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5123`. On first run you are asked for two credentials:

| Credential        | Where to get it                                                                                    | What it needs                       |
| ----------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com/settings/keys)                               | any key — testing it is free        |
| GitHub token      | [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=gitms) | classic token with the `repo` scope |

If you have a Claude subscription and would rather not buy API credits, skip the
Anthropic key and set Settings → Provider to **Claude Code CLI** — see
[Providers](#providers) below.

A fine-grained GitHub token works too, but needs Metadata: read, Contents: write and Administration: write. GitHub does not report a fine-grained token's permissions, so the app cannot verify them before the run and says so.

Both keys are held in the tab by default and disappear when you close it. "Remember in this browser" keeps them in the site's local storage so they survive a reload — that is not encryption, and the app says so rather than implying otherwise. Neither key is ever sent anywhere except to Anthropic and GitHub.

## Nothing is invented

The failure mode that matters is a confident README describing features the project does not have. Three things guard against it:

- **The model only sees the evidence bundle**, and is instructed to describe nothing it cannot point at. Unresolved details become `<!-- TODO -->` placeholders listed under `unknowns`, not guesses.
- **Output is schema-validated** against GitHub's real limits before you ever see it — 350-character descriptions, 3–6 lowercase topics.
- **Every proposal carries a confidence rating** and the model's own account of what it based the description on. Repos with too little code to describe honestly are skipped and reported, not padded.

Read the generated README before approving it. That is the step that makes this safe.

## Providers

Generation can get its model from either of two places, chosen in Settings → Provider. Everything else — the prompt, the schema, the evidence bundle, the review step — is identical, so a proposal is built the same way either way.

| Provider                        | Billed to               | Works where               |
| -------------------------------- | ------------------------ | -------------------------- |
| **Anthropic API key** (default) | API credits, per token   | anywhere, including a deployed copy |
| **Claude Code CLI**              | your Claude subscription | local `npm run dev` only  |

A Claude Pro or Max subscription does **not** fund API credits — they are separate products, and there is no key that bills a subscription. The CLI path exists to close that gap: the dev server exposes a small local endpoint that runs `claude --print` with the same system prompt and a JSON Schema derived from the same Zod schema, and hands the result back to the browser to validate.

Because it spawns a process, it is local-only by nature — a deployed page cannot run a binary. The Settings screen probes for it and says so instead of offering an option that would fail on the first repo. It needs the [Claude Code CLI](https://claude.com/claude-code) installed and signed in (`claude` once in a terminal); gitms looks on `PATH` first, then in the usual install locations, then in the VS Code extension's bundled copy. Set `GITMS_CLAUDE_BIN` to point at a specific binary.

The tradeoff is overhead: each repo is a fresh CLI invocation carrying Claude Code's own harness, so it spends more tokens per repo against your subscription's limits than the API path spends against credits. Consecutive repos in a run reuse the prompt cache.

## Cost

On the API provider, roughly **$0.18 per repository** on `claude-opus-5`, or **$0.07** on `claude-sonnet-5` (Settings → Model). Batch mode halves either. The system prompt is identical for every repo in a run and marked as a cache breakpoint, so every request after the first reads it from cache — the run view shows the cache-read count, which should be non-zero from the second repo onward.

On the Claude Code provider nothing is charged to the API account, so the run view labels the dollar figure as what the run *would* have cost rather than as money spent.

Mock mode runs the entire pipeline without calling anything, for free. Use it once before spending anything.

## Safety

- Only proposals you marked **approved** are ever written.
- README commits pass the current file `sha`, so a change made on GitHub since the scan causes a clean 409 rather than a silent overwrite. There is no force path.
- Existing READMEs are backed up locally before being replaced.
- Applying is idempotent — an applied repo is skipped on re-runs.
- Forks, archived and private repos are excluded by default.
- There is no gitms server. The page calls `api.anthropic.com` and `api.github.com` directly, so your keys are never transmitted to a third party, and a Content-Security-Policy `connect-src` naming only those two hosts is served alongside the app. The Claude Code bridge is same-origin and exists only in the dev server, so it neither widens that list nor ships in `web/dist`.

## Commands

| Command                 | Does                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `npm run dev`            | Vite dev server on 5123                                                            |
| `npm run build`          | Typechecks, then builds the static site into `web/dist`                            |
| `npm run preview`        | Serves the built site exactly as it will be deployed                               |
| `npm test`               | Unit tests for the schema, hygiene rules and manifest parsers (Vitest)             |
| `npm run brand:render`   | Regenerates the raster brand assets from the SVG sources                           |
| `npm run qa:shoot`       | Loads fixture data into a browser and screenshots every screen to `.screenshots/`  |
| `npm run qa:seed`        | Seeds local fixture data used by `qa:shoot`                                        |

<!-- TODO: add a screenshot of the Run/Settings/Setup screens -->

## Interface

One dark theme, deliberately — this is a tool that sits next to a terminal, and a
single well-tuned surface set is worth more than two half-tuned ones. Colour is
reserved for meaning: severity, state, and one accent for the primary action on
each screen. Structure comes from hairlines and whitespace rather than shadows.

The full identity — mark, palette, type and voice — is in [`brand/BRAND.md`](brand/BRAND.md).

## Layout

```
core/      GitHub and Anthropic clients, analysis, prompts, pricing
web/       React UI, plus the browser-side store, jobs and pipelines
shared/    Types and constants used throughout
brand/     Logo, icons, social image, brand guidelines
scripts/   Dev tooling: brand rendering, the dev-only Claude Code bridge
tests/     Vitest
```

## Deploying

The app is a static bundle with no backend, so any static host works. Both
[`vercel.json`](vercel.json) and [`netlify.toml`](netlify.toml) are checked in
and set the same build (`npm run build` → `web/dist`), SPA rewrite and security
headers.

```bash
vercel deploy --prod        # or: connect the repo at vercel.com
netlify deploy --prod       # or: connect the repo at netlify.com
```

No environment variables are needed — deliberately. Each visitor supplies their
own Anthropic key and GitHub token, which stay in their browser, so a deployment
holds no secrets and cannot spend anyone else's credit.

A deployed copy is live at [gitms-sage.vercel.app](https://gitms-sage.vercel.app).

## License

MIT.
