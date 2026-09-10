
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
Anthropic key and set Settings → Provider to **Claude Code CLI** instead — an
optional third field in Setup takes a `claude setup-token` token. See
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
| **Claude Code CLI**              | your Claude subscription | anywhere — local `npm run dev`, or a deployed copy with your own token |

A Claude Pro or Max subscription does **not** fund API credits — they are separate products, and there is no key that bills a subscription. The CLI path exists to close that gap: a small relay endpoint at `/api/claude/*` runs `claude --print` with the same system prompt and a JSON Schema derived from the same Zod schema, and hands the result back to the browser to validate. In `npm run dev` that endpoint is a Vite plugin; on a deployed copy it's a real Vercel serverless function (see [`api/claude/`](api/claude/)) — the browser code is identical either way.

Spawning a process needs a server, so this is the one part of gitms that isn't a direct browser-to-API call. Locally, the endpoint shells out to whatever [Claude Code CLI](https://claude.com/claude-code) is already on this machine and logged in (`claude` once in a terminal); gitms looks on `PATH` first, then the usual install locations, then the VS Code extension's bundled copy, then falls back to the copy bundled as an npm dependency. `GITMS_CLAUDE_BIN` overrides all of that with a specific binary.

On a deployed copy there's no ambient login, so each visitor pastes their **own** token in Setup — run `claude setup-token` on your own machine (after `claude login`) and paste the result. It authenticates against your own subscription, never the site owner's, and the relay never stores it: it rides along in the request that spawns one `claude` process and is discarded when that call returns.

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
- The Anthropic key and GitHub token go straight to `api.anthropic.com` and `api.github.com` — a Content-Security-Policy `connect-src` naming only those two hosts (plus `'self'`) is served alongside the app. The one exception is the Claude Code CLI provider: spawning a process needs a server, so a pasted token travels one same-origin hop to `/api/claude/*` and is used for a single CLI invocation, never stored.

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
core/      GitHub and Anthropic clients, analysis, prompts, pricing, the Claude Code CLI runner
web/       React UI, plus the browser-side store, jobs and pipelines
shared/    Types and constants used throughout
brand/     Logo, icons, social image, brand guidelines
scripts/   Dev tooling: brand rendering, the Vite-side Claude Code bridge plugin
api/       Vercel serverless functions - the deployed copy's Claude Code bridge
tests/     Vitest
```

## Deploying

The app is mostly a static bundle — the Anthropic and GitHub paths need no
backend at all, so any static host works for those. The Claude Code CLI
provider is the exception: it needs somewhere to spawn a process, which today
means Vercel. [`vercel.json`](vercel.json) sets the build (`npm run build` →
`web/dist`), the `api/claude/*` functions (300s `maxDuration`, with the CLI's
native binary explicitly included via `includeFiles`), SPA rewrite and
security headers. [`netlify.toml`](netlify.toml) covers the static parts the
same way, but has no equivalent functions setup yet — a Netlify deployment
will show the CLI provider as unavailable, same as any other deployment
without it.

```bash
vercel deploy --prod        # or: connect the repo at vercel.com
```

No environment variables are needed — deliberately. Each visitor supplies
their own Anthropic key, GitHub token, and (optionally) Claude Code token, all
of which stay in their browser except for the one same-origin hop the Claude
Code token takes per generation call, so a deployment holds no secrets of its
own and cannot spend anyone else's credit or subscription.

Two things worth knowing before deploying your own copy: `@anthropic-ai/claude-code`
requires Node ≥22 (set via `engines.node` in `package.json` — make sure your
Vercel project's Node version matches), and the 300-second function timeout
needs [Fluid Compute](https://vercel.com/docs/functions/fluid-compute) enabled
on the project (on by default for new projects; a Hobby plan gets up to 300s
with it, same ceiling as Pro's default).

A deployed copy is live at [gitms-sage.vercel.app](https://gitms-sage.vercel.app).

## License

MIT.
