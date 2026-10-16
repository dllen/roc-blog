#!/usr/bin/env node
// Enrich frontmatter by auto-injecting `tldr` + `keywords` placeholders for
// articles missing them. Skips `FAQ` section (requires content knowledge,
// not derivable). Operates on YAML frontmatter only (TOML handled separately
// if needed).
//
// Usage:
//   node scripts/enrich-frontmatter.mjs [content/blog]              # dry-run
//   node scripts/enrich-frontmatter.mjs [content/blog] --apply      # write
//   node scripts/enrich-frontmatter.mjs content/blog/<slug>.md      # single file
//
// Default is dry-run (safe). Reports to _audit/enrich-plan.md.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

function walkMd(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name.startsWith('.') || name.startsWith('_') || name === 'node_modules') continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walkMd(full));
    else if (s.isFile() && name.endsWith('.md')) out.push(full);
  }
  return out;
}

function stripMd(s) {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s+/gm, ' ')
    .replace(/[#>*_~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveTldr(body, description) {
  // description may contain literal escape chars (TOML parser keeps `\"` etc.); unescape first
  if (description && description.length >= 30) return unescapeTomlBasic(description);
  // Strip markdown and take first sentence-ish chunk
  const stripped = stripMd(body);
  const m = stripped.match(/^(.{30,180}?[。！？.!?；;])/);
  if (m) return m[1].trim();
  return stripped.slice(0, 150).trim();
}

function deriveKeywords(title, tags) {
  const kws = new Set();
  if (title) {
    const cleanTitle = unescapeTomlBasic(title);
    const titleTerms = cleanTitle.split(/[:：|／/（）()【】\[\]\\,，\s]+/).filter(t => t.length >= 2 && t.length <= 20);
    titleTerms.forEach(t => kws.add(t));
  }
  if (Array.isArray(tags)) {
    tags.forEach(t => kws.add(String(t)));
  }
  return Array.from(kws).slice(0, 8);
}

// Inverse of TOML basic-string escape (used to undo parser's no-op)
function unescapeTomlBasic(s) {
  return String(s).replace(/\\(.)/g, (_, c) => {
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    if (c === 'r') return '\r';
    if (c === '"') return '"';
    if (c === '\\') return '\\';
    return c;
  });
}

// TOML basic-string escape (for safe write)
function tomlBasicEscape(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
}

function processFile(filePath, rootDir, applyMode) {
  const rel = relative(rootDir, filePath);
  const source = readFileSync(filePath, 'utf8');
  const { data, body, format } = parseFrontmatter(source);

  const changes = [];
  const tldr = data.tldr ? String(data.tldr) : '';
  const description = data.description ? String(data.description) : '';
  const title = data.title ? String(data.title) : '';
  const tags = data.taxonomies?.tags || [];
  const existingKeywords = data.keywords ? (Array.isArray(data.keywords) ? data.keywords : [String(data.keywords)]) : [];

  if (!tldr || tldr.length < 10) {
    changes.push({ field: 'tldr', value: deriveTldr(body, description) });
  }
  if (existingKeywords.length === 0) {
    const kws = deriveKeywords(title, tags);
    if (kws.length > 0) changes.push({ field: 'keywords', value: kws });
  }

  if (changes.length === 0) return { path: rel, skipped: 'already-enriched', changes: [] };
  if (!['yaml', 'toml'].includes(format)) return { path: rel, skipped: 'unknown-format', changes: [] };

  if (applyMode) {
    let newSource = source;
    const injector = format === 'toml' ? { tldr: injectToml, keywords: injectTomlArray } : { tldr: injectYaml, keywords: injectYamlArray };
    for (const c of changes) {
      newSource = injector[c.field](newSource, c.field, c.value);
    }
    if (newSource !== source) {
      writeFileSync(filePath, newSource, 'utf8');
    }
  }

  return { path: rel, skipped: null, changes };
}

function injectYaml(source, key, value) {
  // Insert `key: "value"` before the closing `---`
  // Use function replacement to avoid $-backreference interpretation of source content.
  const escVal = String(value).replace(/"/g, '\\"');
  const line = `${key}: "${escVal}"`;
  const re = /^(---\n)([\s\S]*?\n)(---\n)/;
  const m = source.match(re);
  if (!m) return source;
  const fm = m[2];
  if (new RegExp(`^${key}:`, 'm').test(fm)) return source;
  return source.replace(re, (_, g1, g2, g3) => g1 + g2 + line + '\n' + g3);
}

function injectYamlArray(source, key, arr) {
  const formatted = arr.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(', ');
  const line = `${key}: [${formatted}]`;
  const re = /^(---\n)([\s\S]*?\n)(---\n)/;
  const m = source.match(re);
  if (!m) return source;
  const fm = m[2];
  if (new RegExp(`^${key}:`, 'm').test(fm)) return source;
  return source.replace(re, (_, g1, g2, g3) => g1 + g2 + line + '\n' + g3);
}

function injectToml(source, key, value) {
  const escVal = tomlBasicEscape(value);
  const line = `${key} = "${escVal}"`;
  const re = /^(\+{3}\n)([\s\S]*?\n)(\+{3}\n)/;
  const m = source.match(re);
  if (!m) return source;
  const fm = m[2];
  if (new RegExp(`^${key}\\s*=`, 'm').test(fm)) return source;
  return source.replace(re, (_, g1, g2, g3) => g1 + g2 + line + '\n' + g3);
}

function injectTomlArray(source, key, arr) {
  const formatted = arr.map(v => `"${tomlBasicEscape(v)}"`).join(', ');
  const line = `${key} = [${formatted}]`;
  const re = /^(\+{3}\n)([\s\S]*?\n)(\+{3}\n)/;
  const m = source.match(re);
  if (!m) return source;
  const fm = m[2];
  if (new RegExp(`^${key}\\s*=`, 'm').test(fm)) return source;
  return source.replace(re, (_, g1, g2, g3) => g1 + g2 + line + '\n' + g3);
}

function formatPlan(plan) {
  const lines = [
    '# Enrichment Plan',
    `- 待注入文章: ${plan.filter(p => !p.skipped && p.changes.length > 0).length}`,
    `- 已完善（无需操作）: ${plan.filter(p => p.skipped === 'already-enriched').length}`,
    `- 跳过（TOML frontmatter）: ${plan.filter(p => p.skipped === 'toml-frontmatter').length}`,
    '',
    '## 待注入字段（dry-run 预览）',
  ];
  for (const p of plan) {
    if (p.skipped || p.changes.length === 0) continue;
    lines.push(`### \`${p.path}\``);
    for (const c of p.changes) {
      if (c.field === 'tldr') {
        lines.push(`- tldr: "${c.value}"`);
      } else if (c.field === 'keywords') {
        lines.push(`- keywords: [${c.value.map(v => `"${v}"`).join(', ')}]`);
      }
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// CLI
const args = process.argv.slice(2);
let contentDir = 'content/blog';
let outDir = '_audit';
let apply = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--apply') apply = true;
  else if (args[i] === '--out') { outDir = args[++i]; }
  else if (!args[i].startsWith('-')) { contentDir = args[i]; }
}

const absContent = resolve(contentDir);
const stat = statSync(absContent);
const targets = stat.isDirectory() ? walkMd(absContent) : [absContent];
mkdirSync(resolve(outDir), { recursive: true });

const rootDir = stat.isDirectory() ? absContent : resolve('.');
const plan = [];
for (const f of targets) {
  try { plan.push(processFile(f, rootDir, apply)); } catch (e) { /* skip */ }
}

const reportPath = join(resolve(outDir), 'enrich-plan.md');
writeFileSync(reportPath, formatPlan(plan), 'utf8');

const toApply = plan.filter(p => !p.skipped && p.changes.length > 0);
const skipped = plan.filter(p => p.skipped).length;
console.log(`[enrich] ${apply ? 'APPLIED' : 'dry-run'} total=${plan.length} to-inject=${toApply.length} skipped=${skipped} → ${reportPath}`);
process.exit(0);
