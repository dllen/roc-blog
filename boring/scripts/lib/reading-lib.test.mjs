import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { findPrevNext, findRelated, fakeSection } from './reading-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '__fixtures__/reading');

test('fakeSection: builds section from .md files in directory', () => {
  const s = fakeSection(resolve(fixturesDir, 'spring'));
  assert.equal(s.pages.length, 3);
  assert.equal(s.title, 'spring');
});

test('findPrevNext: middle article has both prev and next', () => {
  const s = fakeSection(resolve(fixturesDir, 'spring'));
  const { prev, next } = findPrevNext(s, s.pages[1]);
  assert.equal(prev.title, 'Spring 1');
  assert.equal(next.title, 'Spring 3');
});

test('findPrevNext: first article has only next', () => {
  const s = fakeSection(resolve(fixturesDir, 'spring'));
  const { prev, next } = findPrevNext(s, s.pages[0]);
  assert.equal(prev, null);
  assert.equal(next.title, 'Spring 2');
});

test('findPrevNext: last article has only prev', () => {
  const s = fakeSection(resolve(fixturesDir, 'spring'));
  const { prev, next } = findPrevNext(s, s.pages[2]);
  assert.equal(prev.title, 'Spring 2');
  assert.equal(next, null);
});

test('findRelated: ranks by shared tag count, excludes self', () => {
  const allSections = [
    fakeSection(resolve(fixturesDir, 'spring')),
    fakeSection(resolve(fixturesDir, 'speech')),
  ];
  const current = allSections[0].pages[0]; // Spring 1, tags: [Spring, IoC]
  const related = findRelated(current, allSections, 3);
  assert.equal(related.length, 2);
  // Spring 2 (2024-12-15) and Spring 3 (2025-01-10) both share 'Spring' tag (1)
  // Date desc → Spring 3 first
  assert.equal(related[0].page.title, 'Spring 3');
  assert.equal(related[0].shared, 1);
  assert.equal(related[1].page.title, 'Spring 2');
  assert.equal(related[1].shared, 1);
});

test('findRelated: returns empty for no shared tags', () => {
  const current = {
    title: 'X',
    slug: 'x',
    taxonomies: { tags: ['unique'] },
  };
  const allSections = [fakeSection(resolve(fixturesDir, 'spring'))];
  const related = findRelated(current, allSections, 3);
  assert.equal(related.length, 0);
});
