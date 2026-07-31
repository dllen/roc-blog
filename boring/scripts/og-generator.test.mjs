import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, 'og-generator.mjs');

test('og-generator: writes PNG for fixture post and is idempotent', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'og-'));
  const contentDir = join(tmp, 'content');
  const ogDir = join(tmp, 'static', 'og');
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(ogDir, { recursive: true });
  writeFileSync(join(contentDir, 'sample.md'), `---
title: "Sample"
date: 2025-11-13
description: "Sample description for OG generation test sample description"
tags: ["T"]
---
body
`);

  // First run
  const r1 = spawnSync('node', [scriptPath, contentDir, '--out', ogDir], { encoding: 'utf8' });
  assert.equal(r1.status, 0, `stderr: ${r1.stderr}`);
  const pngPath = join(ogDir, 'sample.png');
  assert.ok(existsSync(pngPath), 'PNG should exist');
  const size1 = statSync(pngPath).size;
  assert.ok(size1 > 1000, 'PNG should be non-trivial size');

  // Second run: should be idempotent (mtime preserved if no change)
  const r2 = spawnSync('node', [scriptPath, contentDir, '--out', ogDir], { encoding: 'utf8' });
  assert.equal(r2.status, 0);
  const size2 = statSync(pngPath).size;
  assert.equal(size1, size2, 'idempotent: PNG should not change');

  rmSync(tmp, { recursive: true });
});
