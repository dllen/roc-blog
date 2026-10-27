import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, 'build-home-index.mjs');

const FM = '---';

function makeSite() {
  const tmp = mkdtempSync(join(tmpdir(), 'home-index-'));
  const contentDir = join(tmp, 'content', 'blog');
  mkdirSync(join(contentDir, 'nested'), { recursive: true });

  writeFileSync(
    join(contentDir, 'top.md'),
    `${FM}\ntitle: Top post\ndate: 2026-01-02\ndescription: A top level post.\nextra:\n  update_date: 2026-02-03\ntaxonomies:\n  tags: ["Alpha", "Beta"]\n${FM}\n\n正文内容。\n`
  );
  writeFileSync(
    join(contentDir, 'nested', 'deep.md'),
    `${FM}\ntitle: Deep post\ndate: 2026-03-04\ndescription: A nested post.\nupdate_date: 2026-05-06\ntaxonomies:\n  tags: ["Beta"]\n${FM}\n\n更多正文。\n`
  );
  writeFileSync(join(contentDir, '_index.md'), `${FM}\ntitle: Blog\n${FM}\n`);
  writeFileSync(join(contentDir, 'nested', '_index.md'), `${FM}\ntitle: Nested section\n${FM}\n`);
  return { tmp, contentDir };
}

test('home-index: writes one entry per article, newest first', () => {
  const { tmp, contentDir } = makeSite();
  const out = join(tmp, 'home-index.json');

  const r = spawnSync('node', [scriptPath, '--content', contentDir, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  assert.ok(existsSync(out), 'index should be written');

  const entries = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(entries.length, 2, 'only the two articles, not the section indexes');

  assert.equal(entries[0].title, 'Deep post', 'newest date first');
  assert.equal(entries[1].title, 'Top post');

  rmSync(tmp, { recursive: true });
});

test('home-index: entries carry the permalink, dates, tags and topic a page carries', () => {
  const { tmp, contentDir } = makeSite();
  const out = join(tmp, 'home-index.json');

  spawnSync('node', [scriptPath, '--content', contentDir, '--out', out], { encoding: 'utf8' });
  const entries = JSON.parse(readFileSync(out, 'utf8'));

  const deep = entries.find((entry) => entry.title === 'Deep post');
  assert.equal(deep.permalink, '/blog/nested/deep/', 'nested permalink keeps the section');
  assert.equal(deep.date, '2026-03-04');
  assert.equal(deep.extra.update_date, '2026-05-06', 'update_date is kept for display');
  assert.deepEqual(deep.taxonomies.tags, ['Beta']);
  assert.equal(deep.section, 'nested');
  assert.equal(deep.topic, 'Nested section', 'the topic is the section title');
  assert.deepEqual(deep.components, ['blog', 'nested', 'deep']);
  assert.ok(deep.reading_time >= 1, 'a reading time is always present');

  const top = entries.find((entry) => entry.title === 'Top post');
  assert.equal(top.permalink, '/blog/top/', 'a top level post lives under /blog/');
  assert.equal(top.extra.update_date, '2026-02-03', 'extra.update_date is also honoured');
  assert.equal(top.section, '');
  assert.equal(top.topic, '', 'a top level post has no section topic');

  rmSync(tmp, { recursive: true });
});
