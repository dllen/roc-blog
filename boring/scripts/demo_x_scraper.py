#!/usr/bin/env python3
"""
Quick demo: generate sample markdown from X-like post data
"""

from datetime import datetime
from x_prompt_scraper import compose_markdown, unique_filepath
from pathlib import Path

def main():
    # Sample post data similar to what would be scraped
    sample_posts = [
        {
            "id": "1234567890",
            "text": "🧠 Prompt Engineering Tip: Always provide context and examples. \n\nInstead of: 'Write a summary'\nTry: 'Write a 3-sentence summary of this article for a busy executive who needs the key points quickly.'\n\nContext + Examples = Better Results",
            "date": "2025-11-13",
            "likes": 42,
            "retweets": 15,
            "replies": 8,
            "url": "https://x.com/lijigang_com/status/1234567890"
        },
        {
            "id": "1234567891", 
            "text": "New framework for critical thinking prompts:\n\n1. Clarify the question\n2. Analyze assumptions\n3. Evaluate evidence\n4. Consider alternatives\n5. Draw conclusions\n\nUse this 5-step process for better decision-making prompts.",
            "date": "2025-11-12",
            "likes": 28,
            "retweets": 9,
            "replies": 5,
            "url": "https://x.com/lijigang_com/status/1234567891"
        }
    ]
    
    output_dir = Path("/Users/shichaopeng/Work/self-dir/roc-blog/boring/content/blog/prompt/demo")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for post in sample_posts:
        title = post["text"].split('\n')[0][:50].strip()
        if len(title) < 10:
            title = post["text"][:50].strip()
        
        post["title"] = title
        md_content = compose_markdown(post)
        
        # Generate unique filename
        from x_prompt_scraper import sanitize_title
        safe_title = sanitize_title(title)
        filename = f"{post['date']}-{safe_title}.md"
        filepath = output_dir / filename
        
        # Handle duplicates
        if filepath.exists():
            filepath = output_dir / f"{post['date']}-{safe_title}-demo.md"
        
        filepath.write_text(md_content, encoding='utf-8')
        print(f"✓ Generated: {filepath.name}")
        print(f"  Title: {title}")
        print(f"  Likes: {post['likes']} | Retweets: {post['retweets']} | Replies: {post['replies']}")
        print()
    
    print(f"🎉 Sample posts saved to: {output_dir}")
    print("\nExample markdown content:")
    print("=" * 50)
    print(compose_markdown(sample_posts[0]))

if __name__ == '__main__':
    main()