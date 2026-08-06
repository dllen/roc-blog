---
title: LoopX：给 AI Agent 装上「目标记忆」的控制平面
date: 2025-08-06
description: LoopX 是一个轻量级本地控制平面，为长时间运行的 AI Agent 工作流提供目标级状态管理。
tags:
  - AI Agent
  - 工作流
  - 开源工具
  - Python
---

> 当一个需求要横跨三天、三个会话、三个 Agent 才能完成时，Chat 记忆不够用了。
>
> **GitHub**: [huangruiteng/loopx](https://github.com/huangruiteng/loopx) | **版本**: v0.4.1 | **技术栈**: Python 3.11+

## 问题的本质

Codex、Claude Code、Cursor——这些 Agent 运行时（Agent Runtime）都很强，但它们有一个共同的局限：**会话之间是割裂的**。

当你对 Agent 说"继续"，它需要重新理解上下文。当你让一个 Agent 修复 issue，另一个 Agent 负责 code review，再来一个 Agent 负责合并发布——**每个 Agent 都需要知道当前状态、谁做了什么、谁该接下一棒**。

传统解法是"在 Chat 里写提示词"：把背景信息塞进 System Prompt，让模型记住。但这不是持久化，是猜测。模型可能遗忘，可能误解，而且没有人能说清楚"现在到底卡在哪里"。

**LoopX 的核心思路**：不替代 Agent Runtime，而是给 Agent 装上一层**目标级状态管理层**——每个 Goal 有唯一身份、有结构化的 Todo、有 Gate（人工审批点）、有 Evidence（证据链）、有 Quota（算力配额），Agent 之间通过这层状态交接工作，而不是靠口耳相传。

## 核心概念

LoopX 的核心理念用一句话概括就是：**保持目标、门控、待办、证据、限额和交接稳定，让 Agent 能在多个会话中完成 bounded turn。**

**Bounded turn** 是关键概念——每个 Agent 动作是有限边界的一次执行，不是无限制的自主权。每一个 turn 都要经过：

```
当前目标状态检查 → 配额判断（是否该执行）→ 执行 → 写回证据 → 更新下一步
```

## 架构设计

LoopX 采用四层职责分离：

```
Agent → Capability → Provider → 外部系统
外部读回 → Provider → Capability → LoopX Kernel → 下一步 Todo / Gate / Monitor
```

| 角色 | 负责什么 | 不应该做什么 |
|---|---|---|
| **Agent** | 规划、分析、工具调用、一次 bounded 执行 | 拥有持久化目标生命周期或无边界效力授权 |
| **Capability** | 调用者结果契约、域策略、输出规范化、验证、类型化转换 | 直接写 todo、gate、quota |
| **Provider** | 外部系统调用，返回观察和读回 | 包含域转换策略或 LoopX 状态 |
| **Kernel** | Goal、Todo、Claim、Gate、Monitor、Quota、写回、恢复、调度 | 包含域推理或 Provider 实现细节 |

状态管理分为六个持久化层：Registry（目标列表）、Goal State（活跃状态）、Run Log（报告）、Run History（紧凑索引）、Status/Attention Queue（首屏摘要）、Compute Quota（算力配额）。

## 目标生命周期

创建 `goal` 并赋予稳定身份，跨越多个会话持续跟踪。每个目标包含：

- **Objective**：目标是什么
- **Scope**：边界在哪里
- **Authority**：谁可以决策
- **Gates**：哪些点需要人工审批
- **Evidence**：决策和执行证据链
- **Run History**：紧凑运行索引

支持多项目并行，每个项目有独立的 registry 和状态文件。

## 结构化门控

```bash
# 创建目标
loopx start-goal --guided --project . --goal-text "完成 XX 系统重构"

# 查看当前状态
loopx status

# 诊断问题
loopx diagnose --goal-id <id>
```

- **User Gates**：需要人工判断的门控，用具体问题替代模糊的"等待审核"
- **Agent Todos**：结构化待办项，带 `claimed_by`、`todo_id`、状态机
- **Claims & Leases**：软性所有权 + 可选硬性租约，防止并发冲突

## 配额定额

```bash
# 检查是否应该执行
loopx quota should-run --goal-id <id>

# 成功后追加 spend
loopx quota spend-slot --goal-id <id> --run-id <id>
```

关键规则：**静默跳过、preflight 失败、dry-run preview 不消耗配额**。

## 内置能力域

LoopX 提供了一套可复用的能力，覆盖常见 AI 工作流场景：

| 能力 | 功能 | 状态 |
|---|---|---|
| **issue-fix** | GitHub Issue → 本地分支 → PR review readiness | active |
| **content-ops** | 内容运营：公开信源 + 私有 owner gate 聚合 | active |
| **value-connectors** | 外部渠道摄入（收入、成本、需求信号） | active |
| **change-quality** | 精确范围的变更质量审查 + bounded repair | active |
| **pr-review-queue** | 自动观察 GitHub PR 队列，推进一个精确 head | active |
| **explore** | 探索图：hypothesis → finding → evidence 拓扑 | active |
| **auto-research** | 去中心化研究预设，协调 proposer/executor/evaluator | experimental |
| **integration-branch** | 本地集成分支对齐，不改源分支 | active |

```bash
loopx configure-goal --goal-id <id>   # 查看能力列表
loopx issue-fix workflow-plan --url <github-issue-url> --format json
```

多数能力默认关闭（`default_enabled: False`），需要显式启用。

## 多 Agent 协作

```bash
loopx todo claim --goal-id <id> --todo-id <tid> --agent-id <aid>  # 认领待办
loopx todo update --goal-id <id> --todo-id <tid> --result <result>  # 完成后更新
loopx history --goal-id <id>  # 查看历史
```

同一 todo 上不并发写入，交接时写回证据，不靠口耳相传。

### Agent Runtime 桥接

| Host | 启动方式 | Loop 驱动 |
|---|---|---|
| Codex App | `loopx agent-onboard --agent-type codex-app` | App 心跳自动化 |
| Codex CLI | `codex` 在项目中，使用 `/goal` | 可见 `/goal <task_body>` |
| Claude Code | 安装 adapter，使用 `/loopx <task>` | 原生 `/loop`，由 LoopX 门控 |
| Cursor / Shell | `loopx doctor` 手动连接 | 自定义调度器 |

## 开发者工具

```bash
loopx doctor           # 环境诊断
loopx serve-status     # 全局状态面板
loopx check --scan-path .   # 安全扫描
loopx canary premerge --from-git-diff --goal-id <id>  # 发布前检查
```

## 适用场景

| 场景 | 适合度 |
|---|---|
| 多日工程/研究/benchmark 目标 | ✅ 非常适合 |
| 跨多轮会话的 PR/issue 处理 | ✅ 非常适合 |
| 需要 human-in-the-loop 的安全门控 | ✅ 非常适合 |
| Peer agent 团队协作（所有权 + 交接可见性） | ✅ 非常适合 |
| 单次会话完成的任务 | ❌ 过度复杂 |
| 实时聊天/对话场景 | ❌ 不适合 |

## 快速开始

```bash
# 安装
curl -fsSL https://raw.githubusercontent.com/huangruiteng/loopx/main/scripts/install-from-github.sh | bash
export PATH="$HOME/.local/bin:$PATH"

# 连接项目
cd /path/to/your-project
loopx connect

# 创建第一个目标
loopx start-goal --guided --project . --goal-text "你的长期目标描述"
```

安装后确保以下目录在 `.gitignore` 中：

```
.loopx/
.codex/goals/
.local/
```

## 最佳实践

### 状态隔离

- `.loopx/`、`.codex/goals/`、`.local/` 必须加入 `.gitignore`
- 发布前运行 `loopx check --scan-path .`

### Gate 设计

每个 user gate 必须是**具体问题**，不是模糊表述：

- ❌ "等待审核"
- ✅ "请确认是否接受这个 diff 的改动范围？Y/N"

### Todo 命名

表达**下一步可验证的转变**，而非抽象概念：

- ❌ "继续工作"
- ✅ "在 staging 环境验证 auth flow"

### 配额使用

```bash
loopx quota should-run --goal-id <id>   # 自动 turn 必须先检查
loopx quota spend-slot --goal-id <id> --run-id <id>  # 成功后才追加 spend
```

静默跳过/preflight 失败/dry-run 不消耗配额。

## 相关资源

- **GitHub**: [huangruiteng/loopx](https://github.com/huangruiteng/loopx)
- **文档**: [huangruiteng.github.io/loopx](https://huangruiteng.github.io/loopx/)
- **用户手册**: [飞书](https://my.feishu.cn/wiki/CaL5wMk9ui17ngkWzeUcMlAYnZg)

## 总结

LoopX 的本质是**目标级状态持久化和调度协调层**——它不运行代码，但让 Agent 的每一步工作都变得：

- **可审查**：每个决策有 Gate，每个 Gate 有具体问题
- **可回滚**：Evidence 链记录每次转变，失败可追踪
- **可交接**：Todo + Claim 机制，多 Agent 协作不再靠猜

适合需要跨越多会话、多角色、多 Agent 的复杂工程和研究工作流。对于简单单次任务，它的复杂度反而是负担。

> **设计哲学**：Keep the loop moving. Keep the judgment human.

