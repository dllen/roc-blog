import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, 'migrate-toml-to-yaml.mjs');

function run(args) {
  return spawnSync('node', [scriptPath, ...args], { encoding: 'utf8' });
}

function writeToml(dir, name, content) {
  writeFileSync(join(dir, name), content, 'utf8');
}

test('migrate: --dry-run reports would-change without writing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'migrate-'));
  writeToml(tmp, 'a.md', '+++\ntitle = "X"\n+++\n\nbody\n');
  const r = run([tmp, '--dry-run']);
  assert.equal(r.status, 0);
  const after = readFileSync(join(tmp, 'a.md'), 'utf8');
  assert.ok(after.startsWith('+++'), 'should not have written changes');
  assert.match(r.stdout, /dry-run: 1 changed/);
  assert.match(r.stdout, /would-change: a\.md/);
  rmSync(tmp, { recursive: true });
});

test('migrate: writes YAML for TOML files, leaves YAML alone', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'migrate-'));
  writeToml(tmp, 'a.md', '+++\ntitle = "X"\ndate = 2025-01-01\n+++\n\nbody\n');
  writeToml(tmp, 'b.md', '---\ntitle: "Y"\n---\n\nbody2\n');
  const r = run([tmp]);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const a = readFileSync(join(tmp, 'a.md'), 'utf8');
  const b = readFileSync(join(tmp, 'b.md'), 'utf8');
  assert.ok(a.startsWith('---'), 'a.md converted to YAML');
  assert.ok(b.startsWith('---'), 'b.md untouched');
  // "X" has no special chars, so yamlScalar leaves it unquoted (valid YAML)
  assert.match(a, /^title: "?X"?$/m);
  assert.match(a, /^date: 2025-01-01$/m);
  rmSync(tmp, { recursive: true });
});

test('migrate: preserves body content', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'migrate-'));
  const body = '\n# Heading\n\nParagraph with `code`.\n';
  writeToml(tmp, 'a.md', `+++\ntitle = "X"\n+++\n${body}`);
  run([tmp]);
  const a = readFileSync(join(tmp, 'a.md'), 'utf8');
  assert.ok(a.includes('# Heading'));
  assert.ok(a.includes('Paragraph with `code`.'));
  rmSync(tmp, { recursive: true });
});
