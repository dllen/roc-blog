import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, 'audit-frontmatter.mjs');
const fixturesDir = resolve(__dirname, 'lib/__fixtures__');

function runScript(args, cwd) {
  return spawnSync('node', [scriptPath, ...args], { cwd, encoding: 'utf8' });
}

test('audit CLI: writes report to _audit/ and exits 0 on no missing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-'));
  const inputDir = resolve(fixturesDir, 'audit-full');
  const outDir = join(tmp, '_audit');
  const r = runScript([inputDir, '--out', outDir]);
  assert.equal(r.status, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const report = readFileSync(join(outDir, 'frontmatter-audit.md'), 'utf8');
  assert.match(report, /总文章: 1/);
  rmSync(tmp, { recursive: true });
});

test('audit CLI: exits 1 when any required field missing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'audit-'));
  const inputDir = resolve(fixturesDir, 'audit-missing');
  const outDir = join(tmp, '_audit');
  const r = runScript([inputDir, '--out', outDir]);
  assert.equal(r.status, 1, 'expected exit 1');
  assert.match(r.stdout, /missing=2/);
  const report = readFileSync(join(outDir, 'frontmatter-audit.md'), 'utf8');
  assert.match(report, /至少缺一项: 2/);
  rmSync(tmp, { recursive: true });
});
