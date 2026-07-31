#!/usr/bin/env node
// Pre-build: scan all blog articles, write a flat JSON index that reading.js
// fetches at runtime to compute "related articles by shared tag count".
//
// Usage: node scripts/build-related-index.mjs [--out <path>] [--content <dir>]
// Default: scans content/blog, writes static/related-index.json.

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let contentDir = 'content/blog';
let outFile = 'static/related-index.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { outFile = args[++i]; }
  else if (args[i] === '--content') { contentDir = args[++i]; }
}

const root = resolve(contentDir);
const out = resolve(outFile);

const articles = [];
for (const file of walkMd(root)) {
  if (file.endsWith('_index.md')) continue;
  let source;
  try { source = readFileSync(file, 'utf8'); } catch { continue; }
  const { format, data } = parseFrontmatter(source);
  if (format === null) continue;
  if (!data.title) continue;

  // Permalink: blog/{section}/{slug}/
  const rel = relative(root, file);
  const parts = rel.split('/');
  const section = parts.length > 1 ? parts[0] : 'blog';
  const filename = parts[parts.length - 1];
  const slug = filename.replace(/\.md$/, '');

  // Tags: prefer taxonomies.tags (migrated), fall back to top-level tags
  const tags = data.taxonomies?.tags || data.tags || [];
  if (!Array.isArray(tags)) continue;

  articles.push({
    title: String(data.title),
    permalink: `/${section}/${slug}/`,
    slug,
    section,
    date: String(data.date || '1970-01-01').slice(0, 10),
    tags: tags.map(String),
  });
}

articles.sort((a, b) => b.date.localeCompare(a.date));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(articles, null, 0), 'utf8');

const totalTags = new Set();
for (const a of articles) for (const t of a.tags) totalTags.add(t);
console.log(`[related-index] wrote ${articles.length} articles, ${totalTags.size} unique tags → ${out}`);
process.exit(0);

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
