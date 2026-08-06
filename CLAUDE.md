# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Roc's Blog — a Chinese-language technical blog powered by [Zola](https://www.getzola.org/) (v0.23+), deployed to Cloudflare Pages. The site uses a custom "boring" theme with Tailwind CSS, vanilla JS, and the `editorial` warm-toned color palette.

- **Live site**: `https://scp.net.cn`
- **Theme**: `boring/` (a Zola theme forked from [ssiyad/boring](https://github.com/ssiyad/boring))
- **Content**: 77+ long-form technical articles in Chinese, organized under `boring/content/blog/`

## Common commands

All commands run from the `boring/` directory:

```bash
# Development server (hot-reload, port 1111)
cd boring && zola serve

# Or use the start script (kills old zola, starts in background)
cd boring && bash start.sh

# Build CSS (PostCSS: imports → Tailwind → autoprefixer → cssnano)
cd boring && yarn build        # full: build-related-index + postcss
cd boring && yarn watch        # postcss --watch

# Build static site
cd boring && bash build.sh     # zola build -o roc-blog + optional encrypt step

# Run all tests (Node.js native test runner)
cd boring && yarn test

# Run only site-output tests
cd boring && yarn test:site

# Audit article frontmatter
cd boring && yarn audit
```

## Architecture

### Content model

Articles live as flat `.md` files in `boring/content/blog/`, with some organized into Zola subsections (subdirectories like `flink/`, `spring/`, `redis/`, etc. — each with its own `_index.md`). The blog root `_index.md` enables pagination (20 posts/page) and sorting by `update_date`.

Article frontmatter uses **TOML** (`+++` delimiters), not YAML:

```toml
+++
title = "文章标题"
date = 2023-01-01
[taxonomies]
tags = ["Kafka", "分布式"]
[extra]
update_date = 2025-01-01
# Optional encryption:
password = "secret"
password_hint = "提示文案"
remember_days = 7
+++
```

### Theme structure (`boring/`)

| Path | Purpose |
|---|---|
| `templates/base.html` | Root layout: `<head>` with theme init (FOUC prevention), nav, footer. Loads Fuse.js, `search.js`, `main.js` |
| `templates/index.html` | Homepage — latest 10 posts |
| `templates/section.html` | Category/section listing with pagination |
| `templates/page.html` | Single article: OG meta, TOC (mobile + desktop sidebar), progress bar, prev/next, related posts. Loads `reading.js` |
| `templates/components.html` | Reusable Tera v2 `{% component %}` blocks: `article_row`, `header` (breadcrumbs), `prev_next`, `related` |
| `css/style.css` | Main stylesheet with CSS custom properties (`--color-*`) + Tailwind `@apply` utilities |
| `static/js/main.js` | Dark mode toggle, dropdown nav, back-to-top |
| `static/js/search.js` | Fuse.js full-text search (Cmd+K overlay) |
| `static/js/reading.js` | Article-page features: reading progress bar, TOC generation, heading anchor links, code block copy buttons |

### Styles pipeline

1. `css/style.css` → imports `base.css`, `fonts.css`, then defines custom properties and Tailwind utilities
2. PostCSS processes through: `postcss-import` → `tailwindcss/nesting` → `tailwindcss` (scans `templates/**/*.html`) → `autoprefixer` → `cssnano`
3. Output: `static/css/style.css` (served by Zola)

The `editorial` color palette (defined in both `tailwind.config.js` and CSS custom properties) is warm-toned: cream background (`#FBFAF7`), amber primary (`#A16207`), stone text (`#1C1917`). Dark mode uses Tailwind's `class` strategy.

### JavaScript — vanilla, no framework

All JS is vanilla ES5/ES6, loaded via `<script defer>`:

- **`main.js`** (site-wide): dark mode toggle (reads/writes `localStorage.is_darkmode_set`; the initial theme is set synchronously in `base.html` `<head>` to prevent FOUC), dropdown navigation, back-to-top button
- **`search.js`** (site-wide): Fuse.js v7 full-text search with modal overlay, keyboard navigation, keyboard shortcut (Cmd+K)
- **`reading.js`** (article pages only): reading progress bar, TOC from `h2`/`h3` headings, anchor links on headings, code block copy buttons

### Key scripts (`boring/scripts/`)

| Script | Purpose |
|---|---|
| `build-related-index.mjs` | Precomputes a related-posts index (`related-index.json`) for the client-side related-reading widget |
| `encrypt-posts.mjs` | Post-build step: AES-256-CBC encrypts articles with `password` frontmatter using StaticShield |
| `og-generator.mjs` | Generates Open Graph images from SVG templates via `@resvg/resvg-js` |
| `build-fonts.sh` | Subsets Chinese fonts (Crimson Pro, Work Sans, JetBrains Mono) using `fonttools pyftsubset` to reduce payload |
| `audit-frontmatter.mjs` | Validates article frontmatter completeness, outputs markdown report |
| `inject-jsonld.mjs` | Injects structured data (JSON-LD) into built HTML |
| `migrate-tags.mjs` | Batch tag migration/cleanup tool |

### Build & deploy

- **CI** (`.github/workflows/build.yml`): on push/PR to `main` — builds fonts, runs PostCSS, runs tests, audits frontmatter
- **Deploy**: Cloudflare Pages with build command `cd boring && zola build`, output directory `boring/public`
- **Local build script** (`build.sh`): `zola build -o roc-blog` then optional `encrypt-posts.mjs` (non-blocking on failure)

### Tests

Uses Node.js native test runner (`node --test`). Test files are co-located with source:

- `static/js/main.test.mjs` — dark mode, dropdown, back-to-top
- `static/js/reading.test.mjs` — TOC generation, slugify, progress bar
- `scripts/lib/*.test.mjs` — font assets, frontmatter parsing, OG colors, reading-lib
- `tests/site-output.test.mjs` — integration test against built HTML output

### Optional: article encryption

Articles with `password` in frontmatter are encrypted client-side via StaticShield (AES-256-CBC, PBKDF2 1M iterations, HMAC-SHA256). Encrypted at build time by `encrypt-posts.mjs`. Decryption happens in-browser when the reader enters the password. Title/description/date remain plaintext for listing pages. See `docs/features/encryption.md`.
