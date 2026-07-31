#!/usr/bin/env node
// One-shot: migrate `tags: [A, B, C]` at top level of YAML frontmatter
// to `taxonomies: { tags: [A, B, C] }` (the syntax Zola 0.22.1 recognizes).
// For TOML files: migrate `tags = [A, B, C]` (top level) to
// `[taxonomies] tags = [A, B, C]` (inline section).
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
let root = args[0] || 'content/blog';
const dryRun = args.includes('--dry-run');
root = resolve(root);

let migrated = 0, skipped = 0, noop = 0;

for (const file of walkMd(root)) {
  if (file.endsWith('_index.md')) continue;
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  if (lines.length === 0) continue;
  const delim = lines[0].trim();
  if (delim !== '---' && delim !== '+++') { skipped++; continue; }
  // Find end of frontmatter
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === delim) { endIdx = i; break; }
  }
  if (endIdx === -1) { skipped++; continue; }

  const fm = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');

  let newFm;
  if (delim === '---') {
    // YAML: convert `^tags: [X, Y, Z]` (top level) to `taxonomies:\n  tags: [X, Y, Z]`
    newFm = fm.replace(/^tags:\s*(\[.*\])\s*$/m, 'taxonomies:\n  tags: $1');
  } else {
    // TOML: convert `^tags = [X, Y, Z]` to `[taxonomies]\ntags = [X, Y, Z]`
    newFm = fm.replace(/^tags\s*=\s*(\[.*\])\s*$/m, '[taxonomies]\ntags = $1');
  }

  if (newFm === fm) { noop++; continue; }

  const newSource = `${delim}\n${newFm}\n${delim}\n${body}`;
  const rel = relative(root, file);
  console.log(`[migrate] ${dryRun ? 'would-migrate' : 'migrated'}: ${rel}`);
  if (!dryRun) {
    writeFileSync(file, newSource, 'utf8');
  }
  migrated++;
}

console.log(`[migrate] ${dryRun ? 'dry-run' : 'done'}: migrated=${migrated} noop=${noop} skipped=${skipped}`);
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
