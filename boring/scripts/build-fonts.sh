#!/usr/bin/env bash
# Subset + convert the repository's source TTF fonts to WOFF2.
# Requires: pip install fonttools brotli
set -euo pipefail

cd "$(dirname "$0")/.."

if ! python3 -c "import fontTools, brotli" 2>/dev/null; then
  echo "[fonts] fonttools/brotli not found. Install: pip install fonttools brotli"
  exit 1
fi

SOURCE=assets/fonts/source
OUTPUT=static/fonts
mkdir -p "$OUTPUT"

LATIN_CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-_:;()[]{}/\\'\"\`\$#&@%^*+=<>|~"

if [ -f scripts/chinese-subset.txt ]; then
  CN_CHARS=$(<scripts/chinese-subset.txt)
  ALL_CHARS="${LATIN_CHARS}${CN_CHARS}"
  echo "[fonts] subsetting with ${#ALL_CHARS} total chars (${#CN_CHARS} CJK)"
else
  echo "[fonts] WARN: chinese-subset.txt not found, skipping CJK subsetting"
  ALL_CHARS="$LATIN_CHARS"
fi

for font in WorkSans-VariableFont_wght CrimsonPro-VariableFont_wght JetBrainsMono-VariableFont_wght; do
  base="${font%-VariableFont_wght}"
  input="${SOURCE}/${font}.ttf"
  if [ ! -f "$input" ]; then
    echo "[fonts] ERROR: source font not found: $input" >&2
    exit 1
  fi
  echo "[fonts] subsetting ${base}..."
  pyftsubset "$input" \
    --text="$ALL_CHARS" \
    --output-file="${OUTPUT}/${base}-subset.woff2" \
    --flavor=woff2 \
    --no-hinting \
    --ignore-missing-glyphs \
    --ignore-missing-unicodes
done

LA_SOLID_CODEPOINTS=(
  '0xf002' # search
  '0xf060' # arrow-left
  '0xf078' # chevron-down
  '0xf3bf' # level-up-alt
  '0xf015' # home
  '0xf185' # sun
  '0xf186' # moon
  '0xf09e' # rss
  '0xf143' # rss-square
  '0xf7d9' # tools
)
LA_BRANDS_CODEPOINTS=(
  '0xf09b' # github
)

codepoints_to_text() {
  python3 -c "import sys; print(''.join(chr(int(codepoint, 16)) for codepoint in sys.argv[1:]))" "$@"
}

pyftsubset "${SOURCE}/la-solid-900.ttf" \
  --text="$(codepoints_to_text "${LA_SOLID_CODEPOINTS[@]}")" \
  --output-file="${OUTPUT}/la-solid-900-subset.woff2" \
  --flavor=woff2 \
  --no-hinting \
  --ignore-missing-glyphs \
  --ignore-missing-unicodes

pyftsubset "${SOURCE}/la-brands-400.ttf" \
  --text="$(codepoints_to_text "${LA_BRANDS_CODEPOINTS[@]}")" \
  --output-file="${OUTPUT}/la-brands-400-subset.woff2" \
  --flavor=woff2 \
  --no-hinting \
  --ignore-missing-glyphs \
  --ignore-missing-unicodes

echo "[fonts] done. Subset WOFF2 in $OUTPUT/"
du -sh "$OUTPUT"
