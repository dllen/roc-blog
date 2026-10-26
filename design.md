# Design: 码农的自留地 (roc-blog)

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: editorial
- Shape of the first page: Index-First (home) + Long Document (article)
- Theme: custom (vibe: "kept brand — cream paper, amber accent, stone ink")
- Axes: light/roman-serif/warm · posture: restrained
- Brand: the project's own palette and faces, kept and rebuilt in OKLCH. Nothing here is a framework default.

## Tokens
`boring/css/tokens.css` is the source of truth. The roles:
```css
:root {
  --color-paper: oklch(98.5% 0.004 91);  --color-paper-2: oklch(96.2% 0.009 85);  --color-paper-3: oklch(99.1% 0.004 91);
  --color-ink: oklch(21.6% 0.006 56);  --color-ink-2: oklch(37.4% 0.009 68);  --color-muted: oklch(50.2% 0.018 67);
  --color-rule: oklch(91.4% 0.013 82);  --color-rule-2: oklch(85.6% 0.012 80);
  --color-accent: oklch(55.4% 0.121 66);  --color-accent-ink: oklch(98.5% 0.004 91);  --color-focus: oklch(58% 0.13 64);
  --color-error: oklch(50% 0.182 29.5);  --color-success: oklch(52.7% 0.138 149.7);  --color-warning: oklch(55.5% 0.146 49);
  --font-display: "Crimson Pro", "Songti SC", "Noto Serif CJK SC", serif;
  --font-body: "Work Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-icon: "Line Awesome", "Line Awesome Brands", sans-serif;
  --radius-card: 6px;  --radius-pill: 999px;  --rule-hair: 1px;
  --shadow-card: 0 1px 2px color-mix(in oklab, var(--color-ink) 7%, transparent);
}
```
The spacing scale, the type scale, the easings and the durations are the shared scale and live in `tokens.css`. Dark mode is the same roles re-valued under `.dark`, in the same file.

## Type
- Display: Crimson Pro (Latin) over Songti SC (CJK) — heads, titles, the wordmark.
- Body: Work Sans over PingFang SC — every Chinese paragraph.
- Mono: JetBrains Mono — dates, slugs, measurements, code. Never labels.
- Icon: Line Awesome (solid + brands) — the only glyph source, on the site's own eleven icons.
- Three text voices; the icon slot is a fourth family and is waived on the record (gate 37).

## Controls
- Primary: accent fill, accent-ink text · radius 6px · height 44px
- Secondary: hairline outline in rule-2, ink text · same radius and height
- Pills only on real controls (tags, consent buttons); boxes and media take the card radius.

## Motion
- Character: calm. One reveal at most (the consent sheet). Under reduced motion everything ends at once.

## The signature
The marginalia index: publication date and topic set in the mono left margin, the article title in the serif measure, on every archive row of every listing.

## Exports
`boring/css/tokens.css` in this project; the Tailwind mapping in `boring/tailwind.config.js` points `editorial-*` at the same roles. DTCG or shadcn blocks are added here on request, per `export-formats.md`.
