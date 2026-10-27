#!/usr/bin/env node
// Pre-build: scan all blog articles and write a compact JSON index of the
// archive — title, url, dates, description, tags, reading time.
//
// The homepage renders its latest rows server-side from this index and the
// category/tag filter fetches it on demand, so the first paint carries ten
// rows instead of the whole archive.
//
// Usage: node scripts/build-home-index.mjs [--out <path>] [--content <dir>]
// Default: scans content/blog, writes static/home-index.json.

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let contentDir = 'content/blog';
let outFile = 'static/home-index.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') outFile = args[++i];
  else if (args[i] === '--content') contentDir = args[++i];
}

const root = resolve(contentDir);
const out = resolve(outFile);

// Words per minute for the reading time. Zola counts a CJK character as a
// little more than one Latin word, which lands on 240 for this archive; the
// count below mirrors it closely enough for the index (the article page
// keeps Zola's own number).
const WORDS_PER_MINUTE = 240;

// Section titles, so the index can carry the marginalia's topic without a
// second lookup in the browser.
const sectionTitles = new Map();
for (const file of walkMd(root)) {
  if (!file.endsWith('_index.md')) continue;
  const rel = relative(root, file);
  const section = rel.split('/')[0];
  if (!section || sectionTitles.has(section)) continue;
  try {
    const { data } = parseFrontmatter(readFileSync(file, 'utf8'));
    if (data.title) sectionTitles.set(section, String(data.title));
  } catch { /* a section without frontmatter simply has no title */ }
}

const articles = [];
for (const file of walkMd(root)) {
  if (file.endsWith('_index.md')) continue;
  let source;
  try { source = readFileSync(file, 'utf8'); } catch { continue; }
  const { format, data } = parseFrontmatter(source);
  if (format === null) continue;
  if (!data.title) continue;

  const rel = relative(root, file);
  const parts = rel.split('/');
  const section = parts.length > 1 ? parts[0] : '';
  const filename = parts[parts.length - 1].replace(/\.md$/, '');
  const slug = filename === 'index' ? '' : filename;

  // Permalink, matching Zola's layout: /blog/<slug>/ at the top level,
  // /blog/<section>/<slug>/ inside a section, /blog/<section>/ for index.md.
  const permalink = section
    ? `/blog/${section}/${slug ? `${slug}/` : ''}`
    : `/blog/${slug ? `${slug}/` : ''}`;

  const tags = data.taxonomies?.tags || data.tags || [];
  if (!Array.isArray(tags)) continue;

  const date = String(data.date || '1970-01-01').slice(0, 10);
  const updateDate = String(data.extra?.update_date || data.update_date || data.date || '').slice(0, 10) || date;

  articles.push({
    title: String(data.title),
    permalink,
    date,
    description: String(data.description || ''),
    reading_time: readingMinutes(source),
    // The shape mirrors a Zola page, so the shared row component renders an
    // index entry and a real page with the same markup.
    taxonomies: { tags: tags.map(String) },
    extra: { update_date: updateDate },
    section,
    topic: sectionTitles.get(section) || '',
    components: section ? ['blog', section, slug] : ['blog', slug],
  });
}

articles.sort((a, b) => b.date.localeCompare(a.date));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(articles), 'utf8');

console.log(`[home-index] wrote ${articles.length} articles → ${out}`);
process.exit(0);

// The reading time, counted the way the site counts it: the prose without
// its fenced code blocks, CJK characters and Latin words alike.
function readingMinutes(source) {
  const prose = source
    .replace(/^---[\s\S]*?---\n/, '')
    .replace(/```[\s\S]*?```/g, '');
  const cjk = (prose.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  const latin = (prose.replace(/[\u4e00-\u9fff\u3040-\u30ff]/g, ' ').match(/[A-Za-z0-9_'-]+/g) || []).length;
  return Math.max(1, Math.ceil((cjk + latin) / WORDS_PER_MINUTE));
}

function walkMd(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name.startsWith('.') || name === '_review_reports' || name === 'node_modules') continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walkMd(full));
    else if (s.isFile() && name.endsWith('.md')) out.push(full);
  }
  return out;
}
