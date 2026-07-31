import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from './frontmatter.mjs';

test('parses title and date from top-level TOML', () => {
  const md = `+++\ntitle = "Hello"\ndate = 2024-01-02\n+++\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.title, 'Hello');
  assert.equal(fm.date, '2024-01-02');
});

test('parses [extra] block with password', () => {
  const md = `+++\ntitle = "x"\n\n[extra]\npassword = "secret123"\n+++\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.extra.password, 'secret123');
});

test('falls back to top-level when no [extra] block', () => {
  const md = `+++\ntitle = "x"\npassword = "top123"\n+++\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.extra.password, 'top123');
});

test('[extra] overrides top-level when both present', () => {
  const md = `+++\ntitle = "x"\npassword = "top"\n\n[extra]\npassword = "extra"\n+++\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.extra.password, 'extra');
});

test('returns empty extra when no password present', () => {
  const md = `+++\ntitle = "x"\n+++\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.deepEqual(fm.extra, {});
});

test('parses password_hint and remember_days as number', () => {
  const md = `+++\ntitle = "x"\n\n[extra]\npassword = "p"\npassword_hint = "我的生日"\nremember_days = 7\n+++\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.extra.password, 'p');
  assert.equal(fm.extra.password_hint, '我的生日');
  assert.equal(fm.extra.remember_days, 7);
});

test('handles comments and blank lines inside frontmatter', () => {
  const md = `+++\n# this is a comment\ntitle = "x"\n\n# another comment\n[extra]\npassword = "p"  # trailing comment\n+++\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.extra.password, 'p');
});

test('throws when frontmatter delimiters are missing', () => {
  const md = `# Just a markdown heading\n\nbody`;
  assert.throws(() => parseFrontmatter(md), /frontmatter/i);
});