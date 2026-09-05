<div align="center">

<img src="brand/icon-512.png" width="72" alt="">

# gitms

**Your repositories, described from the code.**

Descriptions, topics and READMEs written from what your projects actually do —
reviewed by you before anything is pushed.

</div>

---

A profile full of unlabelled repositories reads as abandoned work, whatever the code is like. gitms fixes the three things a visitor actually sees: the one-line description under the repo name, the topic tags, and the README that loads when they click in.

It runs on your machine, reads your repos through your own GitHub token, and writes nothing to GitHub until you approve it, repo by repo.

## Getting started

```bash
npm install
npm run dev
```

A browser opens at `http://127.0.0.1:5123`. On first run you are asked for two credentials:

| Credential | Where to get it | What it needs |
| --- | --- | --- |
| Anthropic API key | [console.anthropic.com](https://console.anthropic.com/settings/keys) | any key — testing it is free |
| GitHub token | [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=repo&description=gitms) | classic token with the `repo` scope |

A fine-grained GitHub token works too, but needs Metadata: read, Contents: write and Administration: write. GitHub does not report a fine-grained token's permissions, so the app cannot verify them before the run and says so.

Both keys are held in memory by default and disappear when you stop the server. "Remember on this machine" writes them to `~/.gitms/credentials.json`, protected by file permissions — that is not encryption, and the app says so rather than implying otherwise. Neither key is ever written into the project folder or a log line.

## How it works

1. **Scan** — lists your repositories and reads one file tree per repo. Read-only, free.
2. **Audit** — rule-based hygiene checks produce a health score per repo and a "fix these first" list. No AI, no cost.
3. **Generate** — for each selected repo, builds an evidence bundle (file tree, parsed dependency manifests, entry-point source, recent commit messages, existing README) and asks Claude for a description, topics and a README.
4. **Review** — every proposal is editable, side by side with the exact evidence the model was given.
5. **Apply** — writes only what you approved. Dry run is on by default and prints the exact API calls without sending them.

Proposals are plain files under `.gitms-data/`, so you can open, diff or hand-edit any of them outside the app:

```
.gitms-data/
├── inventory.json          scan result
├── audit.json              hygiene report
├── manifest.json           index of proposals and their status
└── repos/<name>/
    ├── proposal.json       description, topics, confidence, reasoning
    ├── README.md           generated - edit this file directly if you prefer
    ├── README.original.md  backup, written before any overwrite
    └── evidence.json       exactly what the model was shown
```

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
- The server binds to `127.0.0.1` only, validates the request `Origin`, and requires a per-process session token on every mutating request.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | API on 5124, UI on 5123, both watching |
| `npm run build` | Builds the frontend and typechecks both halves |
| `npm start` | Production mode — one server on 5123 serving the built UI |
| `npm test` | Unit tests for the schema, hygiene rules and manifest parsers |
| `npm run brand:render` | Regenerates the raster brand assets from the SVG sources |
| `npm run qa:seed` | Writes fixture repos into `.gitms-data/` so every screen renders without a real account |
| `npm run qa:shoot` | Screenshots every screen to `.screenshots/` for visual review (drives your installed Chrome) |

## Interface

One dark theme, deliberately — this is a tool that sits next to a terminal, and a
single well-tuned surface set is worth more than two half-tuned ones. Colour is
reserved for meaning: severity, state, and one accent for the primary action on
each screen. Structure comes from hairlines and whitespace rather than shadows.

The full identity — mark, palette, type and voice — is in [`brand/BRAND.md`](brand/BRAND.md).

## Layout

```
server/    Fastify API, GitHub and Anthropic clients, analysis, pipelines
web/       React UI
shared/    Types and constants used by both — the wire contract
brand/     Logo, icons, social image, brand guidelines
scripts/   Dev tooling: fixtures, screenshots, brand rendering
tests/     vitest
```

## License

MIT.
