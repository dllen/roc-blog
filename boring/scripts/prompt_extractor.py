#!/usr/bin/env python3
import re
import argparse
import logging
import time
import urllib.request
from html import unescape
from pathlib import Path

SEMIS_34 = ';' * 34
MARKER_RE = re.compile(r'^\s*;{34}\s*$')

def extract_prompts_from_text(text: str):
    lines = text.splitlines()
    prompts = []
    buf = []
    inside = False
    for line in lines:
        if MARKER_RE.match(line):
            if not inside:
                inside = True
                buf = []
            else:
                prompt = '\n'.join(buf)
                if prompt is not None:
                    prompts.append(prompt)
                inside = False
                buf = []
            continue
        if inside:
            buf.append(line)
    if inside:
        logging.warning('Unclosed prompt block')
    return prompts

def detect_encoding(path: Path):
    with open(path, 'rb') as f:
        sample = f.read(65536)
    try:
        sample.decode('utf-8')
        return 'utf-8'
    except Exception:
        pass
    try:
        sample.decode('gbk')
        return 'gbk'
    except Exception:
        pass
    return 'utf-8'

def extract_prompts_stream(path: Path, encoding: str = 'auto'):
    if encoding == 'auto':
        enc = detect_encoding(path)
    else:
        enc = encoding
    prompts = []
    buf = []
    inside = False
    total_bytes = 0
    start = time.time()
    with open(path, 'r', encoding=enc, errors='replace') as f:
        for line in f:
            total_bytes += len(line.encode(enc, errors='replace'))
            if MARKER_RE.match(line):
                if not inside:
                    inside = True
                    buf = []
                else:
                    prompt = '\n'.join(buf)
                    if prompt is not None:
                        prompts.append(prompt)
                    inside = False
                    buf = []
                continue
            if inside:
                buf.append(line.rstrip('\n'))
    if inside:
        logging.warning('Unclosed prompt block')
    dur = max(time.time() - start, 1e-6)
    mbps = (total_bytes / (1024 * 1024)) / dur
    logging.info('Processed %.2f MB in %.2f s (%.2f MB/s)', total_bytes / (1024 * 1024), dur, mbps)
    return prompts

def html_to_text(html: str):
    s = re.sub(r'(?is)<script[^>]*>.*?</script>', '', html)
    s = re.sub(r'(?is)<style[^>]*>.*?</style>', '', s)
    s = re.sub(r'(?is)<br\s*/?>', '\n', s)
    s = re.sub(r'(?is)</p>', '\n', s)
    s = re.sub(r'(?is)<[^>]+>', '', s)
    return unescape(s)

def extract_prompts_from_html(html: str):
    text = html_to_text(html)
    return extract_prompts_from_text(text)

def fetch_url(url: str):
    with urllib.request.urlopen(url) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or 'utf-8'
        try:
            return raw.decode(charset, errors='replace')
        except Exception:
            return raw.decode('utf-8', errors='replace')

def main():
    parser = argparse.ArgumentParser(description='Extract prompts delimited by 34 semicolons from file or URL')
    parser.add_argument('--input', help='Input file path')
    parser.add_argument('--url', help='Input URL')
    parser.add_argument('--encoding', default='auto', help='File encoding (utf-8/gbk/auto)')
    parser.add_argument('--outdir', help='Output directory to write prompt blocks')
    parser.add_argument('--log-level', default='INFO', help='Log level')
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format='%(asctime)s %(levelname)s %(message)s')

    src_text = None
    prompts = []
    if args.input:
        p = Path(args.input).expanduser()
        prompts = extract_prompts_stream(p, args.encoding)
    elif args.url:
        html = fetch_url(args.url)
        prompts = extract_prompts_from_html(html)
    else:
        logging.error('No input specified')
        return

    if not prompts:
        logging.info('No valid prompts found')
    if args.outdir:
        out = Path(args.outdir).expanduser()
        out.mkdir(parents=True, exist_ok=True)
        ts = int(time.time())
        for i, pr in enumerate(prompts, 1):
            fp = out / f'prompt-{ts}-{i}.txt'
            fp.write_text(pr, encoding='utf-8')
            logging.info('Saved %s', fp)
    else:
        for pr in prompts:
            print(pr)

if __name__ == '__main__':
    main()

