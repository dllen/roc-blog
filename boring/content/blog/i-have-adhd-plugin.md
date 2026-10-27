---
title: "i-have-adhd：让 AI 编码助手先说再做"
date: 2026-10-27
update_date: 2026-10-27
description: "一个 51.9k stars 的编码助手插件，用 10 条输出规则强制 AI 给出 ADHD 友好型回答：开头就是动作、步骤编号、结尾给下一步，没有铺垫和客套。附 Before/After 对比、多平台安装方式和自定义调优方法。"
tldr: "LLM 回答的最大问题不是错，而是把答案埋在铺垫里——i-have-adhd 用 10 条规则把「下一步做什么」提到回答的第一句。"
keywords: ["i-have-adhd", "Claude 插件", "ADHD 友好输出", "AI 编码助手", "prompt 工程", "输出风格约束"]
taxonomies:
  tags: ["AI与编程", "Claude插件", "效率工具", "prompt工程"]
---

# i-have-adhd：让 AI 编码助手先说再做

用过 Claude Code、Codex 或 Cursor 的人都有过这种体验：问一个具体的技术问题，AI 先复述三遍背景，再把真正该执行的两条命令埋在第四段中间，结尾附赠一句「希望这对你有帮助」。**答案是对的，但你得自己把它挖出来。**

[i-have-adhd](https://github.com/ayghri/i-have-adhd) 就是来解决这件事的。它是一个编码助手 skill 插件，用 10 条硬性规则约束 AI 的输出风格：直接、可执行、无废话。项目灵感来自 *The Adult ADHD Tool Kit*（Ramsay & Rostain），作者把书里「如何对 ADHD 人士说话」的原则翻译成了「LLM 应如何回应」的规则集。无需 ADHD 诊断——任何人都受益于不再被埋没的答案。

项目数据：GitHub 约 51.9k stars，MIT 协议，支持中英日韩等 10 种语言。

## 一个直观的 Before / After

场景：你问「我的 JWT 验证报错了，怎么修？」

**Before（传统 LLM 输出）**：

> 好的，我来帮你分析一下这个 JWT 验证报错的问题。首先需要理解一下整个认证流程。在你的应用中，`src/auth.ts` 文件里的 `verifyToken` 函数负责解析和验证 JWT token……（四段铺垫之后）……如果还有问题，可以把完整的报错贴出来，我再帮你看看。希望这对你有帮助！

信息都在，但「该做什么」混在叙述里，读者要自己提炼。

**After（启用 i-have-adhd）**：

> 升级 `jsonwebtoken` 到最新版，然后替换 `verifyToken` 函数。
>
> 1. 运行 `npm install jsonwebtoken@latest`
> 2. 打开 `src/auth.ts`
> 3. 替换 42–58 行的 `verifyToken` 为：
>    ```ts
>    export function verifyToken(token: string): Payload {
>      return jwt.verify(token, process.env.JWT_SECRET!, {
>        algorithms: ['HS256']
>      }) as Payload;
>    }
>    ```
> 4. 运行 `npm test -- auth.spec.ts`
>
> 下一步：如果有测试失败，贴出第一行报错。

开头就是动作，步骤编号，结尾指明下一步。3 秒知道该干嘛。

## 核心：10 条输出规则

插件的全部行为定义在 `skills/i-have-adhd/SKILL.md` 里，规则如下：

1. **先说下一步动作**——回答开头必须是可执行操作，不是背景铺垫
2. **多步任务必须编号**——用 1/2/3 明确步骤
3. **结尾给一个具体下一步**——告诉用户「做完这些之后做什么」
4. **压制离题内容**——不展开与当前任务无关的旁支
5. **每轮重述当前状态**——让读者始终知道「我在哪」
6. **给出具体时间估算**——用「分钟」为单位，不说「稍等片刻」
7. **让进展可见**——显式标注已完成/进行中的状态
8. **错误信息就事论事**——不煽情、不铺垫，直接说错在哪
9. **列表最多 5 项**——超过就分块或截断，避免信息过载
10. **没有前言、没有回顾、没有客套**——不写「好的，我来帮你」，也不写「希望对你有帮助」

对照上面的 After 例子：规则 1（先说动作）、规则 2（编号步骤）、规则 3（结尾下一步）、规则 4（没展开 auth 流程背景）、规则 9（4 步）、规则 10（无客套）全部命中。

## 安装与使用

最快的方式是直接在编码助手的 CLI 里粘贴：

```text
Install the i-have-adhd skill/plugin from https://github.com/ayghri/i-have-adhd,
refer to the repo's AGENTS.md for instructions.
```

手动安装参见仓库的 `INSTALL.md`，各平台配置路径：

| 平台 | 配置路径 |
|------|----------|
| Claude Code | `.claude-plugin/` |
| Codex | `.codex-plugin/` |
| Cursor | `.cursor/skills/i-have-adhd` |
| OpenCode | `.opencode/` |
| Gemini / Kimi / Qwen | `gemini-extension.json` / `kimi.plugin.json` / `qwen-extension.json` |

安装后在会话中调用 `/i-have-adhd` 即可触发该输出风格。

## 自定义调优

想放宽列表限制或调整语气，fork 后改 `skills/i-have-adhd/SKILL.md`，然后替换本地版本：

```bash
claude plugin uninstall i-have-adhd
claude plugin marketplace remove i-have-adhd
claude plugin marketplace add <your-username>/i-have-adhd
claude plugin install i-have-adhd@i-have-adhd
```

重启编码助手后再次调用 `/i-have-adhd` 生效。

## 为什么这套规则值得单独拿出来说

即使你不装这个插件，这 10 条规则本身也是一份很好的**输出风格约束模板**。任何需要 AI 产出「给人看的行动指引」的场景——技术文档、运维手册、内容改写流程——都可以借用同一套逻辑：先说动作、步骤编号、限制列表长度、砍掉客套。它的本质是把「信息检索成本」从读者侧转移到作者（AI）侧，让读者用最低的认知开销拿到下一步。

## 相关资源

- GitHub：<https://github.com/ayghri/i-have-adhd>
- 灵感来源：*The Adult ADHD Tool Kit* — J. Russell Ramsay & Anthony L. Rostain
