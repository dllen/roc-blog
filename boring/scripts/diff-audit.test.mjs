import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffReports, parseReportSummary } from './diff-audit.mjs';

test('parseReportSummary: extracts total and missing counts', () => {
  const md = `# Frontmatter Audit Report
- 生成时间: 2025-11-13
- 总文章: 277 · 至少缺一项: 137
`;
  const s = parseReportSummary(md);
  assert.equal(s.total, 277);
  assert.equal(s.missing, 137);
});

test('diffReports: detects newly missing files', () => {
  const before = `# Frontmatter Audit Report
- 总文章: 10 · 至少缺一项: 2
## 缺 description (2)
- a.md
- b.md
`;
  const after = `# Frontmatter Audit Report
- 总文章: 10 · 至少缺一项: 3
## 缺 description (3)
- a.md
- b.md
- c.md
`;
  const diff = diffReports(before, after);
  assert.match(diff, /新增缺口 \(1 篇\)/);
  assert.match(diff, /c\.md/);
  assert.match(diff, /\+1/);
});

test('diffReports: detects fixed files', () => {
  const before = `# Frontmatter Audit Report
- 总文章: 10 · 至少缺一项: 3
## 缺 description (3)
- a.md
- b.md
- c.md
`;
  const after = `# Frontmatter Audit Report
- 总文章: 10 · 至少缺一项: 1
## 缺 description (1)
- a.md
`;
  const diff = diffReports(before, after);
  assert.match(diff, /已修复.*2 篇/);
  assert.match(diff, /b\.md/);
  assert.match(diff, /c\.md/);
});
