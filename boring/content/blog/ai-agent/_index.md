---
title: "AI Agent 工程"
description: "AI Agent 大系列 3 个子系列 13 篇长文——Agent Skills（skill 编写与系统化）、AI Agent（从定义到多模态）、AI-Native SDLC（Anthropic 治理框架），适合 AI 工程师、后端工程师、技术 Lead。"
paginate_by: 20
sort_by: "date"
---

# AI Agent 工程大系列

> **副标题**:从 Skill 编写到 Agent 系统构建——AI 工程化的完整方法论。
> **风格**:翻译 + 中文工程视角 + 结构化对照表 + 工程师笔记。
> **来源**:2026 年 8-9 月从剪藏目录（`Clippings/`）抓取的英文高质量长文，拆解为 3 个子系列。

---

## 系列总览

| 子系列 | 主题 | 文章数 | 状态 |
|---|---|---|---|
| [Agent Skills 系列教程](@/blog/ai-agent/agent-skills-series-01-agents-have-no-memory.md) | Skill 编写、灰盒模块、深模块、故障排查 skill、主线与落地 | 5 篇 | ✅ |
| [AI Agent 系列教程](@/blog/ai-agent/ai-agent-series-01-what-is-agent.md) | 从 Agent 定义 / Tools/MCP / Memory/RAG / Evaluation 到多模态未来 | 5 篇 | ✅ |
| [AI-Native SDLC 系列](@/blog/ai-agent/ai-native-sdlc-playbook-anthropic.md) | Anthropic SDLC 手册拆解 + Simon Willison 智能体工程模式 + 四报告交叉对比 | 3 篇 | ✅ |

---

## 📑 导航索引（按子系列分卷）

### Agent Skills 系列教程（5 篇）

- [第 1 篇 · Agent 是「没有记忆的新人」](@/blog/ai-agent/agent-skills-series-01-agents-have-no-memory.md) — 为什么 codebase 结构决定 AI 输出质量
- [第 2 篇 · 深模块与灰盒模块](@/blog/ai-agent/agent-skills-series-02-deep-modules.md) — 用深模块把接口做窄，用灰盒模块固定「人定接口、AI 管实现」的分工
- [第 3 篇 · Skill 最佳实践](@/blog/ai-agent/agent-skills-series-03-skill-best-practices.md) — 分层架构、命名约定、「skill 不必长」的克制
- [第 4 篇 · 写一个故障排查 skill](@/blog/ai-agent/agent-skills-series-04-incident-skill.md) — description 触发 + 六步循环 + 三条铁律
- [第 5 篇 · Sidecar 与主线落地](@/blog/ai-agent/agent-skills-series-05-sidecars-and-landing.md) — references/scripts/agents 三类 sidecar + skill 系统组合 + adoption 清单

### AI Agent 系列教程（5 篇）

- [第 1 篇 · 什么是 Agent](@/blog/ai-agent/ai-agent-series-01-what-is-agent.md) — Agent 定义 / 核心组件 / 与 Copilot 的区别
- [第 2 篇 · Tools 与 MCP](@/blog/ai-agent/ai-agent-series-02-tools-mcp.md) — Tool calling 机制 / MCP 协议 / Function Calling 最佳实践
- [第 3 篇 · Memory 与 RAG](@/blog/ai-agent/ai-agent-series-03-memory-rag.md) — 短期记忆 / 长期记忆 / RAG 架构 / 向量数据库选型
- [第 4 篇 · Evaluation](@/blog/ai-agent/ai-agent-series-04-evaluation-evolution.md) — Agent 评估体系 / 评测维度 / 评测方法论
- [第 5 篇 · 多模态与未来](@/blog/ai-agent/ai-agent-series-05-future-multimodal.md) — 多模态 Agent / 具身智能 / Agent 生态展望

### AI-Native SDLC 系列（3 篇）

- [《从 intent.md 到闭环：Anthropic AI 原生 SDLC 手册解读》](@/blog/ai-agent/ai-native-sdlc-playbook-anthropic.md) — 六个阶段、一条制品链、几道审批门
- [《智能体工程模式：Simon Willison 的 AI 编码实践》](@/blog/ai-agent/agentic-engineering-patterns-simon-willison.md) — 个体工程师视角的 AI 编码清单
- [《AI Native SDLC 如何重构软件开发》](@/blog/ai-agent/ai-native-sdlc-four-reports-synthesis.md) — 四报告交叉比较与综合判断

---

## 🎯 适合谁读

- **AI 工程师 / 后端工程师**:理解如何用 Skill 系统化 Agent 行为、如何构建可靠的 Agent 应用
- **技术 Lead / 架构师**:理解 AI-Native 软件开发的治理框架、评估体系与团队落地路径
- **平台工程师 / DevOps**:理解 Claude Code 在企业落地的制品链、门、hook、eval、闭环机制

---

## 📊 系列画像

- **总字数**:~280K 中文字符
- **总文件数**:13 篇 markdown
- **来源素材**:`Matt Pocock` (aihero.dev/skills) / `Simon Willison` / `Anthropic` / `Louis Claxton`
- **风格定位**:工程师视角的「翻译 + 中文工程语境补充」

---

## 📚 关联系列

- [Inference Engineering 系列](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md) — LLM 推理工程化的第一性原理长文
- [Tutorial 合集](/blog/tutorial/) — 跨主题工程实践教程
