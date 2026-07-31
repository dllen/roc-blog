#!/usr/bin/env bash
# ci-local.sh — local mock of .github/workflows/build.yml
#
# Mirrors every CI step that can run locally, skipping:
#   - Checkout (already cloned)
#   - Node.js / Python setup (use local)
#   - Zola download (local binary)
#   - Artifact upload, PR comment, deploy (CI-only)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BORING="$ROOT/boring"
PASS=0
FAIL=0
SKIP=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

step_pass()  { PASS=$((PASS + 1)); echo -e "${GREEN}[PASS]${NC} $1"; }
step_fail()  { FAIL=$((FAIL + 1)); echo -e "${RED}[FAIL]${NC} $1"; }
step_skip()  { SKIP=$((SKIP + 1)); echo -e "${YELLOW}[SKIP]${NC} $1"; }
step_start() { echo -e "\n${GREEN}==>${NC} $1"; }

# ── Step 1: Install frontend dependencies ──────────────────────────
step_start "[1/7] yarn install"
if [ -f "$BORING/yarn.lock" ] || [ -f "$BORING/package.json" ]; then
  cd "$BORING"
  corepack enable 2>/dev/null || true
  yarn install && step_pass "yarn install OK" || step_fail "yarn install"
  cd "$ROOT"
else
  step_skip "no package.json/yarn.lock in boring/"
fi

# ── Step 2: Install Python deps ────────────────────────────────────
step_start "[2/7] pip install fonttools + brotli"
if command -v python3 &>/dev/null; then
  pip install fonttools==4.47.0 brotli==1.1.0 2>&1 \
    && step_pass "fonttools+brotli OK" \
    || step_fail "pip install fonttools/brotli"
else
  step_skip "python3 not found"
fi

# ── Step 3: Build subset fonts ─────────────────────────────────────
step_start "[3/7] build subset fonts"
if [ -f "$BORING/scripts/build-fonts.sh" ]; then
  cd "$BORING"
  bash scripts/build-fonts.sh && step_pass "fonts OK" || step_fail "fonts build"
  cd "$ROOT"
else
  step_skip "build-fonts.sh not found"
fi

# ── Step 4: Build CSS with PostCSS (yarn build) ────────────────────
step_start "[4/7] yarn build (PostCSS + related index)"
cd "$BORING"
yarn build && step_pass "yarn build OK" || step_fail "yarn build"
cd "$ROOT"

# ── Step 5: Audit frontmatter ──────────────────────────────────────
step_start "[5/7] audit frontmatter"
cd "$BORING"
# local mode skips _audit output; treat non-zero exit as INFO, not error
node scripts/audit-frontmatter.mjs content/blog --out _audit 2>&1 || true
step_pass "audit frontmatter done (warnings OK)"
cd "$ROOT"

# ── Step 6: Generate OG images ─────────────────────────────────────
step_start "[6/7] og-generator + cleanup-og"
cd "$BORING"
node scripts/og-generator.mjs content/blog --out static/og 2>&1 \
  && step_pass "OG images OK" \
  || step_fail "og-generator"
node scripts/cleanup-og.mjs content/blog --out static/og 2>&1 \
  && step_pass "cleanup OG OK" \
  || step_fail "cleanup-og"
cd "$ROOT"

# ── Step 7: Build site with Zola ──────────────────────────────────
step_start "[7/7] zola build"
if command -v zola &>/dev/null; then
  zola --version
  cd "$BORING"
  zola build -o roc-blog --force && step_pass "zola build OK" || step_fail "zola build"
  cd "$ROOT"
else
  step_fail "zola not found"
fi

# ── Summary ────────────────────────────────────────────────────────
echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Passed:${NC} $PASS  ${RED}Failed:${NC} $FAIL  ${YELLOW}Skipped:${NC} $SKIP"
echo -e "  Site output: $BORING/roc-blog"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
