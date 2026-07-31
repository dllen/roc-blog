#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

zola build -o roc-blog

# Optional: encrypt posts whose frontmatter contains `password`.
# Failures here do NOT block deployment — plain posts must still publish.
if [ -d content/blog ]; then
  node scripts/encrypt-posts.mjs || echo "⚠ 加密步骤失败，继续（普通文章仍可访问）"
fi