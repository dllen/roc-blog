#!/usr/bin/env node
// One-shot migration: convert +++ TOML frontmatter to --- YAML.
// Supports --dry-run. Operates on a single root directory recursively.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const args = process.argv.slice(2);
let root = args[0] || 'content/blog';
let dryRun = args.includes('--dry-run');
root = resolve(root);

const mdFiles = walkMd(root);
let changed = 0;
let skipped = 0;

for (const file of mdFiles) {
  const source = readFileSync(file, 'utf8');
  const { format, data, body } = parseFrontmatter(source);
  if (format !== 'toml') { skipped++; continue; }

  const yaml = toYaml(data);
  const newSource = `---\n${yaml}---\n${body}`;
  if (!dryRun) writeFileSync(file, newSource, 'utf8');
  changed++;
  console.log(`[migrate] ${dryRun ? 'would-change' : 'changed'}: ${relative(root, file)}`);
}

console.log(`[migrate] ${dryRun ? 'dry-run' : 'done'}: ${changed} changed, ${skipped} skipped`);
process.exit(0);

function toYaml(obj, indent = 0) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`${pad}${k}:`);
      lines.push(toYaml(v, indent + 2));
    } else if (Array.isArray(v)) {
      const items = v.map(i => `${pad}  - ${yamlScalar(i)}`).join('\n');
      lines.push(`${pad}${k}:\n${items}`);
    } else {
      lines.push(`${pad}${k}: ${yamlScalar(v)}`);
    }
  }
  return lines.join('\n') + (indent === 0 ? '\n' : '');
}

function yamlScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (/[:#&*!|>'"%@`{}[\],\n]/.test(s) || s !== s.trim() || s === '') {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
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
