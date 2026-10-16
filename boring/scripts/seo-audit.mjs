#!/usr/bin/env node
// SEO content audit. Companion to audit-frontmatter.mjs; checks on-page SEO
// signals not covered by frontmatter shape: title length, description quality,
// TLDR, internal/external links, FAQ, image alt text, first-paragraph keyword.
//
// Usage:
//   node scripts/seo-audit.mjs [content/blog] [--out _audit]
//   node scripts/seo-audit.mjs content/blog/<slug>.md
//
// Exit codes: 0 = no ERROR (only WARN/INFO), 1 = at least one ERROR.
// ERROR blocks publish; WARN/INFO are reported but non-blocking.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const TITLE_MAX = 60;
const DESC_MIN = 80;
const DESC_MAX = 160;
const CONTENT_MIN_NORMAL = 800;
const CONTENT_MIN_WEEKLY = 300;

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

function getTitle(data) { return data.title ? String(data.title) : ''; }

function getDescription(data) {
  if (!data.description) return '';
  return typeof data.description === 'string' ? data.description : String(data.description);
}

function extractFirstParagraph(body) {
  const stripped = body.replace(/^---[\s\S]*?---\n/, '');
  const m = stripped.match(/^##?\s+[^\n]*\n+([\s\S]*?)(?=\n##\s|\n###\s|$)/);
  if (m) return m[1].trim();
  return stripped.split(/\n\n/)[0]?.trim() || '';
}

function countInternalLinks(body) {
  // /blog/... or content/... or relative paths
  const re = /\]\((\/[^)]+|content\/[^)]+|\.\.\/[^)]+)/g;
  return (body.match(re) || []).length;
}

function countExternalLinks(body) {
  const re = /\]\(https?:\/\/[^)]+\)/g;
  return (body.match(re) || []).length;
}

function hasFAQ(body) {
  return /^##\s+(FAQ|常见问题|问答|Q\s*&\s*A)/im.test(body);
}

const TRUSTED_DOMAINS = [
  'zhihu.com', 'github.com', 'wikipedia.org', 'arxiv.org',
  'w3.org', 'mozilla.org', 'cloudflare.com', 'google.com',
  'apache.org', 'kafka.apache.org', 'flink.apache.org',
  'eastmoney.com', 'sina.com.cn', 'qq.com', '163.com',
  'gov.cn', 'people.com.cn', 'xinhuanet.com',
  'csdn.net', 'juejin.cn', 'oschina.net',
  'ieee.org', 'acm.org', 'spring.io', 'oracle.com',
];

function hasAuthoritativeSource(body) {
  const re = /\]\(https?:\/\/([^/)]+)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (TRUSTED_DOMAINS.some(d => m[1].includes(d))) return true;
  }
  return false;
}

function findImagesWithoutAlt(body) {
  const re = /!\[([^\]]*)\]\([^)]+\)/g;
  const bad = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    if (!m[1].trim()) bad.push(m[0]);
  }
  return bad;
}

function countH2(body) {
  return (body.match(/^##\s+/gm) || []).length;
}

function isWeekly(tags) {
  return Array.isArray(tags) && tags.some(t => /周报|weekly/i.test(String(t)));
}

function auditFile(filePath, rootDir) {
  const rel = relative(rootDir, filePath);
  const source = readFileSync(filePath, 'utf8');
  const { data, body } = parseFrontmatter(source);
  const text = stripMd(body);
  const tags = data.taxonomies?.tags || [];
  const isWk = isWeekly(tags);
  const contentMin = isWk ? CONTENT_MIN_WEEKLY : CONTENT_MIN_NORMAL;
  const issues = [];

  const title = getTitle(data);
  const description = getDescription(data);
  const tldr = data.tldr ? String(data.tldr) : '';
  const keywords = data.keywords
    ? (Array.isArray(data.keywords) ? data.keywords : [String(data.keywords)])
    : [];
  const updateDate = data.update_date;
  const firstPara = extractFirstParagraph(body);

  // ERROR
  if (!title) {
    issues.push({ sev: 'ERROR', field: 'title', msg: 'missing title' });
  } else if (title.length > TITLE_MAX) {
    issues.push({ sev: 'ERROR', field: 'title', msg: `title ${title.length} chars > ${TITLE_MAX} (SERP truncation)` });
  }

  if (!description) {
    issues.push({ sev: 'ERROR', field: 'description', msg: 'missing description' });
  } else if (description.length < 30) {
    issues.push({ sev: 'ERROR', field: 'description', msg: `description only ${description.length} chars (effectively missing)` });
  }

  if (text.length < contentMin) {
    issues.push({ sev: 'ERROR', field: 'content', msg: `body only ${text.length} chars < ${contentMin} (${isWk ? 'weekly' : 'normal'} min)` });
  }

  const imgsNoAlt = findImagesWithoutAlt(body);
  if (imgsNoAlt.length > 0) {
    issues.push({ sev: 'ERROR', field: 'images', msg: `${imgsNoAlt.length} image(s) missing alt`, count: imgsNoAlt.length, samples: imgsNoAlt.slice(0, 2) });
  }

  // WARN
  if (description && (description.length < DESC_MIN || description.length > DESC_MAX)) {
    issues.push({ sev: 'WARN', field: 'description', msg: `description ${description.length} chars (recommended ${DESC_MIN}-${DESC_MAX})` });
  }
  if (!tldr && !isWk) {
    issues.push({ sev: 'WARN', field: 'tldr', msg: 'missing tldr (recommended for rich SERP)' });
  }
  const internalLinks = countInternalLinks(body);
  if (internalLinks < 2 && !isWk) {
    issues.push({ sev: 'WARN', field: 'internal_links', msg: `only ${internalLinks} internal link(s) (recommended ≥2)` });
  }
  const externalLinks = countExternalLinks(body);
  if (externalLinks < 1 && !isWk) {
    issues.push({ sev: 'WARN', field: 'external_links', msg: 'no external authoritative source (recommended ≥1)' });
  }
  if (!hasFAQ(body) && !isWk) {
    issues.push({ sev: 'WARN', field: 'faq', msg: 'no FAQ section (recommended for featured snippet)' });
  }
  if (title && firstPara) {
    const keywordCore = title.split(/[:：|]/)[0].slice(0, 8);
    if (keywordCore && !firstPara.includes(keywordCore)) {
      issues.push({ sev: 'WARN', field: 'first_para', msg: `first paragraph does not contain primary keyword "${keywordCore}"` });
    }
  }

  // INFO
  if (keywords.length === 0) {
    issues.push({ sev: 'INFO', field: 'keywords', msg: 'no keywords field (helpful for long-tail coverage)' });
  }
  if (!updateDate) {
    issues.push({ sev: 'INFO', field: 'update_date', msg: 'no update_date (recommended for content freshness signal)' });
  }
  if (countH2(body) < 3 && !isWk) {
    issues.push({ sev: 'INFO', field: 'h2_count', msg: `only ${countH2(body)} H2 sections (recommended ≥3)` });
  }

  return { path: rel, title, description, issues, charCount: text.length, tagCount: tags.length };
}

function auditDirectory(rootDir) {
  const files = walkMd(rootDir);
  const results = [];
  for (const f of files) {
    try { results.push(auditFile(f, rootDir)); } catch (e) { /* skip unreadable */ }
  }
  return results;
}

function formatReport(results) {
  const buckets = { ERROR: [], WARN: [], INFO: [] };
  let totalErrors = 0, totalWarns = 0, totalInfos = 0;
  for (const r of results) {
    for (const i of r.issues) {
      const entry = { path: r.path, ...i };
      buckets[i.sev].push(entry);
      if (i.sev === 'ERROR') totalErrors++;
      else if (i.sev === 'WARN') totalWarns++;
      else totalInfos++;
    }
  }
  const lines = [
    '# SEO Audit Report',
    `- 总文章: ${results.length} · ERROR: ${totalErrors} · WARN: ${totalWarns} · INFO: ${totalInfos}`,
    '',
    '> ERROR 阻塞发布；WARN 推荐修复；INFO 仅提示。',
    '',
  ];
  for (const sev of ['ERROR', 'WARN', 'INFO']) {
    lines.push(`## ${sev} (${buckets[sev].length})`);
    if (buckets[sev].length === 0) { lines.push(''); continue; }
    for (const i of buckets[sev]) {
      const count = i.count ? ` (×${i.count})` : '';
      const samples = i.samples ? ` e.g. \`${i.samples.join('`, `')}\`` : '';
      lines.push(`- \`${i.path}\` [${i.field}] ${i.msg}${count}${samples}`);
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// CLI
const args = process.argv.slice(2);
let contentDir = 'content/blog';
let outDir = '_audit';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') { outDir = args[++i]; }
  else if (!args[i].startsWith('-')) { contentDir = args[i]; }
}

const absContent = resolve(contentDir);
const stat = statSync(absContent);
const targets = stat.isDirectory() ? walkMd(absContent) : [absContent];
mkdirSync(resolve(outDir), { recursive: true });

const results = [];
const rootDir = stat.isDirectory() ? absContent : resolve('.');
for (const f of targets) {
  try { results.push(auditFile(f, rootDir)); } catch (e) { /* skip */ }
}
const report = formatReport(results);
const reportPath = join(resolve(outDir), 'seo-audit.md');
writeFileSync(reportPath, report, 'utf8');

const totalErrors = results.reduce((sum, r) => sum + r.issues.filter(i => i.sev === 'ERROR').length, 0);
console.log(`[seo-audit] total=${results.length} errors=${totalErrors} → ${reportPath}`);
process.exit(totalErrors > 0 ? 1 : 0);
