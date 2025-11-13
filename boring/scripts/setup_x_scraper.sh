#!/bin/bash
# Quick setup script for X scraper

set -e

echo "Setting up X scraper environment..."

# Install dependencies
echo "Installing Python dependencies..."
pip install selenium webdriver-manager

# Make scripts executable
chmod +x boring/scripts/x_prompt_scraper.py
chmod +x boring/scripts/export_x_cookies.py
chmod +x boring/scripts/test_x_scraper.py

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Export cookies: python boring/scripts/export_x_cookies.py"
echo "2. Run tests: python boring/scripts/test_x_scraper.py"
echo "3. Scrape posts: python boring/scripts/x_prompt_scraper.py --cookies cookies.json --incremental"
echo ""
echo "For help: python boring/scripts/x_prompt_scraper.py --help"