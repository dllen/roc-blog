#!/usr/bin/env node
// Post-build script: scan blog content for posts with `password` frontmatter
// and replace their Zola-rendered HTML with StaticShield-encrypted pages.
//
// Usage: node scripts/encrypt-posts.mjs
// Reads:  content/blog/*.md (frontmatter only — password / hint / remember_days)
// Writes: public/blog/<slug>/index.html (replaces Zola's output with encrypted page)
//
// Behavior:
//   - No `password` field           → skip (no-op, normal post)
//   - Empty `password = ""`         → skip (treat as not encrypted)
//   - Zola didn't render the slug   → warn and skip (draft? typo?)
//   - Output already contains StaticShieldCrypto → skip (idempotent re-run)
//   - remember_days < 0             → ignore the field (conservative)
//   - Any other error in one post   → log and continue (don't block others)

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from './lib/staticshield/crypto-core.js';
import render from './lib/staticshield/render.js';
import { parseFrontmatter } from './lib/frontmatter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const PUBLIC_DIR = path.join(ROOT, 'public', 'blog');

const CORE_SRC = await readFile(
  path.join(__dirname, 'lib', 'staticshield', 'crypto-core.js'), 'utf8'
);
const UI_SRC = await readFile(
  path.join(__dirname, 'lib', 'staticshield', 'decrypt-ui.js'), 'utf8'
);

// Marker left by StaticShield's renderEncryptedHtml — used for idempotency.
const ENCRYPTED_MARKER = 'StaticShieldCrypto';

async function findMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.md') && !e.name.startsWith('_'))
    .map(e => path.join(dir, e.name));
}

async function processPost(mdPath) {
  const slug = path.basename(mdPath, '.md');
  const md = await readFile(mdPath, 'utf8');

  let fm;
  try {
    fm = parseFrontmatter(md);
  } catch (e) {
    return { slug, status: 'skipped', reason: `frontmatter error: ${e.message}` };
  }

  const password = fm.extra.password;
  if (!password) return { slug, status: 'skipped', reason: 'no password field' };

  const htmlPath = path.join(PUBLIC_DIR, slug, 'index.html');
  if (!existsSync(htmlPath)) {
    return { slug, status: 'skipped', reason: 'zola did not render (draft?)' };
  }

  const html = await readFile(htmlPath, 'utf8');
  if (html.includes(ENCRYPTED_MARKER)) {
    return { slug, status: 'skipped', reason: 'already encrypted (idempotent)' };
  }

  try {
    const meta = await crypto.encryptHtml(html, password, { useSha512: false });
    // Decrypt page is its own gate; meta.title/logo intentionally empty
    // so the restored document's <title> (from the encrypted HTML) takes over.
    meta.title = '';
    meta.logo = '';
    if (fm.extra.password_hint) meta.hint = fm.extra.password_hint;
    if (fm.extra.remember_days != null && fm.extra.remember_days >= 0) {
      meta.rememberDays = fm.extra.remember_days;
    }
    const out = render.renderEncryptedHtml(meta, CORE_SRC, UI_SRC);
    await writeFile(htmlPath, out, 'utf8');
    return { slug, status: 'encrypted' };
  } catch (e) {
    return { slug, status: 'failed', reason: e.message };
  }
}

const files = await findMarkdownFiles(CONTENT_DIR);
let ok = 0, fail = 0, skip = 0;
const STATUS_TAG = { encrypted: '🔒', skipped: '↺', failed: '✗' };
for (const f of files) {
  const r = await processPost(f);
  const tag = STATUS_TAG[r.status];
  const msg = `${tag} ${r.slug}${r.reason ? ` — ${r.reason}` : ''}`;
  if (r.status === 'encrypted') { console.log(msg); ok++; }
  else if (r.status === 'failed') { console.error(msg); fail++; }
  else { console.log(msg); skip++; }
}
console.log(`\n完成: ${ok} 加密, ${skip} 跳过, ${fail} 失败`);

// Exit non-zero only if ALL posts failed (partial failure is tolerated).
process.exit(fail > 0 && ok === 0 ? 1 : 0);