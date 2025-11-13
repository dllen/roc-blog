#!/usr/bin/env python3
"""
Test script to validate X scraper functionality
"""

import json
from pathlib import Path
from x_prompt_scraper import sanitize_title, compose_markdown, unique_filepath

def test_sanitize_title():
    assert sanitize_title("Hello World! 123") == "Hello-World-123"
    assert sanitize_title("中文标题 Test") == "中文标题-Test"
    assert sanitize_title("") == "untitled"
    assert sanitize_title("a" * 60) == "a" * 50  # max_len=50
    print("✓ sanitize_title tests passed")

def test_compose_markdown():
    post = {
        "text": "This is a test prompt about AI and productivity.",
        "date": "2025-11-13",
        "likes": 42,
        "retweets": 7,
        "replies": 3,
        "url": "https://x.com/test/status/123"
    }
    md = compose_markdown(post)
    assert "---" in md
    assert "title:" in md
    assert "This is a test prompt" in md
    assert "点赞：42" in md
    print("✓ compose_markdown test passed")

def test_unique_filepath():
    base = Path("/tmp/test_x")
    base.mkdir(exist_ok=True)
    p1 = unique_filepath(base, "2025-11-13", "test")
    assert p1.name == "2025-11-13-test.md"
    p1.write_text("dummy")
    p2 = unique_filepath(base, "2025-11-13", "test")
    assert p2.name == "2025-11-13-test-2.md"
    print("✓ unique_filepath test passed")

def main():
    print("Running X scraper tests...")
    test_sanitize_title()
    test_compose_markdown()
    test_unique_filepath()
    print("All tests passed! 🎉")

if __name__ == '__main__':
    main()