# 文章密码保护（可选）

roc-blog 支持对**单篇文章**启用密码保护：基于 [StaticShield](https://github.com/wangshengithub/staticshield) 的浏览器端加密（AES-256-CBC + PBKDF2 100 万次迭代 + HMAC-SHA256）。

加密是**完全可选**的——没有 `password` 字段的文章构建后保持原样，不受任何影响。

## 快速启用

在任意 Markdown 文章的 frontmatter 里加 `password: "xxx"`（YAML）或 `password = "xxx"`（TOML）即可：

**YAML（推荐，与现有博客风格一致）：**

```markdown
---
title: "我的私密草稿"
date: 2024-09-19
password: "MySecret123"
password_hint: "我的生日"
remember_days: 7
---

正文…
```

**TOML：**

```markdown
+++
title = "我的私密草稿"
date = 2024-09-19

[extra]
password = "MySecret123"
password_hint = "我的生日"
remember_days = 7
+++

正文…
```

下次构建发布后，该文章会被自动加密。

## 字段说明

| 字段 | 必填 | 含义 |
|---|---|---|
| `password` | ✅ | 加密密码；非空字符串才会触发加密 |
| `password_hint` | 可选 | 解锁页面上显示的提示文案 |
| `remember_days` | 可选 | 本机"记住我"天数；`0` = 永不过期 |

字段可以写在顶层，也可以写在 `extra:` / `[extra]` 块里（推荐与 Zola 习惯一致）。

## 体验流程

1. 访客访问 `https://scp.net.cn/blog/<slug>/`
2. 看到一个卡片式解锁页（默认 StaticShield 紫调）
3. 输入正确密码 → 浏览器端本地解密，原始内容展现
4. 错误密码 → 卡片内红色提示 + 抖动反馈（不会弹原生 alert）

## FAQ

**忘记密码怎么办？**
无法找回。PBKDF2 是单向派生，工具本身不存储密码。建议先用 `remember_days` 测试或本地草稿验证。

**加密文章的标题/摘要会出现在列表/搜索/RSS 里吗？**
会。frontmatter 里的 `title` / `description` / `date` 是明文（用于列表展示），加密的只是文章正文。
列表里加密文章的标题旁边会有 🔒 标记。

**我能否给已发布的文章加密码？**
可以。重新构建后该文章会被自动加密。已部署的旧 HTML 会被替换为加密版本。

**安全性如何？**
浏览器端解密意味着密文会下发给客户端。适合"门禁式"访问控制（防直接查看/抓取、防止搜索引擎索引正文），不构成对资深逆向者的绝对防护。

**密码会进 git 仓库吗？**
取决于你。frontmatter 明文会进 git——如果博客源码是私有的，这没问题；如果是公开仓库，请评估风险（见 spec 决策 §4）。

**能否给已加密文章改密码？**
可以。修改 frontmatter 里的 `password` 字段，重新构建部署即可。已部署的旧 HTML 会被替换；持有旧密码的人无法再访问。

## 实现细节（开发者）

见 `encryption-dev.md`。