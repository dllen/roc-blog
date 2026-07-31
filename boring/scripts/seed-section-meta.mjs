#!/usr/bin/env node
// One-shot: for each section without _index.md, create one based on article tags.
// For sections WITH _index.md but missing description: patch description only.
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseFrontmatter } from './lib/parse-frontmatter.mjs';

const args = process.argv.slice(2);
let root = args[0] || 'content/blog';
const dryRun = args.includes('--dry-run');
root = resolve(root);

const titleMap = {
  spring: 'Spring 源码解读',
  zookeeper: 'ZooKeeper 源码解读',
  redis: 'Redis 源码解读',
  flink: 'Flink 源码解读',
  hbase: 'HBase 源码解读',
  hdfs: 'HDFS 源码解读',
  kafka: 'Kafka 源码解读',
  reading: '读书笔记',
  'sicp-with-python': 'SICP Python版',
  translate: '翻译',
  weekly: 'Weekly',
  tutorial: 'Tutorial',
  sre: 'SRE',
  extra: 'Extra',
  speech: '巴菲特演讲集锦',
  prompt: 'Prompt Engineering',
};

function collectStats(sectionDir) {
  const tagFreq = new Map();
  const descSamples = [];
  for (const f of walkMd(sectionDir)) {
    if (f.endsWith('_index.md')) continue;
    const { data } = parseFrontmatter(readFileSync(f, 'utf8'));
    // In migrated articles, tags live in taxonomies.tags
    const tags = data.taxonomies?.tags || data.tags || [];
    for (const t of tags) {
      tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
    }
    if (data.description) descSamples.push(String(data.description));
  }
  const topTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return { count: descSamples.length, topTags, sampleDescriptions: descSamples.slice(0, 3) };
}

function suggestMeta(stats, fallbackTitle) {
  const tagList = stats.topTags.slice(0, 5).join('、');
  let description;
  if (stats.sampleDescriptions.length > 0) {
    const sample = stats.sampleDescriptions[0];
    description = sample.length > 80 ? sample.slice(0, 80) + '…' : sample;
    if (tagList) description = `${description} 涵盖主题：${tagList}。`;
  } else if (tagList) {
    description = `${fallbackTitle} 涵盖主题：${tagList}。`;
  } else {
    description = `${fallbackTitle} 系列文章集合。`;
  }
  return { title: fallbackTitle, description, weight: 10 };
}

let created = 0, patchedCount = 0, skipped = 0;

let entries;
try { entries = readdirSync(root); } catch (e) {
  console.error(`[seed] cannot read ${root}: ${e.message}`);
  process.exit(1);
}

for (const name of entries) {
  if (name.startsWith('.') || name === '_review_reports') continue;
  const sectionDir = join(root, name);
  let s;
  try { s = statSync(sectionDir); } catch { continue; }
  if (!s.isDirectory()) continue;

  const indexPath = join(sectionDir, '_index.md');
  const hasIndex = (() => { try { statSync(indexPath); return true; } catch { return false; } })();

  const stats = collectStats(sectionDir);
  if (stats.count === 0) { skipped++; continue; }

  const fallbackTitle = titleMap[name] || name;
  const meta = suggestMeta(stats, fallbackTitle);

  if (!hasIndex) {
    const content = `+++\ntitle = ${JSON.stringify(meta.title)}\ndescription = ${JSON.stringify(meta.description)}\nweight = ${meta.weight}\n+++\n\n`;
    console.log(`[seed] would-create: ${relative(root, indexPath)}`);
    if (!dryRun) { writeFileSync(indexPath, content, 'utf8'); created++; }
  } else {
    const src = readFileSync(indexPath, 'utf8');
    if (/^description\s*[:=]/m.test(src)) { skipped++; continue; }
    const newContent = src.replace(
      /^(title\s*[:=].*)$/m,
      `$1\ndescription = ${JSON.stringify(meta.description)}`
    );
    console.log(`[seed] would-patch: ${relative(root, indexPath)}`);
    if (!dryRun) { writeFileSync(indexPath, newContent, 'utf8'); patchedCount++; }
  }
}

console.log(`[seed] ${dryRun ? 'dry-run' : 'done'}: created=${created} patched=${patchedCount} skipped=${skipped}`);
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
