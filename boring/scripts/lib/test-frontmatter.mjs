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

test('parses YAML frontmatter (---) with password', () => {
  const md = `---\ntitle: "Hello"\ndate: 2024-01-02\n---\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.title, 'Hello');
  assert.equal(fm.date, '2024-01-02');
});

test('parses YAML top-level password', () => {
  const md = `---\ntitle: "x"\npassword: "yaml-pwd"\n---\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.extra.password, 'yaml-pwd');
});

test('parses YAML nested extra block', () => {
  const md = `---\ntitle: "x"\nextra:\n  password: "nested-pwd"\n  password_hint: "yaml hint"\n  remember_days: 3\n---\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.extra.password, 'nested-pwd');
  assert.equal(fm.extra.password_hint, 'yaml hint');
  assert.equal(fm.extra.remember_days, 3);
});

test('handles YAML with unquoted values', () => {
  const md = `---\ntitle: Plain Title\npassword: mySecret\nremember_days: 14\n---\n\nbody`;
  const fm = parseFrontmatter(md);
  assert.equal(fm.title, 'Plain Title');
  assert.equal(fm.extra.password, 'mySecret');
  assert.equal(fm.extra.remember_days, 14);
});