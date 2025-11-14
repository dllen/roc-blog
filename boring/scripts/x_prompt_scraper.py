#!/usr/bin/env python3
"""
X (Twitter) prompt scraper for lijigang_com
Usage:
  python x_prompt_scraper.py --help
  python x_prompt_scraper.py --cookies cookies.json --incremental --max-posts 50
"""

import os
import re
import json
import time
import logging
import argparse
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional
from prompt_extractor import extract_prompts_from_text

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    from selenium.common.exceptions import NoSuchElementException, TimeoutException
except ImportError:
    raise RuntimeError("selenium not installed. Run: pip install selenium webdriver-manager")

try:
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    ChromeDriverManager = None

# ---------- utilities ----------

def sanitize_title(text: str, max_len: int = 50) -> str:
    """Clean text for filename usage."""
    t = text.strip().replace('\n', ' ')
    t = re.sub(r'\s+', ' ', t)
    if len(t) > max_len:
        t = t[:max_len]
    t = re.sub(r'[^\w\-\u4e00-\u9fff\s]', '', t)
    t = t.strip().replace(' ', '-')
    t = re.sub(r'-{2,}', '-', t)
    return t or 'untitled'

def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def load_index(index_path: Path) -> Dict:
    """Load incremental index."""
    if index_path.exists():
        try:
            return json.loads(index_path.read_text(encoding='utf-8'))
        except Exception:
            return {"processed_ids": []}
    return {"processed_ids": []}

def save_index(index_path: Path, data: Dict):
    """Save incremental index."""
    index_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def parse_int_from_label(text: str) -> Optional[int]:
    """Extract numeric counts from aria-label or text."""
    if not text:
        return None
    m = re.search(r'(\d[\d,]*)', text)
    if m:
        try:
            return int(m.group(1).replace(',', ''))
        except Exception:
            return None
    return None

# ---------- markdown generation ----------

def compose_markdown(post: Dict) -> str:
    title = post.get('title') or sanitize_title(post.get('text', ''))
    date_str = post.get('date') or datetime.utcnow().strftime('%Y-%m-%d')
    desc = '来自 X 采集：prompt'
    slug = sanitize_title(title.lower())
    fm = [
        '---',
        f'title: "{title}"',
        f'date: "{date_str}"',
        f'description: "{desc}"',
        'tags: [Prompt, X]',
        'categories: [Prompt]',
        f'slug: "{slug}"',
        '---',
        '',
    ]
    lines = []
    lines.extend(fm)
    prompts = post.get('prompts')
    if prompts:
        for i, pr in enumerate(prompts, 1):
            lines.append(f'## Prompt {i}')
            lines.append(pr.strip())
            lines.append('')
    else:
        lines.append('## Prompt')
        lines.append(post.get('text', '').strip())
        lines.append('')
    meta = []
    if post.get('url'):
        meta.append(f'- 原始链接：{post["url"]}')
    if post.get('date'):
        meta.append(f'- 发布时间：{post["date"]}')
    if post.get('likes') is not None:
        meta.append(f'- 点赞：{post["likes"]}')
    if post.get('retweets') is not None:
        meta.append(f'- 转发：{post["retweets"]}')
    if post.get('replies') is not None:
        meta.append(f'- 评论：{post["replies"]}')
    if meta:
        lines.append('## 互动数据')
        lines.extend(meta)
        lines.append('')
    return '\n'.join(lines)

def unique_filepath(base_dir: Path, date_str: str, title: str) -> Path:
    """Ensure unique filename."""
    base = f'{date_str}-{sanitize_title(title)}.md'
    p = base_dir / base
    if not p.exists():
        return p
    i = 2
    while True:
        p2 = base_dir / f'{date_str}-{sanitize_title(title)}-{i}.md'
        if not p2.exists():
            return p2
        i += 1

def wait_full_render(driver, timeout: int = 30):
    start = time.time()
    last_h = 0
    stable = 0
    while time.time() - start < timeout:
        try:
            rs = driver.execute_script('return document.readyState')
        except Exception:
            rs = 'loading'
        driver.execute_script('window.scrollTo(0, document.body.scrollHeight)')
        time.sleep(0.5)
        try:
            h = driver.execute_script('return document.body.scrollHeight')
        except Exception:
            h = last_h
        if h == last_h and rs == 'complete':
            stable += 1
        else:
            stable = 0
        last_h = h
        if stable >= 3:
            break

def pick_main_element(driver):
    candidates = []
    sels = ['main', 'article', '[role="main"]', '#content', '.post', '.article']
    for s in sels:
        try:
            els = driver.find_elements(By.CSS_SELECTOR, s)
            for el in els:
                txt = el.text or ''
                candidates.append((len(txt), el))
        except Exception:
            pass
    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]
    try:
        return driver.find_element(By.TAG_NAME, 'body')
    except Exception:
        return None

def scrape_full_page(page_url: str, cookies_file: Optional[Path], headless: bool, user_data_dir: Optional[str] = None) -> Dict:
    opts = ChromeOptions()
    if headless:
        opts.add_argument('--headless=new')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--window-size=1400,2400')
    opts.add_argument('--lang=zh-CN')
    if user_data_dir:
        opts.add_argument(f'--user-data-dir={user_data_dir}')
    if ChromeDriverManager:
        from selenium.webdriver.chrome.service import Service
        driver_path = ChromeDriverManager().install()
        service = Service(driver_path)
        driver = webdriver.Chrome(service=service, options=opts)
    else:
        driver = webdriver.Chrome(options=opts)
    tries = 0
    while tries < 3:
        try:
            driver.get(page_url)
            wait_full_render(driver, timeout=40)
            root = pick_main_element(driver)
            title = ''
            try:
                t_el = driver.find_element(By.TAG_NAME, 'h1')
                title = t_el.text.strip()
            except Exception:
                title = (driver.title or '').strip()
            text = ''
            if root:
                text = root.text.strip()
            imgs = []
            try:
                img_els = root.find_elements(By.TAG_NAME, 'img') if root else driver.find_elements(By.TAG_NAME, 'img')
                for im in img_els:
                    src = im.get_attribute('src') or ''
                    alt = im.get_attribute('alt') or ''
                    if src:
                        imgs.append({'src': src, 'alt': alt})
            except Exception:
                pass
            meta = {}
            try:
                metas = driver.find_elements(By.CSS_SELECTOR, 'meta[name], meta[property]')
                for m in metas:
                    name = m.get_attribute('name') or m.get_attribute('property')
                    content = m.get_attribute('content')
                    if name and content:
                        meta[name] = content
            except Exception:
                pass
            driver.quit()
            return {
                'url': page_url,
                'title': title or '未命名',
                'text': text,
                'images': imgs,
                'meta': meta,
                'date': datetime.utcnow().strftime('%Y-%m-%d')
            }
        except Exception:
            tries += 1
            time.sleep(2)
    try:
        driver.quit()
    except Exception:
        pass
    return {}

def compose_fullpage_markdown(data: Dict) -> str:
    title = data.get('title') or '未命名'
    date_str = data.get('date') or datetime.utcnow().strftime('%Y-%m-%d')
    desc = data.get('meta', {}).get('description') or '网页抓取'
    slug = sanitize_title(title.lower())
    fm = [
        '---',
        f'title: "{title}"',
        f'date: "{date_str}"',
        f'description: "{desc}"',
        'tags: [Scrape]',
        'categories: [Prompt]',
        f'slug: "{slug}"',
        '---',
        ''
    ]
    lines = []
    lines.extend(fm)
    lines.append('## 正文')
    lines.append((data.get('text') or '').strip())
    lines.append('')
    imgs = data.get('images') or []
    if imgs:
        lines.append('## 图片')
        for im in imgs:
            src = im.get('src')
            alt = im.get('alt') or ''
            lines.append(f'![{alt}]({src})')
        lines.append('')
    meta = data.get('meta') or {}
    if meta:
        lines.append('## 元数据')
        for k, v in meta.items():
            lines.append(f'- {k}: {v}')
        lines.append('')
    lines.append(f'- 原始链接：{data.get("url", "")}')
    lines.append('')
    return '\n'.join(lines)

def blog_filename_underscore(date_str: str, title: str) -> str:
    return f'{date_str.replace("-", "")}_{sanitize_title(title)}.md'

# ---------- selenium scraper ----------

def scrape_with_selenium(user_url: str, cookies_file: Optional[Path], max_posts: int, headless: bool, user_data_dir: Optional[str] = None) -> List[Dict]:
    """Scrape user timeline using Selenium."""
    opts = ChromeOptions()
    if headless:
        opts.add_argument('--headless=new')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--window-size=1280,2000')
    opts.add_argument('--lang=zh-CN')
    opts.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
    if user_data_dir:
        opts.add_argument(f'--user-data-dir={user_data_dir}')

    if ChromeDriverManager:
        from selenium.webdriver.chrome.service import Service
        driver_path = ChromeDriverManager().install()
        service = Service(driver_path)
        driver = webdriver.Chrome(service=service, options=opts)
    else:
        driver = webdriver.Chrome(options=opts)

    driver.get('https://x.com/')
    if cookies_file and cookies_file.exists():
        try:
            cookies = json.loads(cookies_file.read_text(encoding='utf-8'))
            for c in cookies:
                dc = {
                    'name': c.get('name'),
                    'value': c.get('value'),
                    'domain': c.get('domain', '.x.com'),
                    'path': c.get('path', '/'),
                    'secure': c.get('secure', True),
                    'httpOnly': c.get('httpOnly', False)
                }
                driver.add_cookie(dc)
        except Exception as e:
            logging.warning('Cookies load failed: %s', e)

    driver.get(user_url)
    time.sleep(3)

    posts: List[Dict] = []
    seen = set()

    last_height = 0
    idle_rounds = 0
    while len(posts) < max_posts and idle_rounds < 10:
        els = driver.find_elements(By.CSS_SELECTOR, 'article[data-testid="tweet"]')
        for el in els:
            try:
                link_el = el.find_element(By.CSS_SELECTOR, 'a[href*="/status/"]')
                href = link_el.get_attribute('href')
                mid = None
                m = re.search(r'/status/(\d+)', href or '')
                if m:
                    mid = m.group(1)
                if mid and mid in seen:
                    continue
                text_nodes = el.find_elements(By.CSS_SELECTOR, 'div[lang]')
                text = '\n'.join([t.text for t in text_nodes]).strip()
                if not text:
                    continue
                prompts = extract_prompts_from_text(text)
                if not prompts:
                    continue
                date_el = None
                date_val = None
                try:
                    date_el = el.find_element(By.TAG_NAME, 'time')
                    date_val = date_el.get_attribute('datetime')
                except Exception:
                    date_val = None
                replies = None
                retweets = None
                likes = None
                try:
                    rep_el = el.find_element(By.CSS_SELECTOR, 'div[data-testid="reply"]')
                    replies = parse_int_from_label(rep_el.get_attribute('aria-label') or rep_el.text)
                except Exception:
                    replies = None
                try:
                    rt_el = el.find_element(By.CSS_SELECTOR, 'div[data-testid="retweet"]')
                    retweets = parse_int_from_label(rt_el.get_attribute('aria-label') or rt_el.text)
                except Exception:
                    retweets = None
                try:
                    like_el = el.find_element(By.CSS_SELECTOR, 'div[data-testid="like"]')
                    likes = parse_int_from_label(like_el.get_attribute('aria-label') or like_el.text)
                except Exception:
                    likes = None
                dt = None
                try:
                    if date_val:
                        dt = datetime.fromisoformat(date_val.replace('Z', '+00:00'))
                except Exception:
                    dt = None
                dstr = (dt or datetime.utcnow()).strftime('%Y-%m-%d')
                p = {
                    'id': mid,
                    'url': href,
                    'text': '\n\n'.join(prompts),
                    'prompts': prompts,
                    'date': dstr,
                    'replies': replies,
                    'retweets': retweets,
                    'likes': likes,
                }
                posts.append(p)
                if mid:
                    seen.add(mid)
                if len(posts) >= max_posts:
                    break
            except Exception:
                continue
        driver.execute_script('window.scrollTo(0, document.body.scrollHeight);')
        time.sleep(2)
        new_height = driver.execute_script('return document.body.scrollHeight')
        if new_height == last_height:
            idle_rounds += 1
        else:
            idle_rounds = 0
            last_height = new_height
    driver.quit()
    return posts

# ---------- file saving ----------

def save_posts(posts: List[Dict], out_dir: Path, backup_dir: Path, index_path: Path):
    """Save posts with incremental index."""
    ensure_dir(out_dir)
    ensure_dir(backup_dir)
    index = load_index(index_path)
    processed = set(index.get('processed_ids', []))
    saved_ids = []
    new_posts = []
    for post in posts:
        pid = post.get('id') or f'{post.get("date")}-{sanitize_title(post.get("text",""))}'
        if pid in processed:
            continue
        title = sanitize_title(post.get('text', ''))
        md_path = unique_filepath(out_dir, post.get('date'), title)
        md = compose_markdown({'title': title, **post})
        md_path.write_text(md, encoding='utf-8')
        new_posts.append(post)
        saved_ids.append(pid)
        logging.info('Saved %s', md_path)
    if new_posts:
        ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        backup_file = backup_dir / f'x-backup-{ts}.json'
        backup_file.write_text(json.dumps(new_posts, ensure_ascii=False, indent=2), encoding='utf-8')
        logging.info('Backup saved %s', backup_file)
    index['processed_ids'] = list(processed.union(saved_ids))
    save_index(index_path, index)

# ---------- main ----------

def main():
    parser = argparse.ArgumentParser(description='Scrape X (Twitter) prompt posts or full page content')
    parser.add_argument('--user-url', default='https://x.com/lijigang_com', help='User profile URL')
    parser.add_argument('--page-url', default=None, help='Full page URL to scrape')
    parser.add_argument('--outdir', default='/Users/shichaopeng/Work/self-dir/roc-blog/boring/content/blog/prompt/', help='Output directory')
    parser.add_argument('--cookies', default=None, help='Path to cookies JSON file')
    parser.add_argument('--user-data-dir', default=None, help='Chrome user data directory to reuse login state')
    parser.add_argument('--max-posts', type=int, default=100, help='Max posts to scrape')
    parser.add_argument('--headless', action='store_true', help='Run browser headless')
    parser.add_argument('--no-headless', action='store_true', help='Run browser visible')
    parser.add_argument('--incremental', action='store_true', help='Skip already processed posts')
    parser.add_argument('--log-level', default='INFO', help='Log level (DEBUG/INFO/WARNING/ERROR)')
    args = parser.parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO), format='%(asctime)s %(levelname)s %(message)s')

    headless = True
    if args.no_headless:
        headless = False
    if args.headless:
        headless = True

    out_dir = Path(args.outdir).expanduser()
    backup_dir = out_dir / 'backup'
    index_path = out_dir / '.x_prompt_index.json'

    cookies_file = Path(args.cookies).expanduser() if args.cookies else None
    user_data_dir = args.user_data_dir

    if args.page_url:
        logging.info('Start full page scrape %s', args.page_url)
        data = scrape_full_page(args.page_url, cookies_file, headless, user_data_dir)
        if not data:
            logging.info('Full page scrape failed')
            return
        out_dir.mkdir(parents=True, exist_ok=True)
        md = compose_fullpage_markdown(data)
        fname = blog_filename_underscore(data.get('date'), data.get('title'))
        fp = out_dir / fname
        i = 2
        while fp.exists():
            fp = out_dir / blog_filename_underscore(data.get('date'), f"{data.get('title')}-{i}")
            i += 1
        fp.write_text(md, encoding='utf-8')
        logging.info('Saved %s', fp)
        return
    logging.info('Start scraping %s', args.user_url)
    posts = scrape_with_selenium(args.user_url, cookies_file, args.max_posts, headless, user_data_dir)
    logging.info('Scraped %d posts', len(posts))

    if args.incremental:
        save_posts(posts, out_dir, backup_dir, index_path)
    else:
        ensure_dir(out_dir)
        ensure_dir(backup_dir)
        ts = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        backup_file = backup_dir / f'x-backup-{ts}.json'
        backup_file.write_text(json.dumps(posts, ensure_ascii=False, indent=2), encoding='utf-8')
        logging.info('Backup saved %s', backup_file)
        for post in posts:
            title = sanitize_title(post.get('text', ''))
            md_path = unique_filepath(out_dir, post.get('date'), title)
            md = compose_markdown({'title': title, **post})
            md_path.write_text(md, encoding='utf-8')
            logging.info('Saved %s', md_path)

if __name__ == '__main__':
    main()
