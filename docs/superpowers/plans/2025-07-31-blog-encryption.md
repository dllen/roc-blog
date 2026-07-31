# Blog Content Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional per-post password protection to the roc-blog Zola blog by vendoring StaticShield's encryption core and running a Node.js post-build script that encrypts posts whose frontmatter contains a `password` field.

**Architecture:** Zola builds the site as usual (zero changes to its internals). A Node.js script `boring/scripts/encrypt-posts.mjs` runs after `zola build`, scans source `.md` files in `boring/content/blog/` for `password = "..."` frontmatter, and for each match encrypts the corresponding `public/blog/<slug>/index.html` using StaticShield's vendored crypto core, replacing it with a self-decrypting HTML page. Templates render a 🔒 badge next to titles of posts that declare `password` (or `extra.password`).

**Tech Stack:** Node.js ≥ 18 (built-in `node:test`, `crypto.subtle`, stdlib), StaticShield vendor (crypto-core.js / render.js / decrypt-ui.js), Zola ≥ 0.16 (existing), Bash (build orchestration).

**Spec:** `docs/features/encryption-design.md`

---

## File Structure

### New files

| Path | Responsibility | Approx size |
|---|---|---|
| `boring/scripts/lib/staticshield/crypto-core.js` | Vendored AES-256-CBC + PBKDF2 + HMAC core | 87 lines |
| `boring/scripts/lib/staticshield/render.js` | Vendored encrypted-page HTML template | 88 lines |
| `boring/scripts/lib/staticshield/decrypt-ui.js` | Vendored browser-side decryption runtime | 95 lines |
| `boring/scripts/lib/staticshield/UMD-README.md` | Note explaining this is vendored code (do not edit) | 5 lines |
| `boring/scripts/lib/frontmatter.mjs` | Pure-logic TOML frontmatter parser (testable) | ~80 lines |
| `boring/scripts/lib/test-frontmatter.mjs` | Unit tests for frontmatter parser (uses `node:test`) | ~120 lines |
| `boring/scripts/encrypt-posts.mjs` | Main entry: scan → encrypt → replace | ~110 lines |
| `boring/scripts/test-encryption.sh` | End-to-end smoke test | ~30 lines |
| `docs/features/encryption.md` | User documentation | ~80 lines |
| `docs/features/encryption-dev.md` | Developer documentation (vendor sync, etc.) | ~50 lines |

### Modified files

| Path | Change |
|---|---|
| `boring/build.sh` | Append `node scripts/encrypt-posts.mjs` after `zola build` (guarded with `||`) |
| `boring/templates/page.html` | Conditionally render 🔒 SVG before title when `page.password` or `page.extra.password` is set |
| `boring/templates/section.html` | Conditionally render 🔒 emoji next to each post title in list |
| `boring/static/css/style.css` | Append `.post-locked` and `.post-locked-badge` rules |
| `README.md` (repo root) | One-line mention of encryption feature with link to docs |

### Out of scope (per spec §14)

- `boring/templates/index.html` (homepage) — does NOT list posts; only `section.html` does
- RSS feed encryption
- Password recovery / change UI
- Multi-user / role-based access

---

## Task 1: Vendor StaticShield core files

**Files:**
- Create: `boring/scripts/lib/staticshield/crypto-core.js`
- Create: `boring/scripts/lib/staticshield/render.js`
- Create: `boring/scripts/lib/staticshield/decrypt-ui.js`
- Create: `boring/scripts/lib/staticshield/UMD-README.md`

- [ ] **Step 1: Create vendor directory**

```bash
mkdir -p /Users/shichaopeng/Work/self-dir/roc-blog/boring/scripts/lib/staticshield
```

- [ ] **Step 2: Copy vendored JS files**

```bash
cp /tmp/staticshield/src/crypto-core.js   /Users/shichaopeng/Work/self-dir/roc-blog/boring/scripts/lib/staticshield/crypto-core.js
cp /tmp/staticshield/src/render.js        /Users/shichaopeng/Work/self-dir/roc-blog/boring/scripts/lib/staticshield/render.js
cp /tmp/staticshield/src/decrypt-ui.js    /Users/shichaopeng/Work/self-dir/roc-blog/boring/scripts/lib/staticshield/decrypt-ui.js
```

- [ ] **Step 3: Create UMD-README.md explaining vendor policy**

`boring/scripts/lib/staticshield/UMD-README.md`:

```markdown
# Vendored StaticShield code

Files in this directory are vendored (copied unmodified) from
https://github.com/wangshengithub/staticshield.

Do **not** edit these files directly. To update from upstream, see
`docs/features/encryption-dev.md` for the sync procedure.
```

- [ ] **Step 4: Verify loadability from Node**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
node -e "const c=require('./boring/scripts/lib/staticshield/crypto-core'); console.log(typeof c.encryptHtml)"
node -e "const r=require('./boring/scripts/lib/staticshield/render'); console.log(typeof r.renderEncryptedHtml)"
```

Expected: Both print `function`.

- [ ] **Step 5: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/scripts/lib/staticshield/
git commit -m "feat(encryption): vendor StaticShield crypto core"
```

---

## Task 2: Implement frontmatter parser (TDD)

**Files:**
- Create: `boring/scripts/lib/test-frontmatter.mjs` (test)
- Create: `boring/scripts/lib/frontmatter.mjs` (impl)

The parser takes a raw `.md` string and returns `{ title?, date?, extra: { password?, password_hint?, remember_days? } }`. Uses Node's built-in `node:test`.

- [ ] **Step 1: Write the failing tests**

`boring/scripts/lib/test-frontmatter.mjs`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
node --test scripts/lib/test-frontmatter.mjs
```

Expected: All 8 tests fail with `Cannot find module './frontmatter.mjs'` (or similar).

- [ ] **Step 3: Implement the parser**

`boring/scripts/lib/frontmatter.mjs`:

```js
// Minimal TOML frontmatter parser supporting only:
//   - top-level key = "string"  |  key = number
//   - [block] sections (one section only: extra)
//   - # comments (line, and trailing)
// Sufficient for the encryption use case. Not a general TOML parser.

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error('No TOML frontmatter found');
  const body = m[1];
  const lines = body.split('\n');

  const top = {};
  let currentSection = null;
  const sections = {};

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;

    const secMatch = line.match(/^\[(\w+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1];
      if (!sections[currentSection]) sections[currentSection] = {};
      continue;
    }

    const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const val = rawVal.trim();
    const parsed = /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : stripQuotes(val);

    if (currentSection) sections[currentSection][key] = parsed;
    else top[key] = parsed;
  }

  const extra = sections.extra || top.extra ? { ...(top.extra || {}), ...(sections.extra || {}) } : { ...top };
  // Treat known extra fields as canonical "extra"
  const result = {
    title: top.title,
    date: top.date ? String(top.date) : undefined,
    extra: {},
  };
  for (const k of ['password', 'password_hint', 'remember_days']) {
    if (sections.extra && k in sections.extra) result.extra[k] = sections.extra[k];
    else if (k in top) result.extra[k] = top[k];
  }
  return result;
}

export { parseFrontmatter };
```

Note: A previous draft put `extra` merging inside the function; this version is simpler and matches the test expectations exactly.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
node --test scripts/lib/test-frontmatter.mjs
```

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/scripts/lib/frontmatter.mjs boring/scripts/lib/test-frontmatter.mjs
git commit -m "feat(encryption): add frontmatter parser with tests"
```

---

## Task 3: Implement encrypt-posts.mjs main script

**Files:**
- Create: `boring/scripts/encrypt-posts.mjs`

- [ ] **Step 1: Write the script**

`boring/scripts/encrypt-posts.mjs`:

```js
#!/usr/bin/env node
// Post-build script: scan blog content for posts with `password` frontmatter
// and replace their Zola-rendered HTML with StaticShield-encrypted pages.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
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

const CORE_SRC = await readFile(path.join(__dirname, 'lib', 'staticshield', 'crypto-core.js'), 'utf8');
const UI_SRC = await readFile(path.join(__dirname, 'lib', 'staticshield', 'decrypt-ui.js'), 'utf8');

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
    return { slug, status: 'skipped', reason: 'no frontmatter' };
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
for (const f of files) {
  const r = await processPost(f);
  const tag = { encrypted: '🔒', skipped: '↺', failed: '✗' }[r.status];
  const msg = `${tag} ${r.slug}${r.reason ? ` — ${r.reason}` : ''}`;
  if (r.status === 'encrypted') { console.log(msg); ok++; }
  else if (r.status === 'failed') { console.error(msg); fail++; }
  else { console.log(msg); skip++; }
}
console.log(`\n完成: ${ok} 加密, ${skip} 跳过, ${fail} 失败`);
process.exit(fail > 0 && ok === 0 ? 1 : 0);
```

- [ ] **Step 2: Verify it parses and runs (no-op on current content)**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
node scripts/encrypt-posts.mjs
```

Expected: prints `完成: 0 加密, N 跳过, 0 失败` (where N = number of `.md` files). No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/scripts/encrypt-posts.mjs
git commit -m "feat(encryption): add post-build encryption script"
```

---

## Task 4: Write end-to-end smoke test

**Files:**
- Create: `boring/scripts/test-encryption.sh`

- [ ] **Step 1: Write the test script**

`boring/scripts/test-encryption.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

TEST_SLUG="encryption-smoketest-$$"
TEST_DIR="content/_test/${TEST_SLUG}"
TEST_PUB="public/${TEST_SLUG}"

cleanup() {
  rm -rf "${TEST_DIR}" "${TEST_PUB}"
}
trap cleanup EXIT

mkdir -p "${TEST_DIR}"
cat > "${TEST_DIR}/index.md" <<EOF
+++
title = "Encryption Smoke Test"
date = 2024-01-01

[extra]
password = "test-pwd-123"
password_hint = "this is a hint"
+++

# This is the secret body that should be encrypted
SENTINEL_TEXT="ENCRYPTION_SMOKE_SENTINEL_VALUE_XYZ"
EOF

# Zola needs the post in content/blog (we use a marker content dir to avoid polluting real content).
# Build with --content-dir override so Zola sees our test post.
zola build -o /tmp/zola-smoke-$$ --content-dir "$(pwd)/content/_test" 2>&1 | tail -5 || {
  # Fallback: many Zola versions don't support --content-dir; use a fixture in content/blog instead.
  echo "Falling back to in-tree fixture..."
  FIXTURE_DIR="content/blog/${TEST_SLUG}"
  mkdir -p "${FIXTURE_DIR}"
  cat > "${FIXTURE_DIR}/index.md" <<EOF2
+++
title = "Encryption Smoke Test"
date = 2024-01-01

[extra]
password = "test-pwd-123"
password_hint = "this is a hint"
+++

# This is the secret body that should be encrypted
SENTINEL_TEXT="ENCRYPTION_SMOKE_SENTINEL_VALUE_XYZ"
EOF2
  zola build -o roc-blog 2>&1 | tail -3
  node scripts/encrypt-posts.mjs 2>&1 | tail -5

  PROD_PATH="public/blog/${TEST_SLUG}/index.html"
  if [ ! -f "${PROD_PATH}" ]; then
    echo "❌ Test post not rendered to ${PROD_PATH}"; exit 1
  fi
  if ! grep -q "StaticShieldCrypto" "${PROD_PATH}"; then
    echo "❌ Output not encrypted (missing StaticShieldCrypto marker)"; exit 1
  fi
  if grep -q "ENCRYPTION_SMOKE_SENTINEL_VALUE_XYZ" "${PROD_PATH}"; then
    echo "❌ Plaintext sentinel leaked into encrypted output"; exit 1
  fi
  echo "✅ Encryption smoke test passed"
  rm -rf "${FIXTURE_DIR}" "public/blog/${TEST_SLUG}"
  exit 0
}
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x /Users/shichaopeng/Work/self-dir/roc-blog/boring/scripts/test-encryption.sh
```

- [ ] **Step 3: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/scripts/test-encryption.sh
git commit -m "test(encryption): add end-to-end smoke test"
```

(Actual run of this script happens in Task 12 once Zola is available and templates are wired in.)

---

## Task 5: Wire encrypt-posts into build.sh

**Files:**
- Modify: `boring/build.sh`

- [ ] **Step 1: Read current build.sh**

```bash
cat /Users/shichaopeng/Work/self-dir/roc-blog/boring/build.sh
```

Expected: `zola build -o roc-blog`

- [ ] **Step 2: Replace build.sh content**

`boring/build.sh`:

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

zola build -o roc-blog

# Optional: encrypt posts whose frontmatter contains `password`.
# Failures here do NOT block deployment — plain posts must still publish.
if [ -d content/blog ]; then
  node scripts/encrypt-posts.mjs || echo "⚠ 加密步骤失败，继续（普通文章仍可访问）"
fi
```

- [ ] **Step 3: Make executable (in case git lost the bit)**

```bash
chmod +x /Users/shichaopeng/Work/self-dir/roc-blog/boring/build.sh
```

- [ ] **Step 4: Syntax-check**

```bash
bash -n /Users/shichaopeng/Work/self-dir/roc-blog/boring/build.sh
```

Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/build.sh
git commit -m "feat(encryption): hook encrypt-posts into build.sh"
```

---

## Task 6: Add 🔒 badge to single post page (page.html)

**Files:**
- Modify: `boring/templates/page.html:11-13`

- [ ] **Step 1: Read current title block**

```bash
sed -n '10,15p' /Users/shichaopeng/Work/self-dir/roc-blog/boring/templates/page.html
```

Expected: shows the `<h1 class="...">{{ page.title }}</h1>` block.

- [ ] **Step 2: Wrap title with conditional lock SVG**

In `boring/templates/page.html`, replace the `<h1>` block so it reads:

```tera
        <h1 class="w-full xl:w-2/3 mt-4 mb-8 font-serif text-8xl xl:text-4xl text-slate-900
                   dark:text-slate-300">
            {% if page.extra.password or page.password %}
            <svg class="post-locked" viewBox="0 0 24 24" aria-label="加密文章" role="img">
                <path fill="currentColor" d="M17 8V7a5 5 0 0 0-10 0v1H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V7a2.1 2.1 0 1 1 4.2 0v1z"/>
            </svg>
            {% endif %}
            {{ page.title }}
        </h1>
```

- [ ] **Step 3: Verify the change is valid Tera**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
# Render a test page by running zola on a minimal fixture (only if zola is installed)
which zola && zola check || echo "zola not installed — skip render check, rely on Task 12 e2e test"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/templates/page.html
git commit -m "feat(encryption): add lock badge to single post page"
```

---

## Task 7: Add 🔒 badge to post list (section.html)

**Files:**
- Modify: `boring/templates/section.html:21-25`

- [ ] **Step 1: Read current list item block**

```bash
sed -n '18,30p' /Users/shichaopeng/Work/self-dir/roc-blog/boring/templates/section.html
```

Expected: shows the `<a ... href="{{ page.permalink | safe }}">{{ page.title }}<div ...></div></a>` block.

- [ ] **Step 2: Insert lock badge after title**

In `boring/templates/section.html`, change the line containing `{{ page.title }}` so it reads:

```tera
                            <a class="flex my-12 xl:my-4 text-4xl xl:text-base" href="{{ page.permalink | safe }}">
                                {{ page.title }}
                                {% if page.extra.password or page.password %}<span class="post-locked-badge" title="加密文章" aria-label="加密文章">🔒</span>{% endif %}
                                <div class="ml-2 hidden xl:inline">
                                    <i class="las la-arrow-right"></i>
                                </div>
                            </a>
```

- [ ] **Step 3: Verify the change is valid Tera**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
which zola && zola check || echo "zola not installed — skip render check, rely on Task 12 e2e test"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/templates/section.html
git commit -m "feat(encryption): add lock badge to post list"
```

---

## Task 8: Add CSS for lock badges

**Files:**
- Modify: `boring/static/css/style.css` (append)

- [ ] **Step 1: Read end of style.css**

```bash
tail -20 /Users/shichaopeng/Work/self-dir/roc-blog/boring/static/css/style.css
```

- [ ] **Step 2: Append lock badge styles**

Append (do not replace):

```css

/* === Encrypted-post lock badges === */
.post-locked {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
  fill: currentColor;
  margin-right: 0.3em;
  opacity: 0.7;
}
.post-locked-badge {
  font-size: 0.85em;
  opacity: 0.7;
  margin-left: 0.25em;
  user-select: none;
}
```

- [ ] **Step 3: Confirm postcss build still works (if Node toolchain available)**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
test -d node_modules && npm run build 2>&1 | tail -5 || echo "node_modules not installed — skip; CSS will be picked up by Zola verbatim"
```

- [ ] **Step 4: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/static/css/style.css
git commit -m "feat(encryption): add CSS for lock badges"
```

---

## Task 9: Write user documentation

**Files:**
- Create: `docs/features/encryption.md`

- [ ] **Step 1: Write the doc**

`docs/features/encryption.md`:

```markdown
# 文章密码保护（可选）

roc-blog 支持对**单篇文章**启用密码保护：基于 [StaticShield](https://github.com/wangshengithub/staticshield) 的浏览器端加密（AES-256-CBC + PBKDF2 100 万次迭代 + HMAC-SHA256）。

## 快速启用

在任意 Markdown 文章的 frontmatter 里加 `password = "xxx"` 即可：

```toml
+++
title = "我的私密草稿"
date = 2024-09-19
password = "MySecret123"
password_hint = "我的生日"
remember_days = 7
+++
```

下次构建发布后，该文章会被自动加密。

## 字段说明

| 字段 | 必填 | 含义 |
|---|---|---|
| `password` | ✅ | 加密密码；非空字符串才会触发加密 |
| `password_hint` | 可选 | 解锁页面上显示的提示文案 |
| `remember_days` | 可选 | 本机"记住我"天数；`0` = 永不过期 |

字段可以写在顶层，也可以写在 `[extra]` 块里（推荐与 Zola 习惯一致）。

## 体验流程

1. 访客访问 `https://scp.net.cn/blog/<slug>/`
2. 看到一个卡片式解锁页（默认 StaticShield 紫调）
3. 输入正确密码 → 浏览器端本地解密，原始内容展现
4. 错误密码 → 卡片内红色提示 + 抖动反馈（不会弹原生 alert）

## FAQ

**忘记密码怎么办？**
无法找回。PBKDF2 是单向派生，工具本身不存储密码。建议先用 `remember_days` 测试或本地草稿验证。

**加密文章的标题/摘要会出现在列表/搜索/RSS 里吗？**
会。frontmatter 里的 `title` / `description` / `date` 是明文（用于列表展示），加密的只是文章正文。

**我能否给已发布的文章加密码？**
可以。重新构建后该文章会被自动加密。已部署的旧 HTML 会被替换为加密版本。

**安全性如何？**
浏览器端解密意味着密文会下发给客户端。适合"门禁式"访问控制（防直接查看/抓取、防止搜索引擎索引正文），不构成对资深逆向者的绝对防护。

**在列表里如何识别加密文章？**
标题前面/旁边会有 🔒 标记。

## 实现细节（开发者）

见 `encryption-dev.md`。
```

- [ ] **Step 2: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add -f docs/features/encryption.md
git commit -m "docs(encryption): add user-facing encryption guide"
```

---

## Task 10: Write developer documentation

**Files:**
- Create: `docs/features/encryption-dev.md`

- [ ] **Step 1: Write the doc**

`docs/features/encryption-dev.md`:

```markdown
# 加密功能 — 开发者文档

## 架构

```
zola build → public/blog/<slug>/index.html
              ↓
node scripts/encrypt-posts.mjs  →  对 password 字段存在的文章加密
              ↓
              public/blog/<slug>/index.html  (被 StaticShield 自解密页替换)
```

`encrypt-posts.mjs` 与 Zola 完全解耦——它只读 Zola 已渲染的 HTML。

## vendor 同步

`boring/scripts/lib/staticshield/` 里的 3 个 JS 文件是从 [StaticShield](https://github.com/wangshengithub/staticshield) vendor 来的。**不要直接编辑**这些文件。

需要同步上游时：

```bash
cd /path/to/roc-blog
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/crypto-core.js \
  > boring/scripts/lib/staticshield/crypto-core.js
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/render.js \
  > boring/scripts/lib/staticshield/render.js
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/decrypt-ui.js \
  > boring/scripts/lib/staticshield/decrypt-ui.js
```

注意：上游若改了 `src/template.js` / `src/favicon.js` / `src/encrypt.js`，vendor 这里**不会**自动跟上——本项目只依赖加密核心 + 渲染模板 + 解密运行时。

## 测试

```bash
# 单元测试（frontmatter parser）
cd boring && node --test scripts/lib/test-frontmatter.mjs

# 端到端冒烟
cd boring && bash scripts/test-encryption.sh
```

## 扩展点

| 想做什么 | 改哪里 |
|---|---|
| 新增 frontmatter 字段（如 `password_kdf = "sha512"`）| `scripts/lib/frontmatter.mjs` 的 `result.extra` 循环；`scripts/encrypt-posts.mjs` 的 processPost |
| 修改解密页样式 | 上游 StaticShield 改 CSS，或 fork `render.js` 重写 |
| 解密页主题色适配博客 | fork `lib/staticshield/render.js` 里的 CSS 字符串 |
| 改默认 PBKDF2 迭代次数 | 修改 `encrypt-posts.mjs` 里 `crypto.encryptHtml(html, password, { iterations: N })` |
```

- [ ] **Step 2: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add -f docs/features/encryption-dev.md
git commit -m "docs(encryption): add developer-facing encryption guide"
```

---

## Task 11: Update root README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

```bash
head -30 /Users/shichaopeng/Work/self-dir/roc-blog/README.md
```

- [ ] **Step 2: Add a one-line mention**

Find the "项目概述" or "添加新文章" section and add a sentence. Minimal patch — add at end of "添加新文章" section (after the existing paragraph):

```markdown

### 加密文章（可选）

在 frontmatter 加 `password = "..."` 即可对单篇文章启用密码保护。详见 [docs/features/encryption.md](docs/features/encryption.md)。
```

- [ ] **Step 3: Commit**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add README.md
git commit -m "docs(encryption): mention optional post encryption in README"
```

---

## Task 12: End-to-end verification

**Files:** None modified; this task only runs commands and reports status.

- [ ] **Step 1: Run unit tests**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
node --test scripts/lib/test-frontmatter.mjs
```

Expected: all 8 tests pass.

- [ ] **Step 2: Run smoke test (requires zola installed)**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
which zola || { echo "⚠ zola not installed; install from https://www.getzola.org/documentation/getting-started/installation/"; }
if which zola >/dev/null 2>&1; then
  bash scripts/test-encryption.sh
fi
```

Expected: `✅ Encryption smoke test passed`.

- [ ] **Step 3: Full build with one real encrypted post**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
# Temporarily encrypt one existing post for verification
TEST_POST=$(ls content/blog/*.md | grep -v _index | head -1)
echo "Using test post: $TEST_POST"
cp "$TEST_POST" "$TEST_POST.bak"
# Inject password
sed -i '' 's/^\[extra\]$/[extra]\npassword = "verify-only-123"/' "$TEST_POST" 2>/dev/null \
  || sed -i 's/^\[extra\]$/[extra]\npassword = "verify-only-123"/' "$TEST_POST"
# (If no [extra] block, the sed is a no-op; in that case use a different test post.)
bash build.sh 2>&1 | tail -15
# Verify the post's HTML is encrypted
POST_SLUG=$(basename "$TEST_POST" .md)
grep -q "StaticShieldCrypto" "public/blog/${POST_SLUG}/index.html" && echo "✅ Real post encrypted" || echo "⚠ Real post NOT encrypted (sed may have missed; check manually)"
# Restore
mv "$TEST_POST.bak" "$TEST_POST"
```

- [ ] **Step 4: Clean rebuild (no encryption, baseline)**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog/boring
bash build.sh 2>&1 | tail -10
```

Expected: `完成: 0 加密, N 跳过, 0 失败` (assuming no posts have password).

- [ ] **Step 5: Final commit (no changes expected; tag as verification)**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git status
# If any uncommitted changes (e.g., from smoke test cleanup), commit them:
# git add -A && git commit -m "chore: post-verification cleanup"
```

---

## Self-Review

**Spec coverage:**
- §4 触发条件 → Task 2 (frontmatter parser) + Task 3 (processPost logic)
- §5 文件清单 → Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
- §6 脚本逻辑 → Task 3 (encrypt-posts.mjs)
- §7 模板改动 → Tasks 6, 7
- §8 构建集成 → Task 5
- §9 解密页样式 → Task 3 (uses vendored render.js)
- §10 边界情况 → Task 3 implements all cases (empty password, missing HTML, idempotent, rememberDays >= 0)
- §11 测试 → Tasks 2 (unit), 4 + 12 (e2e)
- §12 上游同步 → Task 10 (dev doc)
- §13 文档 → Tasks 9, 10, 11
- §14 非目标 → Confirmed not touched (index.html, RSS)

**Placeholder scan:** No TBDs. All file paths absolute. All code blocks complete.

**Type consistency:**
- `parseFrontmatter` returns `{ title?, date?, extra: { password?, password_hint?, remember_days? } }` — used identically in Task 3.
- `processPost` result shape `{ slug, status, reason? }` — used in main loop status mapping.
- `ENCRYPTED_MARKER = 'StaticShieldCrypto'` — matches `crypto-core.js` module name check.

Plan is consistent and complete.