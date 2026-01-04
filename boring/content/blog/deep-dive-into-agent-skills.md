---
title: "彻底搞懂 Agent Skills：从原理到实践"
date: 2026-01-04
description: "深入解析 Agent Skills 的本质、渐进式披露机制以及与 MCP 的核心差异"
tldr: "Skill 是教 AI “怎么做”的知识胶囊，MCP 是给 AI “用什么”的工具接口。本文带你彻底搞懂 Agent Skills 的方方面面。"
tags: ["Agent", "LLM", "Claude", "MCP"]
---

随着 AI Agent 生态的演进，Anthropic 最近推出了 **Agent Skills**（智能体技能）。这不仅仅是一个新功能，更是一种让 AI 更加专业化、标准化的新范式。

很多开发者容易将 Skills 与 MCP（Model Context Protocol）混淆。本文将结合官方文档与实战经验，带你彻底搞懂 Agent Skill 的本质、使用方法、背后的设计哲学以及它与 MCP 的根本区别。

## 1. Agent Skill 的本质是什么？

简单来说，**Agent Skill 是一个包含指令的 Markdown 文件，它教会 Claude 如何完成特定的任务。**

如果把 AI 比作一个新入职的员工：
- **Prompt** 是你临时的一句话命令。
- **Memory** 是他的记事本。
- **MCP** 是你给他配的电脑、数据库权限和 API 工具。
- **Skill** 则是你发给他的**员工手册**或**SOP（标准作业程序）**。

Skill 赋予了 AI “专业知识”和“流程规范”。它不是工具本身，而是关于**如何使用工具**以及**遵循什么标准**的知识。

例如，你可以创建一个 Skill 来教 Claude：
- 按照团队特定的代码规范审查 Pull Request。
- 生成符合公司格式的 Git Commit Message。
- 查询数据库时优先使用特定的优化 SQL 模式。
- 使用 Python 脚本生成符合 Slack 限制的 GIF 动图。

本质上，Skill 是**结构化的上下文注入**。

## 2. Agent Skill 的使用方法

使用 Skill 非常简单，核心在于创建一个 `SKILL.md` 文件。

### 2.1 文件结构

一个最简单的 Skill 只需要一个文件夹和一个 `SKILL.md` 文件：

```text
my-skill/
└── SKILL.md
```

`SKILL.md` 由两部分组成：
1. **YAML Frontmatter**：元数据，告诉 Claude 这个技能叫什么，什么时候用。
2. **Markdown 内容**：具体的指令和示例。

### 2.2 编写示例

```markdown
---
name: code-reviewer
description: 当用户请求审查代码或 PR 时使用此技能。它定义了团队的代码审查标准。
---

# Code Reviewer Skill

## 审查标准
1. **命名规范**：确保所有变量使用驼峰命名法 (camelCase)。
2. **错误处理**：所有外部调用必须包含 try-catch 块。
3. **注释**：公共方法必须有 Javadoc/Docstring。

## 步骤
1. 阅读代码变更。
2. 检查是否符合上述标准。
3. 输出 Markdown 格式的审查报告。
```

### 2.3 存放位置

Claude 会根据存放位置决定 Skill 的生效范围：

| 位置 | 路径 | 适用范围 |
| :--- | :--- | :--- |
| **项目级** | `.claude/skills/` | 仅当前项目可用，适合项目特定的规范 |
| **个人级** | `~/.claude/skills/` | 跨项目可用，适合个人的工作流偏好 |
| **企业级** | (托管配置) | 组织内所有成员可用 |

### 2.4 自动触发

你**不需要**显式调用 Skill（如 `/review-code`）。当你的 Prompt 意图与 Skill 的 `description` 匹配时，Claude 会自动加载并应用该 Skill。

### 2.5 实战演示：构建“SVG 图标生成助手”

让我们构建一个更实用的 Skill，教 Claude 如何生成风格统一的 SVG 图标。这个例子展示了 Skill 如何结合外部文件来增强能力。

**目录结构：**
```text
.claude/skills/svg-icon-generator/
├── SKILL.md
└── palette.json  # 存储品牌配色方案
```

**文件内容 (`SKILL.md`)：**

```markdown
---
name: svg-icon-generator
description: 当用户需要创建、设计或生成 SVG 图标/图像时使用。
---

# SVG Icon Generator

## 任务目标
生成符合 Material Design 风格的 SVG 代码。

## 设计约束
1. **尺寸**：默认 24x24 viewBox。
2. **颜色**：必须优先从 `palette.json` 中读取品牌色。
3. **结构**：尽量使用 `<path>` 元素，保持代码精简。

## 执行步骤
1. 读取 `palette.json` 获取允许的颜色列表。
2. 根据用户描述设计图标几何形状。
3. 输出完整的 `<svg>` 代码块。
4. 验证 SVG 是否闭合且无语法错误。

## 示例
**用户**："画一个红色的删除按钮"
**行为**：读取调色板找到 "danger-red" (#FF5252)，生成一个带 "X" 符号的圆形图标。
```

通过这个结构，Claude 不仅学会了“怎么画”，还学会了“用什么颜色画”，确保了输出的一致性。

## 3. 渐进式披露机制 (Progressive Disclosure)

这是 Agent Skill 设计中最精妙的地方。

你可能会担心：*“如果我定义了 100 个 Skills，每次对话都把它们全部塞进 Context，Token 不就爆炸了吗？”*

答案是**不会**。Agent Skills 使用了一种**渐进式披露（Progressive Disclosure）**机制。

### 机制流程

1. **扫描与索引**：在会话开始时，Claude 仅读取所有可用 Skills 的 **YAML Frontmatter**（主要是 `name` 和 `description`）。这只占用极少的 Token。
2. **意图匹配**：当你发出指令（例如“帮我生成个 GIF”）时，Claude 根据 `description` 判断哪个 Skill 相关。
3. **按需加载**：一旦命中某个 Skill，Claude 才会读取该 Skill 的 `SKILL.md` 完整内容（指令、步骤、示例）。
4. **延迟加载支持文件**：如果 Skill 非常复杂，包含大量的文档或脚本，你可以将它们放在单独的文件中，并在 `SKILL.md` 中引用。Claude 只有在真正需要阅读细节时，才会去读取这些支持文件。

**价值**：
- **Token 效率极高**：你可以拥有成百上千个 Skills，但只会消耗命中技能的 Token。
- **专注度**：避免无关的指令干扰 AI 的注意力。

## 4. Agent Skill vs MCP：到底选哪个？

这是开发者最容易困惑的问题。两者看似都扩展了 AI 的能力，但侧重点完全不同。

| 维度 | Agent Skill | MCP (Model Context Protocol) |
| :--- | :--- | :--- |
| **核心定义** | **Knowledge (知识/流程)** | **Tool / Capability (工具/能力)** |
| **作用** | 教 AI **“如何做”** (How to do) | 给 AI **“用什么”** (What to use) |
| **实现方式** | Markdown 文件 (文本指令) | Server/Client 协议 (代码/API) |
| **依赖环境** | 依赖现有的计算环境 (如本地 Shell, Python) | 依赖外部服务的连接 (如 Postgres, Slack API) |
| **典型场景** | 代码规范、最佳实践、复杂任务的SOP | 读取数据库、访问文件系统、调用 SaaS API |

### 决策指南

- **选择 MCP，如果：**
  - 你需要让 AI 连接到一个外部系统（如数据库、Jira、GitHub、Slack）。
  - 你需要执行 AI 无法通过写代码直接完成的操作（如读取私有云日志）。
  - 你在构建通用的工具能力。

- **选择 Skill，如果：**
  - 你想规范 AI 的输出格式（如特定的 Commit 格式）。
  - 你想固化某种工作流（如“发布前的检查清单”）。
  - 你想让 AI 学会使用现有的工具（例如，你已经装了 `ffmpeg`，写一个 Skill 教 AI 如何组合参数来处理视频）。
  - 你需要复用一组复杂的 Prompt 提示词。

### 协同工作

最强大的模式是 **Skill + MCP** 结合使用：
- **MCP** 提供“查询数据库”的能力。
- **Skill** 提供“查询数据库时必须遵循的表结构规范和安全准则”。

## 总结

Agent Skill 是 AI 时代的“岗位培训手册”。它利用**渐进式披露**机制，以极低的成本赋予了 AI 专业的领域知识和流程规范。

与 MCP 提供的“硬连接”能力不同，Skill 专注于“软实力”——即如何正确、优雅地使用工具。对于希望构建高质量、标准化 AI 辅助工作流的开发者来说，掌握 Agent Skill 的编写是必修课。

---
*参考资料：*
- [Claude Code Docs: Agent Skills](https://code.claude.com/docs/en/skills)
- [Simon Willison: Claude Skills are awesome](https://simonwillison.net/2025/Oct/16/claude-skills/)
