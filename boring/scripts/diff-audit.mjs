// Pure diff logic for frontmatter audit reports.
// Compares two report strings, returns markdown diff highlighting new/fixed.
export function parseReportSummary(md) {
  const m = md.match(/总文章:\s*(\d+)\s*·\s*至少缺一项:\s*(\d+)/);
  if (!m) return { total: 0, missing: 0 };
  return { total: parseInt(m[1], 10), missing: parseInt(m[2], 10) };
}

function extractFileSet(md) {
  // Each file path appears after `- ` in section body
  const set = new Set();
  const lines = md.split('\n');
  for (const line of lines) {
    const m = line.match(/^-\s+(\S+\.md)$/);
    if (m) set.add(m[1]);
  }
  return set;
}

export function diffReports(before, after) {
  const beforeSet = extractFileSet(before);
  const afterSet = extractFileSet(after);
  const newMissing = [...afterSet].filter(f => !beforeSet.has(f)).sort();
  const fixed = [...beforeSet].filter(f => !afterSet.has(f)).sort();
  const sBefore = parseReportSummary(before);
  const sAfter = parseReportSummary(after);
  const delta = sAfter.missing - sBefore.missing;

  const lines = [
    '# Frontmatter Audit Diff',
    `- 上次: ${sBefore.total} 篇 / ${sBefore.missing} 缺`,
    `- 本次: ${sAfter.total} 篇 / ${sAfter.missing} 缺`,
    `- 缺口变化: ${delta >= 0 ? '+' : ''}${delta}`,
    '',
    `## 新增缺口 (${newMissing.length} 篇)`,
    ...newMissing.map(f => `- ${f}`),
    '',
    `## 已修复 (${fixed.length} 篇)`,
    ...fixed.map(f => `- ${f}`),
    '',
  ];
  return lines.join('\n');
}

// CLI: when invoked, fetch last main's audit artifact via `gh api` and diff.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const beforePath = args.find((a, i) => args[i - 1] === '--before');
  const afterPath = args.find((a, i) => args[i - 1] === '--after') || resolve('_audit/frontmatter-audit.md');

  let before;
  if (beforePath && existsSync(beforePath)) {
    before = readFileSync(beforePath, 'utf8');
  } else {
    // Try to fetch last main artifact
    try {
      const artifact = execSync(
        'gh api repos/:owner/:repo/actions/artifacts?per_page=100',
        { encoding: 'utf8' }
      );
      const j = JSON.parse(artifact);
      const a = j.artifacts.find(x => x.name === 'frontmatter-audit');
      if (a) {
        before = execSync(`gh api repos/:owner/:repo/actions/artifacts/${a.id}/zip`, { encoding: 'utf8' });
      }
    } catch (err) {
      console.log(`[diff-audit] no previous artifact found: ${err.message}`);
      process.exit(0);
    }
  }

  if (!before) {
    console.log('[diff-audit] no baseline to diff against; skipping');
    process.exit(0);
  }

  const after = readFileSync(afterPath, 'utf8');
  const diff = diffReports(before, after);
  const outPath = resolve('_audit/frontmatter-audit.diff.md');
  writeFileSync(outPath, diff, 'utf8');
  console.log(`[diff-audit] → ${outPath}`);
  process.exit(0);
}
