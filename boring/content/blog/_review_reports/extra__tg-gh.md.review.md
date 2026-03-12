# 技术评审报告：extra/tg-gh.md

- 发现问题：高 2 / 中 2 / 低 1
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L71-L93 | 技术准确性 | JSON 片段无法解析：Expecting ',' delimiter: line 6 column 20 (char 102) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 2 | L201-L205 | 技术准确性 | JSON 片段无法解析：Extra data: line 1 column 10 (char 9) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 3 | L69 | 逻辑完整性 | 相对链接目标不存在：bfather.png | 确认路径或补充对应文件。 | 中 |
| 4 | L95 | 逻辑完整性 | 相对链接目标不存在：scr.png | 确认路径或补充对应文件。 | 中 |
| 5 | L43 | 可读性 | 段落行过长（>160） | 适当换行或拆分段落，提升可读性与 diff 友好度。 | 低 |

## 建议批注写法（可直接复制到原文对应位置）

### Issue 1（高）
<!-- TODO(高): JSON 片段无法解析：Expecting ',' delimiter: line 6 column 20 (char 102) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

### Issue 2（高）
<!-- TODO(高): JSON 片段无法解析：Extra data: line 1 column 10 (char 9) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

### Issue 3（中）
<!-- TODO(中): 相对链接目标不存在：bfather.png -->
> **Note:** 确认路径或补充对应文件。

### Issue 4（中）
<!-- TODO(中): 相对链接目标不存在：scr.png -->
> **Note:** 确认路径或补充对应文件。

### Issue 5（低）
<!-- TODO(低): 段落行过长（>160） -->
> **Note:** 适当换行或拆分段落，提升可读性与 diff 友好度。

## 重构版本（建议整段替换：JSON 示例 + Actions 运行时）

### Issue 1：从 Telegram `jsondump` 获取 chat id 的示例 JSON

原文 JSON 里混入了注释且缺少逗号，建议改为合法 JSON（并把解释放到 JSON 外）：

```json
{
  "update_id": 143943779,
  "message": {
    "message_id": 181575,
    "from": {
      "id": 123456,
      "is_bot": false,
      "first_name": "Tg Name",
      "username": "TG Username",
      "language_code": "en"
    },
    "chat": {
      "id": 123456,
      "first_name": "Tg Name",
      "username": "TG Username",
      "type": "private"
    },
    "date": 1584119424,
    "text": "message"
  }
}
```

> **Note:** 需要的是 `message.chat.id`（或在 private chat 下 `from.id` 与 `chat.id` 通常一致）。不要把注释写进 JSON。

### Issue 2：`package.json` scripts 片段不是合法 JSON

原文片段是 JSON 的一部分，建议给出完整且可直接粘贴的片段（避免尾部逗号）：

```json
{
  "scripts": {
    "build": "ncc build index.js -C -m -o dist"
  }
}
```

### 关键时效性：GitHub Actions Node 运行时升级

原文 `runs.using: node12` 已过时，建议更新为 Node 20：

```yaml
runs:
  using: "node20"
  main: "dist/index.js"
```

### 关键时效性：`@zeit/ncc` 更名

原文依赖 `@zeit/ncc` 已更名为 `@vercel/ncc`，建议改为：

```bash
npm i -D @vercel/ncc
# 或
yarn add -D @vercel/ncc
```

### 逻辑完整性：缺失图片资源（bfather.png / scr.png）

原文引用了本地图片但目录下不存在，建议二选一：

1) 补齐图片文件并保证相对路径正确；或  
2) 改为外链图片/删除截图，改用文字步骤描述（更利于长期维护）。
