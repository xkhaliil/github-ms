# Brand assets

Generated from `mark.svg` by `npm run brand:render` — do not edit the PNGs by hand.

| File | Size | Use |
| --- | --- | --- |
| `mark.svg` | vector | source of truth for every raster below |
| `mark-mono.svg` | vector | single-colour variant |
| `lockup.svg` | vector | mark + wordmark, dark backgrounds |
| `lockup-light.svg` | vector | mark + wordmark, light backgrounds |
| `favicon.svg` | vector | shipped at `web/public/favicon.svg` |
| `icon-32.png` | 32×32 | legacy favicon fallback |
| `icon-180.png` | 180×180 | apple-touch-icon |
| `icon-512.png` | 512×512 | app listings, README hero |
| `og-image.png` | 1200×630 | link previews on social and chat |

No `.ico` is generated: every browser gitms supports reads the SVG favicon, and
an ICO would be a second file to keep in sync for no gain.

See `BRAND.md` for the rules that govern all of it.
