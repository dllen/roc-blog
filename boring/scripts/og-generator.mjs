#!/usr/bin/env node
// Generate 1200x630 OG PNGs for all posts. Idempotent: skips when source unchanged.
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';
import { buildOgSvg } from './lib/build-og-svg.mjs';

const args = process.argv.slice(2);
let contentDir = args[0] || 'content/blog';
let outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'static/og';

const absContent = resolve(contentDir);
const absOut = resolve(outDir);
mkdirSync(absOut, { recursive: true });

const colors = JSON.parse(readFileSync(resolve(dirname(new URL(import.meta.url).pathname), 'og-colors.json'), 'utf8'));
const siteName = '码农的自留地';
const siteUrl = 'https://scp.net.cn';

let generated = 0, skipped = 0;
const mdFiles = walkMd(absContent);

for (const file of mdFiles) {
  const source = readFileSync(file, 'utf8');
  const { data, body } = parseFrontmatter(source);
  if (!data.title) { skipped++; continue; }

  const slug = slugify(basename(file, extname(file)));
  const section = sectionOf(file, absContent);
  const sectionTitle = (data.categories && data.categories[0]) || data.series || section;
  const sequence = String(data.weight ?? data.date?.slice(0, 10) ?? '').padStart(2, '0');

  const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
  const hashFile = join(absOut, `.${slug}.hash`);

  const pngPath = join(absOut, `${slug}.png`);
  if (existsSync(pngPath) && existsSync(hashFile) && readFileSync(hashFile, 'utf8') === hash) {
    skipped++;
    continue;
  }

  const meta = {
    title: data.title,
    description: data.description || extractFirstParagraph(body, 80),
    date: (data.update_date || data.date || '').slice(0, 10),
    section,
    sectionTitle,
    sequence,
    siteName,
    siteUrl,
  };

  const svg = buildOgSvg(meta, colors);
  const resvg = new Resvg(svg, { background: '#0f172a', font: { loadSystemFonts: true } });
  const png = resvg.render().asPng();

  writeFileSync(pngPath, png);
  writeFileSync(hashFile, hash);
  generated++;
}

console.log(`[og] generated=${generated} skipped=${skipped} → ${absOut}`);
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

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '-').replace(/^-+|-+$/g, '');
}

function sectionOf(file, root) {
  const rel = file.slice(root.length + 1);
  const parts = rel.split('/');
  return parts.length > 1 ? parts[0] : 'blog';
}

function extractFirstParagraph(body, max) {
  const m = body.match(/^#+ .*?\n([\s\S]+?)(?:\n\n|$)/);
  const text = (m ? m[1] : body).replace(/[#*`>\-]/g, '').trim().split('\n')[0];
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function existsSync(p) {
  try { statSync(p); return true; } catch { return false; }
}
