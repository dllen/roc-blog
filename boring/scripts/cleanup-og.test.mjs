import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, 'cleanup-og.mjs');

test('cleanup-og: removes orphan PNGs not matching any current slug', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cleanup-'));
  const contentDir = join(tmp, 'content');
  const ogDir = join(tmp, 'og');
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(ogDir, { recursive: true });

  writeFileSync(join(contentDir, 'keep-1.md'), '---\ntitle: K1\n---\n');
  writeFileSync(join(contentDir, 'keep-2.md'), '---\ntitle: K2\n---\n');
  // OG files: 2 keep + 3 orphans
  writeFileSync(join(ogDir, 'keep-1.png'), 'x');
  writeFileSync(join(ogDir, 'keep-2.png'), 'x');
  writeFileSync(join(ogDir, 'orphan-1.png'), 'x');
  writeFileSync(join(ogDir, 'orphan-2.png'), 'x');
  writeFileSync(join(ogDir, 'orphan-3.png'), 'x');

  const r = spawnSync('node', [scriptPath, contentDir, '--out', ogDir], { encoding: 'utf8' });
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);

  assert.ok(existsSync(join(ogDir, 'keep-1.png')), 'keep-1 should remain');
  assert.ok(existsSync(join(ogDir, 'keep-2.png')), 'keep-2 should remain');
  assert.ok(!existsSync(join(ogDir, 'orphan-1.png')), 'orphan-1 removed');
  assert.ok(!existsSync(join(ogDir, 'orphan-2.png')), 'orphan-2 removed');
  assert.ok(!existsSync(join(ogDir, 'orphan-3.png')), 'orphan-3 removed');

  rmSync(tmp, { recursive: true });
});

test('cleanup-og: --dry-run does not delete', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'cleanup-'));
  const contentDir = join(tmp, 'content');
  const ogDir = join(tmp, 'og');
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(ogDir, { recursive: true });
  writeFileSync(join(contentDir, 'keep.md'), '---\ntitle: K\n---\n');
  writeFileSync(join(ogDir, 'keep.png'), 'x');
  writeFileSync(join(ogDir, 'orphan.png'), 'x');

  const r = spawnSync('node', [scriptPath, contentDir, '--out', ogDir, '--dry-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(ogDir, 'orphan.png')), 'dry-run should not delete');
  rmSync(tmp, { recursive: true });
});
