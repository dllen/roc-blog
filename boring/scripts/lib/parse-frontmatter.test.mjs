import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseFrontmatter } from './parse-frontmatter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(__dirname, '__fixtures__/parse');
const read = name => readFileSync(resolve(fixtureDir, name), 'utf8');

test('parseFrontmatter: YAML full', () => {
  const r = parseFrontmatter(read('yaml-full.md'));
  assert.equal(r.format, 'yaml');
  assert.equal(r.data.title, '完整 YAML 测试');
  assert.equal(r.data.date, '2025-11-13T10:00:00+08:00');
  assert.equal(r.data.update_date, '2025-12-01');
  assert.equal(r.data.description, '这是一个完整 YAML frontmatter 的 fixture，用于测试所有字段解析');
  assert.deepEqual(r.data.tags, ['Spring', '源码', '测试']);
  assert.equal(r.data.series, 'Spring 源码解读');
  assert.equal(r.data.extra.original_url, 'https://example.com');
  assert.equal(r.body.trim(), '正文开始。');
});

test('parseFrontmatter: YAML minimal', () => {
  const r = parseFrontmatter(read('yaml-minimal.md'));
  assert.equal(r.format, 'yaml');
  assert.equal(r.data.title, '最小 YAML');
  assert.equal(r.body.trim(), '只有 title。');
});

test('parseFrontmatter: TOML full', () => {
  const r = parseFrontmatter(read('toml-full.md'));
  assert.equal(r.format, 'toml');
  assert.equal(r.data.title, '完整 TOML 测试');
  assert.equal(r.data.description, 'TOML 完整 frontmatter fixture');
  assert.equal(r.data.extra.original_url, 'https://example.com');
  assert.equal(r.body.trim(), '正文。');
});

test('parseFrontmatter: TOML minimal', () => {
  const r = parseFrontmatter(read('toml-minimal.md'));
  assert.equal(r.format, 'toml');
  assert.equal(r.data.title, '最小 TOML');
});

test('parseFrontmatter: malformed YAML returns warnings, not throw', () => {
  const r = parseFrontmatter(read('malformed.md'));
  assert.equal(r.format, 'yaml');
  assert.equal(r.data.title, '坏的');
  assert.ok(r.warnings.length > 0, 'should record warnings');
});

test('parseFrontmatter: no frontmatter returns empty data, full body', () => {
  const r = parseFrontmatter(read('no-frontmatter.md'));
  assert.equal(r.format, null);
  assert.deepEqual(r.data, {});
  assert.ok(r.body.includes('# 标题'));
});

test('parseFrontmatter: getField with fallback', () => {
  const r = parseFrontmatter(read('yaml-full.md'));
  assert.equal(r.data.title, '完整 YAML 测试');
  assert.equal(r.data.update_date, '2025-12-01');
});
