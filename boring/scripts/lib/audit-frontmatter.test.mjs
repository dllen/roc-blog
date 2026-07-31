import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { auditDirectory, formatReport } from './audit-frontmatter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '__fixtures__');

test('auditDirectory: full compliance', () => {
  const r = auditDirectory(resolve(fixturesDir, 'audit-full'));
  assert.equal(r.totalFiles, 1);
  assert.equal(r.missingDescription.length, 0);
  assert.equal(r.missingDate.length, 0);
  assert.equal(r.missingTags.length, 0);
  assert.equal(r.tomlFiles.length, 0);
  assert.equal(r.atLeastOneMissing, 0);
});

test('auditDirectory: missing fields detected', () => {
  const r = auditDirectory(resolve(fixturesDir, 'audit-missing'));
  assert.equal(r.totalFiles, 2);
  assert.equal(r.missingDate.length, 2, 'both posts missing date');
  assert.equal(r.missingDescription.length, 2, 'both missing description');
  assert.equal(r.missingTags.length, 1, 'post-2 has empty tags array, post-3 has 1 tag');
  assert.equal(r.atLeastOneMissing, 2);
});

test('formatReport: includes summary and per-field sections', () => {
  const r = auditDirectory(resolve(fixturesDir, 'audit-missing'));
  const md = formatReport(r);
  assert.match(md, /# Frontmatter Audit Report/);
  assert.match(md, /总文章: 2/);
  assert.match(md, /缺 description \(2\)/);
  assert.match(md, /缺 date \(2\)/);
});

test('formatReport: includes sample paths', () => {
  const r = auditDirectory(resolve(fixturesDir, 'audit-missing'));
  const md = formatReport(r);
  assert.ok(md.includes('post-2.md'), 'should list post-2.md path');
});
