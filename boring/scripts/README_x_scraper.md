# X (Twitter) Prompt Scraper

从 X (原 Twitter) 用户页面抓取 prompt 内容并生成 Markdown 博客文章。

## 安装依赖

```bash
pip install selenium webdriver-manager
```

## 使用方法

### 基础抓取
```bash
python boring/scripts/x_prompt_scraper.py
```

### 增量抓取（跳过已处理内容）
```bash
python boring/scripts/x_prompt_scraper.py --incremental --max-posts 50
```

### 使用 cookies（推荐）
1. 登录 X 后导出 cookies（使用浏览器插件）
2. 保存为 `cookies.json`
3. 运行：
```bash
python boring/scripts/x_prompt_scraper.py --cookies cookies.json --incremental
```

### 参数说明
- `--user-url`: 用户页面URL (默认: https://x.com/lijigang_com)
- `--outdir`: 输出目录 (默认: /Users/shichaopeng/Work/self-dir/roc-blog/boring/content/blog/prompt/)
- `--cookies`: cookies文件路径
- `--max-posts`: 最大抓取数量 (默认: 100)
- `--headless/--no-headless`: 是否无头模式
- `--incremental`: 增量抓取模式
- `--log-level`: 日志级别 (DEBUG/INFO/WARNING/ERROR)

## 输出格式

生成的 Markdown 文件包含：
- 标准 front matter (标题、日期、标签等)
- Prompt 完整内容
- 互动数据（点赞、转发、评论数）
- 原始链接

文件名格式：`YYYY-MM-DD-标题.md`

## 增量抓取

使用 `--incremental` 参数时，脚本会：
1. 读取 `.x_prompt_index.json` 索引文件
2. 跳过已处理的内容
3. 只保存新的内容
4. 更新索引文件

## 备份

所有抓取的数据会自动保存为 JSON 备份文件在 `backup/` 目录下。