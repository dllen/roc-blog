#!/usr/bin/env node
// Remove orphan OG PNGs whose source .md no longer exists.
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, basename, extname } from 'node:path';

const args = process.argv.slice(2);
let contentDir = args[0] || 'content/blog';
let outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'static/og';
let dryRun = args.includes('--dry-run');

const absContent = resolve(contentDir);
const absOut = resolve(outDir);

const currentSlugs = new Set();
for (const md of walkMd(absContent)) {
  currentSlugs.add(slugify(basename(md, extname(md))));
}

let removed = 0, kept = 0;
let entries;
try { entries = readdirSync(absOut); } catch { entries = []; }
for (const name of entries) {
  if (!name.endsWith('.png') || name.startsWith('.')) { kept++; continue; }
  const slug = name.slice(0, -4);
  if (currentSlugs.has(slug)) { kept++; continue; }
  const full = join(absOut, name);
  if (dryRun) {
    console.log(`[cleanup] would-remove: ${name}`);
  } else {
    unlinkSync(full);
    console.log(`[cleanup] removed: ${name}`);
  }
  removed++;
}
console.log(`[cleanup] ${dryRun ? 'dry-run' : 'done'}: removed=${removed} kept=${kept}`);
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
