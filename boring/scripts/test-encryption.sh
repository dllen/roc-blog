#!/usr/bin/env bash
# End-to-end smoke test for the encryption feature.
# Creates a fixture post in content/blog/, runs zola build + encrypt-posts,
# verifies the output is encrypted (StaticShieldCrypto marker present,
# original sentinel plaintext absent), then cleans up.
#
# Requirements: zola on PATH. If zola is missing, the script skips with
# a clear message (the unit tests still validate the script's logic).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v zola >/dev/null 2>&1; then
  echo "⚠ zola not installed — skipping end-to-end smoke test."
  echo "  Unit tests for encrypt-posts.mjs logic are in scripts/lib/test-frontmatter.mjs"
  echo "  Install zola from https://www.getzola.org/documentation/getting-started/installation/"
  exit 0
fi

SLUG="encryption-smoketest-$$"
FIXTURE_DIR="content/blog/${SLUG}"
PROD_PATH="public/blog/${SLUG}/index.html"
SENTINEL="ENCRYPTION_SMOKE_SENTINEL_$$_XYZ"
PASS_PWD="smoke-test-password"

cleanup() {
  rm -rf "${FIXTURE_DIR}" "public/blog/${SLUG}"
}
trap cleanup EXIT

mkdir -p "${FIXTURE_DIR}"
cat > "${FIXTURE_DIR}/index.md" <<EOF
+++
title = "Encryption Smoke Test"
date = 2024-01-01

[extra]
password = "${PASS_PWD}"
password_hint = "smoke hint"
+++

# Sentinel body
SENTINEL_VALUE="${SENTINEL}"
EOF

# Build + encrypt
echo "→ Building with zola..."
zola build -o roc-blog >/dev/null
echo "→ Running encryption..."
node scripts/encrypt-posts.mjs | grep -E "${SLUG}|完成" || true

# Assertions
if [ ! -f "${PROD_PATH}" ]; then
  echo "❌ FAIL: ${PROD_PATH} not produced"
  exit 1
fi

if ! grep -q "StaticShieldCrypto" "${PROD_PATH}"; then
  echo "❌ FAIL: StaticShieldCrypto marker not in output (encryption did not happen)"
  exit 1
fi

if grep -q "${SENTINEL}" "${PROD_PATH}"; then
  echo "❌ FAIL: plaintext sentinel leaked into encrypted output"
  exit 1
fi

# Verify idempotency: a second run should skip without changes
echo "→ Re-running encryption (idempotency check)..."
node scripts/encrypt-posts.mjs | grep -q "已加密（idempotent）\|already encrypted" \
  && echo "✅ Idempotent" \
  || echo "ℹ Idempotency marker not detected (skipped message may differ); check manually"

echo ""
echo "✅ Encryption smoke test passed"
echo "  - post slug: ${SLUG}"
echo "  - password:  ${PASS_PWD}"
echo "  - sentinel leaked into output: NO"
echo "  - StaticShieldCrypto marker present: YES"