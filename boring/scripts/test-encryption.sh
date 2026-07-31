#!/usr/bin/env bash
# End-to-end smoke test for the encryption feature.
#
# Uses a self-contained temporary Zola project (not the real blog, which
# may contain unrelated .md files that break zola's frontmatter check).
# Verifies:
#   1. zola build produces HTML for a fixture post
#   2. encrypt-posts.mjs encrypts it (StaticShieldCrypto marker present)
#   3. Plaintext sentinel does not leak
#   4. Re-run is idempotent (skips already-encrypted)
#
# Skips gracefully with a clear message if zola is not on PATH;
# unit tests in scripts/lib/test-frontmatter.mjs cover the script logic
# regardless.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v zola >/dev/null 2>&1; then
  echo "⚠ zola not installed — skipping end-to-end smoke test."
  echo "  Unit tests for the parser are in scripts/lib/test-frontmatter.mjs"
  echo "  Install zola from https://www.getzola.org/documentation/getting-started/installation/"
  exit 0
fi

SLUG="smoke"
SENTINEL="SMOKE_SENTINEL_$$_XYZ"
PASS_PWD="smoke-test-password"
TMPROOT=$(mktemp -d)
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

# Build a minimal Zola project
mkdir -p "$TMPROOT/blog/content/blog/$SLUG"
mkdir -p "$TMPROOT/blog/templates"
mkdir -p "$TMPROOT/blog/static"
mkdir -p "$TMPROOT/blog/scripts/lib/staticshield"

# Copy vendored StaticShield into the temp project
cp scripts/lib/staticshield/*.js "$TMPROOT/blog/scripts/lib/staticshield/"
cp scripts/lib/frontmatter.mjs "$TMPROOT/blog/scripts/lib/"
cp scripts/encrypt-posts.mjs "$TMPROOT/blog/scripts/"
chmod +x "$TMPROOT/blog/scripts/encrypt-posts.mjs"

cat > "$TMPROOT/blog/config.toml" <<EOF
base_url = "https://example.com"
title = "Smoke"
description = "smoke"

[markdown]
render_emoji = false
smart_punctuation = false
EOF

cat > "$TMPROOT/blog/content/blog/${SLUG}.md" <<EOF
+++
title = "Smoke Post"
date = 2024-01-01

[extra]
password = "$PASS_PWD"
password_hint = "smoke hint"
+++

# Sentinel body
SENTINEL_VALUE="$SENTINEL"
EOF

cat > "$TMPROOT/blog/templates/page.html" <<EOF
<!doctype html><html><body><h1>{{ page.title }}</h1>{{ page.content | safe }}</body></html>
EOF

cat > "$TMPROOT/blog/templates/section.html" <<EOF
<!doctype html><html><body><ul>{% for p in section.pages %}<li><a href="{{ p.permalink }}">{{ p.title }}</a></li>{% endfor %}</ul></body></html>
EOF

cat > "$TMPROOT/blog/templates/index.html" <<EOF
<!doctype html><html><body>{{ section.content | safe }}</body></html>
EOF

# Build
echo "→ Building minimal Zola project..."
(cd "$TMPROOT/blog" && zola build >/dev/null)

PROD_PATH="$TMPROOT/blog/public/blog/$SLUG/index.html"
if [ ! -f "$PROD_PATH" ]; then
  echo "❌ FAIL: $PROD_PATH not produced"
  exit 1
fi

# Verify pre-encryption state
if grep -q "StaticShieldCrypto" "$PROD_PATH"; then
  echo "❌ FAIL: StaticShieldCrypto already in zola output (unexpected)"
  exit 1
fi

# Encrypt
echo "→ Running encryption..."
(cd "$TMPROOT/blog" && node scripts/encrypt-posts.mjs 2>&1 | grep -E "smoke|完成")

# Verify post-encryption state
if ! grep -q "StaticShieldCrypto" "$PROD_PATH"; then
  echo "❌ FAIL: StaticShieldCrypto marker not in output (encryption did not happen)"
  exit 1
fi

if grep -q "$SENTINEL" "$PROD_PATH"; then
  echo "❌ FAIL: plaintext sentinel leaked into encrypted output"
  exit 1
fi

# Idempotency check
echo "→ Re-running encryption (idempotency)..."
(cd "$TMPROOT/blog" && node scripts/encrypt-posts.mjs 2>&1 | grep -q "already encrypted" \
  && echo "✅ Idempotent" \
  || { echo "❌ FAIL: second run did not detect already-encrypted state"; exit 1; })

# Functional check: verify the encrypted page actually contains decrypt-ui
if ! grep -q "SS_DATA" "$PROD_PATH"; then
  echo "❌ FAIL: encrypted page missing SS_DATA (decrypt runtime not embedded)"
  exit 1
fi

echo ""
echo "✅ Encryption smoke test passed"
echo "  - zola build produces HTML ✓"
echo "  - encrypt-posts.mjs encrypts the fixture ✓"
echo "  - sentinel plaintext absent from output ✓"
echo "  - StaticShieldCrypto + SS_DATA markers present ✓"
echo "  - idempotent on re-run ✓"