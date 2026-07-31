# 加密功能 — 开发者文档

## 架构

```
zola build → public/blog/<slug>/index.html
              ↓
node scripts/encrypt-posts.mjs
              ↓
              对含 password 字段的文章加密
              ↓
              public/blog/<slug>/index.html  (被 StaticShield 自解密页替换)
```

`encrypt-posts.mjs` 与 Zola 完全解耦——它只读 Zola 已渲染的 HTML，然后按 frontmatter 元数据决定是否加密、如何加密。

## 文件结构

```
boring/scripts/
├── encrypt-posts.mjs          # 主入口
├── test-encryption.sh         # 端到端冒烟测试（需要 zola）
├── lib/
│   ├── frontmatter.mjs        # 极简 TOML/YAML frontmatter 解析
│   ├── test-frontmatter.mjs   # 单元测试（node:test）
│   └── staticshield/          # vendor 自 StaticShield
│       ├── crypto-core.js
│       ├── render.js
│       ├── decrypt-ui.js
│       └── UMD-README.md      # 注明 vendor 政策（勿编辑）
```

## vendor 同步

`boring/scripts/lib/staticshield/` 里的 3 个 JS 文件是从 [StaticShield](https://github.com/wangshengithub/staticshield) vendor 来的。**不要直接编辑**这些文件。

需要同步上游时：

```bash
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/crypto-core.js \
  > boring/scripts/lib/staticshield/crypto-core.js
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/render.js \
  > boring/scripts/lib/staticshield/render.js
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/decrypt-ui.js \
  > boring/scripts/lib/staticshield/decrypt-ui.js
```

注意：上游若改了 `src/template.js` / `src/favicon.js` / `src/encrypt.js`，vendor 这里**不会**自动跟上——本项目只依赖加密核心 + 渲染模板 + 解密运行时。

## 测试

```bash
# 单元测试（frontmatter parser）
cd boring && node --test scripts/lib/test-frontmatter.mjs

# 端到端冒烟（需要 zola）
cd boring && bash scripts/test-encryption.sh
```

## 扩展点

| 想做什么 | 改哪里 |
|---|---|
| 新增 frontmatter 字段（如 `password_kdf = "sha512"`）| `scripts/lib/frontmatter.mjs` 的 `KNOWN_EXTRA` 数组；`scripts/encrypt-posts.mjs` 的 processPost |
| 修改解密页样式 | 上游 StaticShield 改 CSS，或 fork `lib/staticshield/render.js` 重写 |
| 解密页主题色适配博客 | fork `lib/staticshield/render.js` 里的 CSS 字符串 |
| 改默认 PBKDF2 迭代次数 | 修改 `encrypt-posts.mjs` 里 `crypto.encryptHtml(html, password, { iterations: N })` |

## 边界情况速查

| 场景 | 行为 |
|---|---|
| `password` 缺失 / 空字符串 | 跳过（视为未加密）|
| `password` 在顶层 | 识别（兼容 Zola 习惯）|
| `password` 在 `[extra]` / `extra:` 块 | 识别（[extra] 优先于顶层）|
| Zola 没渲染该 slug（草稿 / typo） | warn 并跳过 |
| 已加密过的产物再跑 | 跳过（幂等）|
| `remember_days < 0` | 忽略字段（保守）|
| 单篇文章加密失败 | log 错误，继续处理其它文章 |
| 全部文章加密失败 | exit 1；部分失败 exit 0 |

## 实现要点

- **零运行时依赖**：pure stdlib (Node ≥18) + vendored JS
- **隐式触发**：无需 `encrypted = true` 之类的开关，frontmatter 里有 `password` 就加密
- **安全上下文依赖**：解密依赖浏览器 WebCrypto；纯 HTTP 部署下浏览器拒绝运行——博客必须 HTTPS / localhost / file://
- **URL hash 分享链接**：StaticShield 支持 `#pwd=xxx` 自动解密 + 清除 hash；本项目暂未自动生成（用户在加密页手动测试）