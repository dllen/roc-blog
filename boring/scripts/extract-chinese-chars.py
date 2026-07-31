#!/usr/bin/env python3
"""Scan all .md files, extract all CJK characters, write to chinese-subset.txt.
Run once to generate the file; commit it."""
import re
from pathlib import Path

CJK_PATTERN = re.compile(r'[㐀-鿿]')  # CJK Unified Ideographs

chars = set()
root = Path('content')
for f in root.rglob('*.md'):
    if '_review_reports' in str(f):
        continue
    text = f.read_text(errors='ignore')
    for m in CJK_PATTERN.findall(text):
        chars.add(m)

# 加上常用标点
PUNCTUATION = '，。、；：？！“”‘’（）【】《》—…·'
chars.update(PUNCTUATION)

# 排序写出
with open('scripts/chinese-subset.txt', 'w', encoding='utf-8') as f:
    f.write(''.join(sorted(chars)))
print(f"[chinese-subset] {len(chars)} unique chars → scripts/chinese-subset.txt")
