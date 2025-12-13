#!/usr/bin/env python3
"""
Helper script to export X cookies from browser for scraping
Usage: python export_x_cookies.py
"""

import json
import sys
from pathlib import Path

def main():
    print("=== X Cookies Export Helper ===")
    print()
    print("请按照以下步骤导出 cookies：")
    print("1. 使用 Chrome/Firefox 登录 https://x.com")
    print("2. 安装浏览器插件：")
    print("   - Chrome: 'Get cookies.txt LOCALLY' 或 'EditThisCookie'")
    print("   - Firefox: 'cookies.txt' 或 'Export Cookies'")
    print("3. 导出 cookies 为 JSON 格式")
    print("4. 将文件保存为 cookies.json")
    print()
    
    # Example cookies format
    example_cookies = [
        {
            "name": "auth_token",
            "value": "YOUR_AUTH_TOKEN_HERE",
            "domain": ".x.com",
            "path": "/",
            "secure": True,
            "httpOnly": True
        },
        {
            "name": "ct0",
            "value": "YOUR_CSRF_TOKEN_HERE",
            "domain": ".x.com",
            "path": "/",
            "secure": True,
            "httpOnly": False
        }
    ]
    
    example_path = Path("cookies_example.json")
    example_path.write_text(json.dumps(example_cookies, indent=2), encoding='utf-8')
    print(f"已创建示例文件：{example_path}")
    print("请用实际 cookies 值替换 YOUR_AUTH_TOKEN_HERE 等占位符")
    print()
    print("使用示例：")
    print("python x_prompt_scraper.py --cookies cookies.json --incremental")

if __name__ == '__main__':
    main()