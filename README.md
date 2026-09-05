<div align="center">

<img src="brand/icon-512.png" width="72" alt="">

# gitms

**Your repositories, described from the code.**

Descriptions, topics and READMEs written from what your projects actually do —
reviewed by you before anything is pushed.

</div>

---

A profile full of unlabelled repositories reads as abandoned work, whatever the code is like. gitms fixes the three things a visitor actually sees: the one-line description under the repo name, the topic tags, and the README that loads when they click in.

It runs entirely in your browser, reads your repos through your own GitHub token, and writes nothing to GitHub until you approve it, repo by repo.

## Getting started

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5123`. On first run you are asked for two credentials:

| Credential        | Where to get it                                                                                    | What it needs                       |
| ----------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com/settings/keys)                               | any key — testing it is free        |
| GitHub token      | [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=gitms) | classic token with the `repo` scope |

A fine-grained GitHub token works too, but needs Metadata: read, Contents: write and Administration: write. GitHub does not report a fine-grained token's permissions, so the app cannot verify them before the run and says so.

Both keys are held in the tab by default and disappear when you close it. "Remember in this browser" keeps them in the site's local storage so they survive a reload — that is not encryption, and the app says so rather than implying otherwise. Neither key is ever sent anywhere except to Anthropic and GitHub.

## How it works

1. **Scan** — lists your repositories and reads one file tree per repo. Read-only, free.
2. **Audit** — rule-based hygiene checks produce a health score per repo and a "fix these first" list. No AI, no cost.
3. **Generate** — for each selected repo, builds an evidence bundle (file tree, parsed dependency manifests, entry-point source, recent commit messages, existing README) and asks Claude for a description, topics and a README.
4. **Review** — every proposal is editable, side by side with the exact evidence the model was given.
5. **Apply** — writes only what you approved. Dry run is on by default and prints the exact API calls without sending them.

The scan, every proposal and the evidence behind it are stored in your browser
(IndexedDB) and nowhere else. Nothing is uploaded, so Settings → Delete local
data is the whole deletion. A run happens in the tab: closing it stops the run,
though every repo finished up to that point is already saved.

## Nothing is invented

The failure mode that matters is a confident README describing features the project does not have. Three things guard against it:

- **The model only sees the evidence bundle**, and is instructed to describe nothing it cannot point at. Unresolved details become `<!-- TODO -->` placeholders listed under `unknowns`, not guesses.
- **Output is schema-validated** against GitHub's real limits before you ever see it — 350-character descriptions, 3–6 lowercase topics.
- **Every proposal carries a confidence rating** and the model's own account of what it based the description on. Repos with too little code to describe honestly are skipped and reported, not padded.

Read the generated README before approving it. That is the step that makes this safe.

## Cost

Roughly **$0.18 per repository** on `claude-opus-5`, or **$0.07** on `claude-sonnet-5` (Settings → Model). Batch mode halves either. The system prompt is identical for every repo in a run and marked as a cache breakpoint, so every request after the first reads it from cache — the run view shows the cache-read count, which should be non-zero from the second repo onward.

Mock mode runs the entire pipeline without calling the API, for free. Use it once before spending anything.

## Safety

- Only proposals you marked **approved** are ever written.
- README commits pass the current file `sha`, so a change made on GitHub since the scan causes a clean 409 rather than a silent overwrite. There is no force path.
- Existing READMEs are backed up locally before being replaced.
- Applying is idempotent — an applied repo is skipped on re-runs.
- Forks, archived and private repos are excluded by default.
- There is no gitms server. The page calls `api.anthropic.com` and `api.github.com` directly, so your keys are never transmitted to a third party, and a Content-Security-Policy `connect-src` naming only those two hosts is served alongside the app.

## Commands

| Command                | Does                                                                              |
| ---------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`          | Vite dev server on 5123                                                           |
| `npm run build`        | Typechecks, then builds the static site into `web/dist`                           |
| `npm run preview`      | Serves the built site exactly as it will be deployed                              |
| `npm test`             | Unit tests for the schema, hygiene rules and manifest parsers                     |
| `npm run brand:render` | Regenerates the raster brand assets from the SVG sources                          |
| `npm run qa:shoot`     | Loads fixture data into a browser and screenshots every screen to `.screenshots/` |

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
scripts/   Dev tooling: brand rendering
tests/     vitest
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

## License

MIT.
