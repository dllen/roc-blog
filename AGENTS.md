# AGENTS.md — Roc's Blog

Zola (v0.23+) static site for a Chinese tech blog, themed with a custom `boring/` fork (Tailwind + vanilla JS). CI in `.github/workflows/build.yml` builds and force-pushes the site to the `release` branch via `peaceiris/actions-gh-pages`; cache policy lives in `boring/static/_headers` (Cloudflare Pages / Netlify format). Content lives at `boring/content/blog/*.md` (YAML frontmatter, dated articles, sectioned into Zola subsections). All toolchain commands run from `boring/`, never the repo root.

## Dev environment

- **Node 22** (matches CI); **Python 3.11** for font subsetting; **Zola CLI** installed separately (CI downloads binary; locally: `brew install zola`).
- Enable corepack before yarn: `corepack enable` (CI does it; `scripts/ci-local.sh` mirrors this).
- Local dev server: `cd boring && bash start.sh` (kills any prior `zola`, serves on `0.0.0.0:1111`, base-url `/`). Or: `cd boring && zola serve`.

## Build & test (all run from `boring/`)

```bash
yarn install                 # one-time
yarn build                   # build-related-index.mjs + postcss (css/style.css → static/css/style.css)
yarn watch                   # postcss --watch only
bash scripts/build-fonts.sh # needs pip: fonttools==4.47.0, brotli==1.1.0
yarn og                      # generate OG images via @resvg/resvg-js
zola build -o roc-blog --force          # mirrors CI; required before yarn test:site
node scripts/encrypt-posts.mjs          # optional post-build AES-256-CBC, failures non-blocking
bash build.sh                            # zola build + optional encrypt (the deployable flow)

yarn test          # node --test scripts/*.test.mjs scripts/lib/*.test.mjs static/js/*.test.mjs
yarn test:site     # integration: asserts on built HTML in roc-blog/  (run `zola build` first)
yarn audit         # frontmatter completeness report → boring/_audit/frontmatter-audit.md
```

Local build mock (mirrors `.github/workflows/build.yml` build steps including `cleanup-og.mjs`; **skips `yarn test` and `yarn test:site`** — run those manually before pushing): `bash scripts/ci-local.sh` from repo root.

## Conventions

- **Frontmatter is YAML** (`---` delimiters). TOML (`+++`) is legacy — `yarn audit` flags stragglers; migrate with `node scripts/migrate-toml-to-yaml.mjs`.
- **Articles**: tags go in `taxonomies.tags` (theme renders `page.taxonomies.tags` only — `extra.tags` is silent). Required: `title`, `date`. Recommended: `description` 80–160 chars, 1–6 tags, `extra.update_date` for list-page display (does not change sort, which is always by `date`).
- **Section `_index.md`**: must NOT contain `taxonomies` (`zola build` errors). Section-level tags belong in `extra` (lazy metadata, not rendered).
- **New subsection**: create a directory under `boring/content/blog/<name>/` with its own `_index.md` AND register it in `config.toml` under `[extra] nav_sections`, otherwise it won't appear in the nav.
- **CSS pipeline**: edit `boring/css/style.css` only. PostCSS chain (config in `boring/postcss.config.js`): `postcss-import` → `tailwindcss/nesting` → `tailwindcss` (scans `templates/**/*.html`) → `autoprefixer` → `cssnano`. Never hand-edit the generated `static/css/style.css`.
- **JS**: vanilla ES5/ES6, loaded via `<script defer>`. Site-wide: `main.js` (dark mode, nav, back-to-top), `search.js` (Fuse.js), `consent.js` (AdSense consent banner + slot injection; needs `google_adsense_client_id` + ad-slot IDs in `config.toml`). Article pages: `reading.js` (progress bar, TOC, code-copy).
- **Tailwind palette**: `editorial` (cream `#FBFAF7` bg, amber `#A16207` primary, stone text). Dark mode = `class` strategy.
- **Optional encryption**: `password` / `password_hint` / `remember_days` in frontmatter → encrypted at build by `encrypt-posts.mjs`, decrypted client-side via StaticShield. Title/description/date stay plaintext so listings render.
- **Commit/lint conventions**: covered by `.trunk/` config; CI does NOT run trunk, it runs `yarn test` + `yarn audit`.

## Pitfalls

- **Don't run yarn / zola from repo root** — every script assumes `boring/` as cwd; the site URL and relative paths break otherwise.
- **`yarn test:site` requires a fresh `zola build -o roc-blog --force`** — the integration test reads from `boring/roc-blog/`. If output dir is missing the test fails immediately.
- **`yarn build` does two things in order**: precomputes `related-index.json` BEFORE postcss. If postcss changes fail, the related index may be stale for that run — re-run `yarn build:index` (or full `yarn build`).
- **`boring/roc-blog/` vs `boring/public/`**: `zola build` alone writes to `public/`; the project convention uses `-o roc-blog` so the output name matches the deploy dir. CI deploys from `boring/roc-blog`; raw `zola` (e.g. `zola serve`) writes to `public/`. The two dirs can drift — always run the full `zola build -o roc-blog --force` before `yarn test:site`.
- **Generated artifacts not to hand-edit**: `static/css/style.css`, `static/og/*.png`, `static/related-index.json`, `roc-blog/**`. Source-of-truth files live one level up or in `scripts/`.
- **Leftover files in `boring/`** (all gitignored, but visible): `.hugo_build.lock` (pre-Zola), `yarn-error.log`, `startup.log` — never treat as source.
- **Port 1111 in use**: `start.sh` calls `pkill zola` first; if another process holds 1111, `zola serve` will pick the next free port and log it.
- **Font build needs Python deps installed first** (`pip install fonttools==4.47.0 brotli==1.1.0`); CI installs them, locally you must run it once — otherwise `bash scripts/build-fonts.sh` silently no-ops or fails.
- **Adding a section without updating `nav_sections`** silently hides it from the nav bar — easy to miss in review; `yarn audit` does NOT check this.
- **Don't pull new dependencies into `package.json` without checking CSS scan paths** — Tailwind only scans templates matching its config, so any template referencing new utility classes must live under `templates/`.

## Pointers

- Long-form project notes / architecture: `CLAUDE.md`.
- CI workflow to mirror locally: `.github/workflows/build.yml` ↔ `scripts/ci-local.sh`.
- Encryption feature spec: `docs/features/encryption.md`.
