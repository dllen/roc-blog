## 目标
抓取 `https://x.com/lijigang_com` 最新 30 条推文中符合“34 个分号边界标记”的 Prompt，并保存为 Markdown（含前言与互动数据），同时生成备份 JSON 与增量索引。

## 执行步骤
- 准备（建议）：导出并提供登录 cookies 以提高可见性与稳定性
  - `python boring/scripts/export_x_cookies.py`（或提供现成 `cookies.json`）
- 运行抓取命令（仅保存含合法 Prompt 的推文）：
  - `python boring/scripts/x_prompt_scraper.py --user-url "https://x.com/lijigang_com" --max-posts 30 --headless --outdir "/Users/shichaopeng/Work/self-dir/roc-blog/boring/content/blog/prompt/" --incremental --cookies /path/to/cookies.json`
  - 若无 cookies：去掉 `--cookies` 参数运行，可能抓取数低于 30

## 过滤与提取
- 仅当正文中存在整行 `;{34}` 作为“起始/结束”边界时，提取边界间的完整 Prompt；其余推文跳过
- 多块按出现顺序写入 Markdown 的 `## Prompt 1/2/...` 分节

## 输出与验证
- 备份：`prompt/backup/x-backup-YYYYMMDDHHMMSS.json`
- Markdown：`prompt/YYYY-MM-DD-<title>.md`（自动去重与安全文件名）
- 日志：显示抓取条数、保存文件路径与告警（未闭合块、无匹配等）
- 验证：统计生成的 Markdown 数量与备份 JSON 中记录数；抽查文件内容是否保真

## 异常处理
- 若抓取不足：
  - 使用 cookies 运行；或提升 `--max-posts` 并滚动更多
  - 观察速率限制与页面加载情况
- 若有未闭合/中部分号：日志 WARN 并跳过该块

## 性能
- Selenium 抓取受网络与页面加载影响；提取器与保存均为流式、线性，资源占用可控
- 预计单次运行数分钟内（网络正常），生成 30 条以内输出

请确认后我将立即执行并回传抓取结果与生成文件列表。