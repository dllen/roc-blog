# Local Mock: Run GitHub Workflow (build.yml)

## Context
The `.github/workflows/build.yml` runs 16 steps to build the Zola blog. No Docker available, so `act` (Nektos) isn't viable. We'll create a local shell script that mirrors all applicable CI steps and skips CI-only ones.

## Steps

### 1. Create `scripts/ci-local.sh`
Mirror each workflow step that can run locally:

| Workflow Step | Local Approach |
|---|---|
| Checkout | Skip (already cloned) |
| Setup Node.js | Use local Node v22 |
| `yarn install` | Run in `boring/` |
| Setup Python | Use local Python 3.10 |
| `pip install fonttools brotli` | Run pip install |
| Build subset fonts | `bash scripts/build-fonts.sh` |
| Build CSS (yarn build) | Run `yarn build` in `boring/` |
| Audit frontmatter | `node scripts/audit-frontmatter.mjs` |
| Upload artifact / PR comment | Skip (CI-only) |
| Generate OG images | `node scripts/og-generator.mjs` |
| Cleanup orphan OG images | `node scripts/cleanup-og.mjs` |
| Download Zola binary | Skip (local Zola already installed) |
| Build site with Zola | `zola build -o roc-blog --force` |
| Upload artifact / Deploy | Skip (CI-only) |

### 2. Make script executable and test
- `chmod +x scripts/ci-local.sh`
- Run once to verify all steps pass

### Deliverable
Single script: `scripts/ci-local.sh` that mimics the full CI pipeline locally.
