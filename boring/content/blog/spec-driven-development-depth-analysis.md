---
title: "拒绝 'Vibe Coding' 的虚幻快感：深度解析 Spec-Driven Development (SDD) 与 AI 编程的未来"
date: 2026-02-01T10:00:00+08:00
draft: false
tags: ["SDD", "Spec-Driven Development", "AI Coding", "Spec Kit", "Martin Fowler", "ThoughtWorks"]
categories: ["Engineering"]
---

在 2025 年的 AI 编程浪潮中，一个新的热词悄然兴起——**Spec-Driven Development (SDD，规格驱动开发)**。

随着 AI 编码工具（如 Cursor, Windsurf, GitHub Copilot）的普及，开发者们陷入了一种被称为 **"Vibe Coding" (氛围编码)** 的状态：你描述一个模糊的目标，AI 给你一段看起来不错的代码，你凭感觉（Vibe）运行它。如果跑通了，皆大欢喜；如果跑不通，就再试一次。

然而，ThoughtWorks 的技术专家 Liu Shangqi 指出："Vibe Coding 虽然快，但往往导致不可维护、充满缺陷的一次性代码。"

为了解决这个问题，SDD 应运而生。它不是要回到繁琐的瀑布流，而是要让 AI 编程从“凭感觉”走向“有纪律”。本文将结合 **Martin Fowler** 的最新观察、**ThoughtWorks** 的深度思考，以及 **GitHub Spec Kit** 的实战案例，带你深入理解这一编程范式。

---

## 一、 什么是 SDD？(基于 Martin Fowler 与 ThoughtWorks 的视角)

SDD 的定义目前仍处于演变之中，但核心理念已逐渐清晰。

### 1. Martin Fowler 的定义与分级

软件开发教父 **Martin Fowler** 在其文章《Understanding Spec-Driven-Development》中，对 SDD 进行了非常精准的定义。为了保留原意，我们引用他的核心观点：

> **"Spec-driven development means writing a 'spec' before writing code with AI ('documentation first'). The spec becomes the source of truth for the human and the AI."**
>
> （SDD 意味着在使用 AI 写代码之前先写“规格说明书”（文档优先）。这份规格说明书成为了人类和 AI 共同的“单一事实来源”。）

Fowler 敏锐地指出，目前的 SDD 工具其实处于三个不同的**实现层级 (Implementation Levels)**：

*   **Level 1: Spec-first (规格优先)**
    *   *原文*："A well thought-out spec is written first, and then used in the AI-assisted development workflow for the task at hand."
    *   **解读**：先写好 Spec，再让 AI 写代码。任务完成后，Spec 可能就被丢在一边了。目前的 Spec Kit 和 Kiro 大多处于这个阶段。
*   **Level 2: Spec-anchored (规格锚定)**
    *   *原文*："The spec is kept even after the task is complete, to continue using it for evolution and maintenance of the respective feature."
    *   **解读**：Spec 不仅用于生成代码，还被保留下来。后续维护时，必须先更新 Spec，再更新代码，Spec 是代码的“锚”。
*   **Level 3: Spec-as-source (规格即源码)**
    *   *原文*："The spec is the main source file over time, and only the spec is edited by the human, the human never touches the code."
    *   **解读**：这是最激进的愿景。人类只写 Spec，代码完全是编译产物（Byproduct）。人类不再触碰代码文件。

### 2. ThoughtWorks 的视角：上下文工程

ThoughtWorks 的 **Liu Shangqi** 则从**上下文工程 (Context Engineering)** 的角度解读了 SDD。他认为：

> **"Prompt engineering optimizes human-LLM interaction, while context engineering optimizes agent-LLM interaction."**
>
> （提示词工程优化的是“人与大模型”的交互，而上下文工程优化的是“Agent 与大模型”的交互。）

在 SDD 中，Spec 本质上就是一种被精心设计的、压缩了的上下文（Context）。通过将需求分析与编码实现分离，SDD 实际上是在进行一种高级的“少样本提示 (Few-shot prompting)”，用结构化的 Spec 来约束 AI 的发散性。

---

## 二、 实战案例：GitHub Spec Kit 的工作流

Martin Fowler 提到的工具中，**Spec Kit** 是目前最容易上手且开源的 SDD 工具集。虽然 GitHub 官方文档较为冗长，但我们可以将其核心工作流提炼为四个关键步骤。

**Spec Kit 的核心哲学**：不要让 AI 猜你想做什么，而是用结构化的文档“驾驶”它。

### 实战演示：开发一个“个人照片整理器”

假设我们要开发一个本地照片整理应用。在 Spec Kit 的模式下，我们不会直接对 AI 说“帮我写个相册应用”，而是遵循以下流程：

#### 1. 确立宪法 (Constitution)
首先，Spec Kit 引入了 `Constitution`（宪法）的概念。这是一份项目级的最高准则，AI 在生成任何内容时都必须遵守。
*   *内容示例*：“所有数据库操作必须使用 SQLite”、“前端必须使用 Tailwind CSS”、“代码必须包含详细注释”。
*   *作用*：这就像是给 AI 戴上了“紧箍咒”，防止它在技术选型上放飞自我。

#### 2. 定义规格 (Specify)
这是 SDD 的起点。我们需要运行 `/speckit.specify` 命令。
*   **输入**：自然语言描述（如“我想要一个按日期分组的照片墙，支持拖拽排序”）。
*   **AI 输出**：生成一份详细的 `spec.md`。这份文档不会包含代码，而是包含：
    *   **用户旅程 (User Journey)**：用户如何打开应用，如何点击。
    *   **功能边界**：明确什么要做，什么**不做**。
    *   **成功标准**：如何判断功能已完成。
*   *关键点*：在这个阶段，你只关注“做什么 (What)”，完全不关注“怎么做 (How)”。

#### 3. 技术计划 (Plan)
有了 Spec 后，运行 `/speckit.plan`。
*   **AI 输出**：生成 `plan.md`。
*   **内容**：
    *   **架构设计**：选择 Vite + React。
    *   **数据模型**：定义 `Photo` 和 `Album` 的数据库表结构。
    *   **文件结构**：预估需要创建哪些文件。
*   *关键点*：这是将业务需求翻译成技术语言的过程。你可以在这里审查 AI 的技术选型是否合理。

#### 4. 任务拆解与执行 (Tasks & Implement)
最后，运行 `/speckit.tasks` 和 `/speckit.implement`。
*   AI 会将 `plan.md` 拆解为一系列微小的、可执行的 Checklist（任务清单）。
*   **执行**：AI 逐个勾选任务，生成代码，并通过测试。

**总结 Spec Kit 的模式**：它将“写代码”这个巨大的黑盒，拆解成了 **意图 -> 规格 -> 计划 -> 任务 -> 代码** 的透明流水线。这正是“拒绝 Vibe Coding”的体现。

---

## 三、 深度对比：Kiro 与 Tessl

除了 Spec Kit，Martin Fowler 还深入体验了另外两款工具，它们的理念各有千秋。

### 1. Kiro：轻量级的 "Spec-first"
Martin Fowler 认为 Kiro 是最简单的工具。
> *原文*："Kiro is the simplest (or most lightweight) one... Workflow: Requirements → Design → Tasks."

Kiro 的流程非常直观：**需求 -> 设计 -> 任务**。它通过 VS Code 插件引导用户完成这三步。但 Fowler 也指出了它的局限性：对于复杂的、跨多个任务的长期维护，Kiro 似乎缺乏“Spec-anchored（规格锚定）”的机制。

### 2. Tessl：激进的 "Spec-as-source"
Tessl 是 Fowler 眼中最独特的工具，因为它试图实现 SDD 的终极形态——**Spec 即源码**。
> *原文*："Tessl is the only one... that explicitly aspires to a spec-anchored approach... The code even marked with a comment at the top saying `// GENERATED FROM SPEC - DO NOT EDIT`."

在 Tessl 的愿景中，开发者编辑的是 Spec 文件（可能是某种结构化的 Markdown 或 DSL），而 `.js` 或 `.py` 文件完全由 AI 自动生成，且不可手动编辑。这就像我们写 TypeScript 编译成 JavaScript 一样，未来我们将写 Spec 编译成 Code。

---

## 四、 挑战与反思

SDD 是否是灵丹妙药？Martin Fowler 和 ThoughtWorks 都给出了冷静的思考。

### 1. 是“瀑布流”的回归吗？
很多人看到 SDD 的“先文档后编码”流程，会质疑这是不是倒退回了瀑布开发模型。
ThoughtWorks 的 Liu Shangqi 反驳道：
> *原文*："It’s not creating huge feedback loops like waterfall — it’s providing a mechanism for shorter and effective ones than would otherwise be possible with pure vibe coding."
>
> （这并不是制造像瀑布流那样巨大的反馈环，而是提供了一种机制，相比纯粹的 Vibe Coding，它能带来更短、更有效的反馈。）

Vibe Coding 看似快，但由于缺乏设计，往往在后期陷入无尽的 Debug 泥潭。SDD 实际上是在“慢”中求“快”。

### 2. 规格漂移 (Spec Drift) 的风险
Liu Shangqi 也提到了一个核心痛点：
> *原文*："Spec drift and hallucination are inherently difficult to avoid. We still need highly deterministic CI/CD practices..."

如果代码被修改了，但 Spec 没有更新，Spec 就成了废纸。这是 SDD 面临的最大挑战。除非像 Tessl 那样强制“单向生成”，否则保持 Spec 与代码的同步需要极高的纪律性。

### 3. "One workflow to fit all sizes?" (一套流程通吃？)
Martin Fowler 提出了一个非常犀利的质疑：
> *原文*："When I asked Kiro to fix a small bug... it quickly became clear that the workflow was like using a sledgehammer to crack a nut."
>
> （当我让 Kiro 修一个小 Bug 时……这简直是杀鸡用牛刀。）

目前的 SDD 工具（无论是 Spec Kit 还是 Kiro）往往流程繁琐，对于修复一个小 Bug 来说，写一套完整的 Spec 显得过于笨重。未来的 SDD 工具必须能够适应不同粒度的任务。

---

## 结语

Spec-Driven Development 正在重新定义人与 AI 的协作模式。

*   对于**简单任务**，"Vibe Coding" 或许依然有效。
*   但对于**复杂系统**，我们需要 Spec Kit 这样的工具来确立“宪法”与“计划”。
*   而在**未来**，我们或许会像 Tessl 预言的那样，只维护 Spec，让代码成为 AI 时代的汇编语言。

在这个转型期，保持清醒，不盲目追求速度，回归对软件行为（Behavior）的深度定义，或许才是程序员在 AI 时代的核心竞争力。
