# 为博客内容添加可选密码保护 — 设计文档

- **状态**：Draft（待用户审阅）
- **作者**：roc（与 pi 协作）
- **创建日期**：2025-07-31

## 1. 目标

为 `roc-blog`（Zola 静态博客，`boring/` 主题）的博客文章提供**可选**的密码保护功能：
未启用时完全不受影响；启用后整篇文章在浏览器端加密保护，需正确密码才能查看。

技术基础：复用 [StaticShield](https://github.com/wangshengithub/staticshield) 的加密核心（AES-256-CBC + PBKDF2-SHA256 100 万次迭代 + HMAC-SHA256 验签，浏览器 WebCrypto 解密）。

## 2. 用户故事

作为博客作者，我希望：
- 对单篇文章（不是全部）启用密码保护，按文章粒度控制。
- 在 frontmatter 里直接写密码，简单明了。
- 文章列表/首页仍能看到文章存在（带 🔒 标记），不消失。
- 不启用密码的文章完全不受任何影响，构建产物与现状一致。

作为博客读者，我希望：
- 在列表里能看出哪些文章需要密码。
- 不知道密码也能知道"这篇文章存在 + 标题 + 摘要"。
- 输入正确密码后在浏览器端本地解密，无后端调用。

## 3. 架构概览

```
[源] boring/content/blog/foo.md
        frontmatter: password = "xxx", password_hint = "?", remember_days = 7
        │
        ▼  zola build
[HTML] boring/public/blog/foo/index.html      ← Zola 正常产物（列表页/首页也是这时生成）
        │
        ▼  node boring/scripts/encrypt-posts.mjs
        │
        ├── 扫描 content/blog/*.md → 取 password / hint / remember_days
        ├── 读取 public/blog/<slug>/index.html → 整页 HTML
        ├── StaticShield crypto-core.js → encryptHtml(html, password, opts)
        ├── StaticShield render.js → renderEncryptedHtml(meta, core, ui)
        └── 写回 public/blog/<slug>/index.html

[产物] 同一个 index.html 变成 StaticShield 自解密页面
[未标记的] 其它文章保持 Zola 原样，不受影响
```

**核心约束**：Zola 本身不支持在 build 时调 Node 加密，因此必须**后处理**——保持 Zola 不动，在它 build 完后跑 Node 脚本。

## 4. 触发条件

| frontmatter 字段 | 类型 | 含义 | 缺省 |
|---|---|---|---|
| `password` | string | 加密密码 | 无（缺它/空字符串 = 不加密）|
| `password_hint` | string | 解锁页提示文案 | 空 |
| `remember_days` | number | 本机"记住我"天数，0 = 永久 | 不启用记住 |

**字段位置**：同时支持顶层字段和 `[extra]` 块。脚本优先读 `[extra]`，回退顶层。

**示例**：

```toml
+++
title = "私密草稿"
date = 2024-09-19

# 写法 A：顶层
password = "MySecret123"

# 写法 B：[extra] 块（Zola 习惯）
[extra]
password = "MySecret123"
password_hint = "我的生日"
remember_days = 7
+++
```

## 5. 文件清单

### 新增

| 路径 | 用途 |
|---|---|
| `boring/scripts/encrypt-posts.mjs` | 主入口脚本（Node ≥18，纯 stdlib + vendor 模块）|
| `boring/scripts/lib/frontmatter.mjs` | 极简 TOML frontmatter 解析器（stdlib 实现）|
| `boring/scripts/lib/staticshield/crypto-core.js` | vendor 自 StaticShield |
| `boring/scripts/lib/staticshield/render.js` | vendor 自 StaticShield |
| `boring/scripts/lib/staticshield/decrypt-ui.js` | vendor 自 StaticShield |
| `boring/scripts/test-encryption.sh` | 端到端冒烟测试脚本 |
| `docs/features/encryption.md` | 用户文档 |
| `docs/features/encryption-dev.md` | 开发者文档 |

### 修改

| 路径 | 改动 |
|---|---|
| `boring/build.sh` | 在 `zola build` 之后追加 `node scripts/encrypt-posts.mjs` |
| `boring/templates/page.html` | 标题前条件渲染 🔒 SVG |
| `boring/templates/section.html` | 列表项里条件渲染 🔒 徽标 |
| `boring/templates/index.html` | 首页卡片条件渲染 🔒 徽标 |
| `boring/templates/macros.html` | （如适用）传递 `password` 字段到 list-item 模板 |
| `boring/static/css/style.css` | 追加 `.post-locked` 与 `.post-locked-badge` 样式 |
| `README.md` | 在"快速开始"提及加密功能 |
| `boring/README.md` | （如存在）在"添加新文章"加引用 |

## 6. 脚本核心逻辑

```
async function main():
    1. 扫描 content/blog/*.md，过滤掉 _index.md / 非 .md
    2. 对每个文件 parseFrontmatter() → { password, hint?, rememberDays? }
    3. 无 password 或 password === '' → 跳过
    4. 找到 public/blog/<slug>/index.html
       - 不存在 → warn（草稿/未渲染）→ 跳过
       - 含 StaticShieldCrypto 标记 → 跳过（幂等）
    5. crypto.encryptHtml(html, password, { useSha512: false }) → meta
    6. meta.title = ''；meta.logo = ''
    7. 若 hint → meta.hint = hint
    8. 若 rememberDays != null 且 rememberDays >= 0 → meta.rememberDays = rememberDays（0 = 永久，必须保留）
    9. render.renderEncryptedHtml(meta, CORE_SRC, UI_SRC) → encryptedHtml
    10. 写回 public/blog/<slug>/index.html
    11. 汇总：X 加密，Y 失败，Z 跳过
```

**容错**：单篇失败不阻塞其它文章；非 0 退出码只在**全部失败**时设置。

## 7. 模板改动

### 7.1 单篇页 `page.html`

```tera
<h1 class="...">
  {% if page.extra.password or page.password %}
    <svg class="post-locked" viewBox="0 0 24 24" aria-label="加密文章">
      <path d="..."/>
    </svg>
  {% endif %}
  {{ page.title }}
</h1>
```

### 7.2 列表 / 首页 `section.html` / `index.html`

在每个 post card 的标题附近：
```tera
{% if page.extra.password or page.password %}
  <span class="post-locked-badge" title="加密文章">🔒</span>
{% endif %}
```

### 7.3 CSS

追加到 `static/css/style.css` 末尾：

```css
.post-locked {
  display: inline-block;
  width: 1em; height: 1em;
  vertical-align: -0.15em;
  fill: currentColor;
  margin-right: 0.3em;
  opacity: 0.7;
}
.post-locked-badge {
  font-size: 0.85em;
  opacity: 0.7;
  margin-left: 0.25em;
}
```

## 8. 构建脚本集成

**修改 `boring/build.sh`**：

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

zola build -o roc-blog

# 新增 ↓↓↓
if [ -d content/blog ]; then
  node scripts/encrypt-posts.mjs || echo "⚠ 加密步骤失败，继续（普通文章仍可访问）"
fi
```

加密失败**不阻塞构建退出码**——这是可选增强，普通文章必须能正常发版。

## 9. 解密页样式

**默认沿用 StaticShield 原版紫调**（`#ddcdef` 背景、`#9932cc` 按钮）。理由：
- StaticShield 的样式已经过调优、跨浏览器、自适应移动端。
- 主题色适配属于独立增强功能，留作后续迭代（YAGNI）。
- 解密页是一个独立的"门禁页面"，跟博客正文视觉解耦反而合理。

## 10. 边界情况

| 场景 | 期望行为 |
|---|---|
| `password = ""` | 视为未加密，跳过 |
| `password` 写了但 Zola 未生成产物（草稿 / `_index.md`） | warn 并跳过，不报错 |
| 重复构建（产物已被加密过） | 幂等：检测 `StaticShieldCrypto` 标记就跳过 |
| 标题/正文包含敏感字符（`</script>` 等） | StaticShield 现有 base64 + JSON 转义已覆盖 |
| `remember_days = -1` | 忽略该字段，不传给 StaticShield |
| 密码含特殊字符（`"` / 换行 / Unicode） | JSON 字符串传递，StaticShield 兼容 |
| 多篇文章加密 | 串行处理；每篇 ~1s（PBKDF2 100 万次迭代）|
| 中文 / emoji 正文 | UTF-8 全文加密，StaticShield 已验证 |
| `[extra]` 与顶层同时有 `password` | `[extra]` 优先 |

## 11. 测试策略

无正式单元测试框架。提供 `boring/scripts/test-encryption.sh` 端到端冒烟脚本：
1. 在 `content/_test/` 写入带 `password` 的测试文章
2. 跑 `zola build -o roc-blog`
3. 跑 `node scripts/encrypt-posts.mjs`
4. 断言：产物含 `StaticShieldCrypto` 标记；产物不包含明文测试内容
5. 清理

## 12. 上游同步

vendor 的 3 个 StaticShield 文件需要偶尔同步上游修复/改进。在 `docs/features/encryption-dev.md` 末尾记录同步命令：

```bash
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/crypto-core.js \
  > scripts/lib/staticshield/crypto-core.js
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/render.js \
  > scripts/lib/staticshield/render.js
curl -fsSL https://raw.githubusercontent.com/wangshengithub/staticshield/main/src/decrypt-ui.js \
  > scripts/lib/staticshield/decrypt-ui.js
```

## 13. 文档

| 文档 | 受众 | 内容 |
|---|---|---|
| `docs/features/encryption.md` | 博客作者 | 功能介绍、字段说明、示例、FAQ（忘记密码、SEO、已发布文章加密）|
| `docs/features/encryption-dev.md` | 维护者 | vendor 同步流程、脚本扩展点、上游更新注意事项 |
| `README.md`（根）| 所有人 | 提及加密功能存在，链接到详细文档 |
| `boring/README.md`（如存在）| 主题使用者 | 在"添加新文章"段落加引用 |

## 14. 非目标（明确不做）

- 整站密码保护（全站加密不是个人博客的合理需求）
- 多用户/多密码权限管理（密码就是 access token，没用户系统）
- 密码找回机制（PBKDF2 单向派生，无法找回；StaticShield 也不存任何密码）
- 加密 RSS feed（清单中 RSS 显示标题/摘要，标题本身已在 frontmatter 明文，加密 feed 是另一层语义）
- 密码修改界面（修改密码 = 重新构建 + 部署；写文档说明即可）
- 与 Zola 深度集成（如自定义 shortcode）（侵入性大，YAGNI）

## 15. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 忘记密码 = 内容永久丢失 | 在文档明确告知；CI 可加构建时校验（密码非空）|
| 密码进 git 仓库（明文）| 用户明确选择（决策记录）；文档建议只放非生产密码 / 内容不敏感|
| 上游 StaticShield 严重 bug | vendor 可立即回滚到上一版本（3 个小文件）；脚本与上游解耦|
| Zola 升级后模板变量访问方式变化 | 模板同时检查 `page.password` 和 `page.extra.password` 兼容两种风格|
| 解密页与博客样式严重不一致 | 已纳入"非目标"，但文档里预留"主题色适配"为后续可选项|
| 浏览器禁用 WebCrypto | StaticShield 自带降级提示；本设计无额外兜底（静态页无解）|

## 16. 实施步骤（高层）

1. 创建目录骨架与 vendor 3 个 StaticShield 文件
2. 实现 `frontmatter.mjs`（TOML 极简解析 + 字段提取）
3. 实现 `encrypt-posts.mjs`（扫描 + 加密 + 写回 + 汇总）
4. 实现 `test-encryption.sh`
5. 修改 `boring/build.sh` 集成加密步骤
6. 修改 `page.html` / `section.html` / `index.html` 加 🔒
7. 修改 `static/css/style.css` 加徽标样式
8. 写用户文档 `encryption.md` + 开发者文档 `encryption-dev.md`
9. 更新 `README.md` / `boring/README.md`
10. 端到端冒烟测试

具体每步的子任务见实施计划（writing-plans 阶段产物）。