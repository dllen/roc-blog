// Pure audit logic. Returns a structured result that the CLI script formats.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter } from './parse-frontmatter.mjs';

const REQUIRED = ['title', 'date', 'description', 'tags'];
const TITLE_MAX = 80;
const DESCRIPTION_MIN = 80;
const DESCRIPTION_MAX = 160;
const TAGS_MIN = 1;
const TAGS_MAX = 6;

export function auditDirectory(rootDir) {
  const result = {
    totalFiles: 0,
    missingTitle: [],
    missingDate: [],
    missingDescription: [],
    missingTags: [],
    tomlFiles: [],
    titleTooLong: [],
    descriptionTooShort: [],
    descriptionTooLong: [],
    tagsEmpty: [],
    tagsTooMany: [],
    allThreeMissing: [],
    atLeastOneMissing: 0,
  };

  const mdFiles = walkMd(rootDir);
  result.totalFiles = mdFiles.length;

  for (const filePath of mdFiles) {
    const rel = relative(rootDir, filePath);
    const source = readFileSync(filePath, 'utf8');
    const { format, data } = parseFrontmatter(source);

    if (format === 'toml') result.tomlFiles.push(rel);

    if (!data.title) result.missingTitle.push(rel);
    if (!data.date) result.missingDate.push(rel);
    if (!data.description) result.missingDescription.push(rel);
    if (!data.tags || !Array.isArray(data.tags) || data.tags.length === 0) {
      result.missingTags.push(rel);
    }

    // Field-level validation (only when present)
    if (data.title && String(data.title).length > TITLE_MAX) {
      result.titleTooLong.push(rel);
    }
    if (data.description) {
      const len = String(data.description).length;
      if (len < DESCRIPTION_MIN) result.descriptionTooShort.push(rel);
      if (len > DESCRIPTION_MAX) result.descriptionTooLong.push(rel);
    }
    if (Array.isArray(data.tags)) {
      if (data.tags.length === 0) result.tagsEmpty.push(rel);
      if (data.tags.length > TAGS_MAX) result.tagsTooMany.push(rel);
    }

    // Triple-missing
    if (!data.date && !data.description && (!data.tags || data.tags.length === 0)) {
      result.allThreeMissing.push(rel);
    }
  }

  const missingSet = new Set([
    ...result.missingTitle,
    ...result.missingDate,
    ...result.missingDescription,
    ...result.missingTags,
  ]);
  result.atLeastOneMissing = missingSet.size;

  return result;
}

export function formatReport(r) {
  const lines = [
    '# Frontmatter Audit Report',
    `- 生成时间: ${new Date().toISOString()}`,
    `- 总文章: ${r.totalFiles} · 至少缺一项: ${r.atLeastOneMissing}`,
    '',
    `## 缺 title (${r.missingTitle.length})`,
    ...r.missingTitle.map(p => `- ${p}`),
    '',
    `## 缺 date (${r.missingDate.length})`,
    ...r.missingDate.map(p => `- ${p}`),
    '',
    `## 缺 description (${r.missingDescription.length})`,
    ...r.missingDescription.map(p => `- ${p}`),
    '',
    `## 缺 tags (${r.missingTags.length})`,
    ...r.missingTags.map(p => `- ${p}`),
    '',
    `## 前缀未统一为 --- (${r.tomlFiles.length})`,
    ...r.tomlFiles.map(p => `- ${p}`),
    '',
    `## 三项都缺 (${r.allThreeMissing.length})`,
    ...r.allThreeMissing.map(p => `- ${p}`),
    '',
    '## 字段异常',
    `- title 超 ${TITLE_MAX} 字符: ${r.titleTooLong.length} 篇`,
    `- description 不足 ${DESCRIPTION_MIN} 字符: ${r.descriptionTooShort.length} 篇`,
    `- description 超 ${DESCRIPTION_MAX} 字符: ${r.descriptionTooLong.length} 篇`,
    `- tags 数量 0: ${r.tagsEmpty.length} 篇`,
    `- tags 数量 > ${TAGS_MAX}: ${r.tagsTooMany.length} 篇`,
  ];
  return lines.join('\n') + '\n';
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
