import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { copyFileSync, mkdirSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, 'inject-jsonld.mjs');
const fixturesDir = resolve(__dirname, 'lib/__fixtures__/templates');

test('inject-jsonld: adds jsonld block to base.html', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inject-'));
  mkdirSync(join(tmp, 'templates'));
  for (const f of ['base.html', 'page.html', 'index.html', 'section.html']) {
    copyFileSync(join(fixturesDir, f), join(tmp, 'templates', f));
  }

  const r = spawnSync('node', [scriptPath, join(tmp, 'templates')], { encoding: 'utf8' });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);

  const base = readFileSync(join(tmp, 'templates/base.html'), 'utf8');
  assert.ok(base.includes('{% block jsonld %}{% endblock %}'), 'base.html should have jsonld block');

  const page = readFileSync(join(tmp, 'templates/page.html'), 'utf8');
  assert.ok(page.includes('{% block jsonld %}'), 'page.html should have jsonld block');
  assert.ok(page.includes('BlogPosting'), 'page.html should reference BlogPosting');

  rmSync(tmp, { recursive: true });
});

test('inject-jsonld: idempotent (running twice = no change)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'inject-'));
  mkdirSync(join(tmp, 'templates'));
  for (const f of ['base.html', 'page.html', 'index.html', 'section.html']) {
    copyFileSync(join(fixturesDir, f), join(tmp, 'templates', f));
  }

  spawnSync('node', [scriptPath, join(tmp, 'templates')]);
  const before = readFileSync(join(tmp, 'templates/base.html'), 'utf8');
  spawnSync('node', [scriptPath, join(tmp, 'templates')]);
  const after = readFileSync(join(tmp, 'templates/base.html'), 'utf8');
  assert.equal(before, after, 'should be idempotent');
  rmSync(tmp, { recursive: true });
});
