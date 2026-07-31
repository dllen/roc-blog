#!/usr/bin/env bash
# Subset + convert TTF to WOFF2.
# Requires: pip install fonttools brotli
set -euo pipefail

cd "$(dirname "$0")/.."

# 检查 fonttools 是否安装
if ! python3 -c "import fontTools, brotli" 2>/dev/null; then
  echo "[fonts] fonttools/brotli not found. Install: pip install fonttools brotli"
  exit 1
fi

OUTPUT=static/fonts
mkdir -p "$OUTPUT"

# 1. 拉丁字符表（覆盖拼音 + 英文 + 标点）
LATIN_CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-_:;()[]{}/\\'\"\`\$#&@%^*+=<>|~"

# 2. 合并字符集
if [ -f scripts/chinese-subset.txt ]; then
  CN_CHARS=$(cat scripts/chinese-subset.txt)
  ALL_CHARS="${LATIN_CHARS}${CN_CHARS}"
  echo "[fonts] subsetting with ${#ALL_CHARS} total chars (${#CN_CHARS} CJK)"
else
  echo "[fonts] WARN: chinese-subset.txt not found, skipping CJK subsetting"
  ALL_CHARS="$LATIN_CHARS"
fi

# 3. 转换 3 个 TTF
for font in WorkSans-VariableFont_wght CrimsonPro-VariableFont_wght JetBrainsMono-Italic-VariableFont_wght; do
  base="${font%-VariableFont_wght}"
  if [ ! -f "static/fonts/${font}.ttf" ]; then
    echo "[fonts] skip ${base}: TTF not found"
    continue
  fi
  echo "[fonts] subsetting ${base}..."
  pyftsubset "static/fonts/${font}.ttf" \
    --text="$ALL_CHARS" \
    --output-file="${OUTPUT}/${base}-subset.woff2" \
    --flavor=woff2 \
    --no-hinting \
    --ignore-missing-glyphs \
    --ignore-missing-unicodes
done

# 4. line-awesome (solids): 6 个图标
# 使用 Unicode 码点（更可靠，不依赖字体内的字符别名）
LA_SOLID_UNICODES=$(python3 -c "
print(''.join(chr(int(c, 16)) for c in [
  '0xf061',  # arrow-right
  '0xf3bf',  # level-up-alt
  '0xf015',  # home
  '0xf185',  # sun
  '0xf186',  # moon
  '0xf09e',  # rss
]))
")

pyftsubset static/line-awesome/fonts/la-solid-900.ttf \
  --text="$LA_SOLID_UNICODES" \
  --output-file="${OUTPUT}/la-solid-900-subset.woff2" \
  --flavor=woff2 \
  --no-hinting \
  --ignore-missing-glyphs \
  --ignore-missing-unicodes || echo "[fonts] WARN: la-solid subset failed"

# 5. line-awesome (brands): github
pyftsubset static/line-awesome/fonts/la-brands-400.ttf \
  --text=$(python3 -c "print(chr(0xf09b))") \
  --output-file="${OUTPUT}/la-brands-400-subset.woff2" \
  --flavor=woff2 \
  --no-hinting \
  --ignore-missing-glyphs \
  --ignore-missing-unicodes || echo "[fonts] WARN: la-brands subset failed"

# 6. 删 line-awesome 整包
rm -rf static/line-awesome

# 7. 删 TTF（保留 WOFF2）
rm -f static/fonts/*.ttf

echo "[fonts] done. Subset WOFF2 in $OUTPUT/"
du -sh "$OUTPUT"
