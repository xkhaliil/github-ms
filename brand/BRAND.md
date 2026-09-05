# gitms — brand

## The name

**gitms** — *git manuscripts*. It writes the documents your repositories are missing.

Always lowercase, including at the start of a sentence. Never `GitMS`, `Gitms`, or `git-ms`.
Pronounced "git-em-ess".

## What it is, in one line

> Descriptions, topics and READMEs written from your actual code — reviewed by you before anything is pushed.

## The idea the whole brand hangs on

The product's central promise is that **it does not invent things**. It reads real code, cites its evidence, admits what it could not determine, and refuses to describe a repo that has nothing in it.

A brand that oversells a product built on not overselling is self-defeating. So the same rule governs the marketing: **every claim must be one the product can evidence.** If we cannot show it, we do not say it.

## Voice

Plain, specific, unhurried. Write like a careful colleague explaining what a tool does, not like a launch announcement.

**Do**
- Lead with the concrete noun: "Descriptions and READMEs, written from your code."
- Use real numbers with their source: "≈$0.18 per repository on Claude Opus 5."
- Name the limits out loud: "Testing a key is free." "Nothing is written until you approve it."
- Prefer the shorter true sentence to the longer impressive one.

**Never**
- `powerful` · `seamless` · `effortless` · `revolutionary` · `magic` · `10x` · `game-changing` · `next-generation` · `supercharge` · `unlock`
- Invented metrics, fake user counts, testimonials that do not exist, or badges for pipelines that were never set up.
- Exclamation marks in product copy.

The banned-word list is the same instinct the generator applies to your READMEs. That symmetry is the point.

## Logo

| Asset | File | Use |
| --- | --- | --- |
| Mark | `mark.svg` | Favicon, app icon, avatars, anywhere under 32px |
| Mark, single colour | `mark-mono.svg` | Stamps, embossing, one-colour print — inherits `currentColor` |
| Lockup, dark bg | `lockup.svg` | Headers, README hero, social |
| Lockup, light bg | `lockup-light.svg` | Light documents and print |

**What it is:** a commit node that produced documentation. The dot is the commit; the three bars are the headline, description and README it wrote. It is deliberately readable at 16px — no gradients, no thin strokes, four shapes.

**Rules**
- Clear space on every side equals the mark's corner radius (25% of its width).
- Minimum size: 16px for the mark, 96px wide for the lockup.
- Never recolour the mark's bars, rotate it, add a shadow, outline it, or place it on a busy photograph.
- Never re-space the lockup — use the SVG, do not rebuild it from the mark plus type.

**Wordmark:** `git` in ink, `ms` in Signal. The colour split at the syllable boundary is what makes the name parse on first read; keep it.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| Signal | `#6D8FFF` | The one accent. Primary action, the wordmark's `ms`, the mark's tile. Use it sparingly — one primary action per screen. |
| Signal, on light | `#3D63D8` | Substitute on light backgrounds, where `#6D8FFF` fails contrast |
| Ink | `#08080A` | Page background, and the knockout inside the mark |
| Surface | `#0E0E11` | Panels |
| Raised | `#141418` | Controls, hover |
| Line | `#212127` | Hairlines — these carry the structure, not shadows |
| Paper | `#F2F2F4` | Primary text |
| Muted | `#9A9AA5` | Secondary text |
| Subtle | `#6A6A75` | Tertiary text, metadata |

**Semantic — meaning only, never decoration**

| Token | Hex | Means |
| --- | --- | --- |
| Good | `#3ECF8E` | Healthy, passed, approved |
| Warn | `#E5A03A` | Needs review, medium confidence |
| Bad | `#F0616D` | Missing, failed, low confidence |

The interface is a single dark theme. That is a decision, not an omission: gitms sits next to a terminal, and one well-tuned surface set beats two half-tuned ones.

## Typography

System stack — no webfont, no network request, no flash of unstyled text:

```
ui-sans-serif, -apple-system, "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif
```

Monospace for anything a user could paste — file paths, dependencies, API keys, topics:

```
ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace
```

**Rules**
- Headings set at `-0.021em` tracking; body at `-0.006em`. Tighter headings at small sizes are the single strongest signal of typographic care.
- All figures in tables and stats are tabular so they do not jitter as they update.
- Sentence case everywhere. No ALL-CAPS labels.

## Applying it

- **Favicon** — `web/public/favicon.svg`, wired in `web/index.html`.
- **In-app** — `web/src/components/Logo.tsx` exports `Mark`, `Wordmark` and `Lockup`; they read the CSS colour tokens, so they stay correct if the palette moves.
- **Design tokens** — `web/src/index.css` under `@theme`. That file is the source of truth; this document explains it.
- **Social image** — `brand/og-image.png`, 1200×630.
