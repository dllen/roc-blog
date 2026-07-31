import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const colors = JSON.parse(readFileSync(new URL('./og-colors.json', import.meta.url), 'utf8'));

test('og-colors: has fallback color', () => {
  assert.ok(colors._fallback, 'must have _fallback');
  assert.match(colors._fallback, /^#[0-9a-fA-F]{6}$/);
});

test('og-colors: all section colors are valid 6-digit hex', () => {
  const sections = Object.keys(colors).filter(k => !k.startsWith('_'));
  assert.ok(sections.length >= 10, `expected >= 10 sections, got ${sections.length}`);
  for (const s of sections) {
    assert.match(colors[s], /^#[0-9a-fA-F]{6}$/, `${s} has invalid color ${colors[s]}`);
  }
});

test('og-colors: required sections present', () => {
  const required = ['speech', 'spring', 'redis', 'kafka', 'flink', 'translate', 'sre', 'zookeeper'];
  for (const s of required) {
    assert.ok(colors[s], `missing required section ${s}`);
  }
});
