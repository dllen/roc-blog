// Pure audit logic. Returns a structured result that the CLI script formats.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFrontmatter } from './parse-frontmatter.mjs';

const TITLE_MAX = 80;
const DESCRIPTION_MIN = 80;
const DESCRIPTION_MAX = 160;
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

    if (data.title && String(data.title).length > TITLE_MAX) {
      result.titleTooLong.push(rel);
    }
    if (data.description && typeof data.description !== 'string') {
      data.description = String(data.description);
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
  }

  // Only title and date are required
  const missingSet = new Set([...result.missingTitle, ...result.missingDate]);
  result.atLeastOneMissing = missingSet.size;

  return result;
}

export function formatReport(r) {
  const lines = [
    '# Frontmatter Audit Report',
    `- 总文章: ${r.totalFiles} · 缺少必需项: ${r.atLeastOneMissing}`,
    '',
    `## 缺必需项: title (${r.missingTitle.length})`,
    ...r.missingTitle.map(p => `- ${p}`),
    '',
    `## 缺必需项: date (${r.missingDate.length})`,
    ...r.missingDate.map(p => `- ${p}`),
    '',
    `## 缺推荐项: description (${r.missingDescription.length})`,
    ...r.missingDescription.map(p => `- ${p}`),
    '',
    `## 缺推荐项: tags (${r.missingTags.length})`,
    ...r.missingTags.map(p => `- ${p}`),
    '',
    `## 格式异常`,
    `- title 超 ${TITLE_MAX} 字符: ${r.titleTooLong.length}`,
    `- description 不足 ${DESCRIPTION_MIN} 字符: ${r.descriptionTooShort.length}`,
    `- description 超 ${DESCRIPTION_MAX} 字符: ${r.descriptionTooLong.length}`,
    `- tags 为空: ${r.tagsEmpty.length}`,
    `- tags > ${TAGS_MAX}: ${r.tagsTooMany.length}`,
    `- TOML 格式: ${r.tomlFiles.length}`,
  ];
  // Filter out list items that are zero (but keep summary line which has ·)
  return lines.filter(l => {
    if (l.startsWith('- ') && !l.includes('·') && /: 0\s*$/.test(l)) return false;
    return true;
  }).join('\n') + '\n';
}

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
