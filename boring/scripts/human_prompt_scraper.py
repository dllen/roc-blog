#!/usr/bin/env python3
import argparse
import logging
import time
import random
import threading
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Dict, Optional

from prompt_extractor import extract_prompts_from_html

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.webdriver.common.action_chains import ActionChains
except ImportError:
    raise RuntimeError('selenium not installed. Run: pip install selenium webdriver-manager')

try:
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    ChromeDriverManager = None


def human_delay(min_s=0.5, max_s=3.0):
    time.sleep(random.uniform(min_s, max_s))


def human_scroll_and_move(driver):
    h = driver.execute_script('return document.body.scrollHeight') or 2000
    steps = random.randint(8, 16)
    step = h // steps
    actions = ActionChains(driver)
    for i in range(steps):
        y = (i + 1) * step
        driver.execute_script(f'window.scrollTo(0,{y});')
        try:
            actions.move_by_offset(random.randint(-30, 30), random.randint(-20, 20)).perform()
        except Exception:
            pass
        human_delay()


def start_driver(headless: bool = False, user_data_dir: Optional[str] = None):
    opts = ChromeOptions()
    if headless:
        pass
    opts.add_argument('--disable-gpu')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--window-size=1400,2400')
    opts.add_argument('--lang=zh-CN')
    if user_data_dir:
        opts.add_argument(f'--user-data-dir={user_data_dir}')
    if ChromeDriverManager:
        from selenium.webdriver.chrome.service import Service
        path = ChromeDriverManager().install()
        service = Service(path)
        return webdriver.Chrome(service=service, options=opts)
    return webdriver.Chrome(options=opts)


def quality_score(prompt: str) -> float:
    L = len(prompt.strip())
    s = 0.0
    if L >= 80:
        s += 0.4
    if 'Prompt' in prompt or '需求' in prompt or '提示' in prompt:
        s += 0.2
    if '```' in prompt or '=== ' in prompt or ';;' in prompt:
        s += 0.2
    lines = prompt.strip().splitlines()
    if len(lines) >= 4:
        s += 0.2
    return min(s, 1.0)


def sha256_6(content: str) -> str:
    return hashlib.sha256(content.encode('utf-8')).hexdigest()[:6]


def compose_md(url: str, ts: int, prompt: str, tags: List[str]) -> str:
    lines = []
    lines.append('---')
    lines.append(f'title: "Prompt"')
    lines.append(f'date: "{time.strftime("%Y-%m-%d", time.localtime(ts))}"')
    lines.append('tags: [Prompt, AI]')
    lines.append('categories: [Prompt]')
    lines.append('---')
    lines.append('')
    lines.append(f'- 原始URL：{url}')
    lines.append(f'- 抓取时间戳：{ts}')
    lines.append(f'- 元数据标签：{" ".join(tags)}')
    lines.append('')
    lines.append('## Prompt')
    lines.append(prompt)
    lines.append('')
    return '\n'.join(lines)


class IndexStore:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.data = {"processed_hashes": [], "processed_urls": []}
        if path.exists():
            try:
                import json
                self.data = json.loads(path.read_text(encoding='utf-8'))
            except Exception:
                pass

    def has(self, h: str) -> bool:
        return h in self.data.get('processed_hashes', [])

    def add(self, h: str, url: str):
        with self.lock:
            self.data.setdefault('processed_hashes', []).append(h)
            self.data.setdefault('processed_urls', []).append(url)
            import json
            self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding='utf-8')


def scrape_page(url: str, outdir: Path, index: IndexStore, max_prompts: int = 100, user_data_dir: Optional[str] = None) -> Dict:
    log = {"url": url, "saved": 0, "errors": []}
    driver = None
    try:
        driver = start_driver(headless=False, user_data_dir=user_data_dir)
        driver.get(url)
        human_delay(1.0, 2.0)
        human_scroll_and_move(driver)
        html = driver.page_source
        prompts = extract_prompts_from_html(html)
        seen = 0
        for pr in prompts:
            h = sha256_6(pr)
            if index.has(h):
                continue
            score = quality_score(pr)
            if score < 0.5:
                continue
            ts = int(time.time())
            name = f'prompt_{ts}_{h}.md'
            fp = outdir / name
            md = compose_md(url, ts, pr, ['#ai', '#prompt'])
            fp.write_text(md, encoding='utf-8')
            index.add(h, url)
            log['saved'] += 1
            seen += 1
            if seen >= max_prompts:
                break
            human_delay()
    except Exception as e:
        log['errors'].append(str(e))
    finally:
        try:
            driver.quit()
        except Exception:
            pass
    return log


def main():
    parser = argparse.ArgumentParser(description='Human-like prompt scraper with concurrency and quality filters')
    parser.add_argument('--page-url', action='append', help='Page URL to scrape (repeatable)')
    parser.add_argument('--urls-file', help='File containing URLs, one per line')
    parser.add_argument('--outdir', default='/Users/shichaopeng/Work/self-dir/roc-blog/boring/content/blog/prompt/', help='Output directory')
    parser.add_argument('--user-data-dir', default=None, help='Chrome user data directory to reuse login state')
    parser.add_argument('--max-concurrency', type=int, default=3, help='Max concurrent browser instances (<=3)')
    parser.add_argument('--rate-limit', type=int, default=1000, help='Max prompts per hour')
    parser.add_argument('--log-level', default='INFO')
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format='%(asctime)s %(levelname)s %(message)s')

    outdir = Path(args.outdir).expanduser()
    outdir.mkdir(parents=True, exist_ok=True)
    index = IndexStore(outdir / '.human_prompt_index.json')

    urls: List[str] = []
    if args.page_url:
        urls.extend(args.page_url)
    if args.urls_file:
        p = Path(args.urls_file).expanduser()
        if p.exists():
            urls.extend([u.strip() for u in p.read_text(encoding='utf-8').splitlines() if u.strip()])
    urls = list(dict.fromkeys(urls))

    if not urls:
        logging.info('No URLs provided')
        return

    max_workers = min(max(args.max_concurrency, 1), 3)
    saved_total = 0
    start_hour = int(time.time() // 3600)

    def submit_or_wait(executor, url):
        nonlocal saved_total, start_hour
        cur_hour = int(time.time() // 3600)
        if cur_hour != start_hour:
            start_hour = cur_hour
            saved_total = 0
        if saved_total >= args.rate_limit:
            logging.info('Rate limit reached for this hour')
            return None
        return executor.submit(scrape_page, url, outdir, index, user_data_dir=args.user_data_dir)

    futures = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        for url in urls:
            fut = submit_or_wait(ex, url)
            if fut:
                futures.append(fut)
        for fut in as_completed(futures):
            log = fut.result()
            saved_total += log.get('saved', 0)
            if log.get('errors'):
                errlog = outdir / 'human_failures.log'
                line = f"{int(time.time())}\t{log['url']}\t{' | '.join(log['errors'])}\n"
                errlog.write_text((errlog.read_text(encoding='utf-8') if errlog.exists() else '') + line, encoding='utf-8')
            logging.info('Scraped %s saved=%d errors=%d', log['url'], log.get('saved', 0), len(log.get('errors', [])))

if __name__ == '__main__':
    main()