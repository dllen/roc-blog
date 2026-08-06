---
title: "Pi Agent 是什么？——极简内核、四层洋葱与一个能跑的 Agent Loop"
date: "2026-08-06"
update_date: "2026-08-06"
description: "Pi 不是又一个 LLM 包装器——它是一个 Agent 运行时。本文拆解 pi 的四层洋葱架构、无状态的 Agent Loop 引擎，并写一个最小可跑的'思考-行动'循环。"
tldr: "Pi 的核心洞察：Agent 运行时不是关于'怎么调 LLM'，而是关于'调完 LLM 之后发生什么'。循环引擎应该知道得越少越好，所有产品能力都应该外置。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Pi", "Agent Runtime", "TypeScript", "系列教程"]
series: "Pi Agent 系列教程"
series_order: 1
---

> 本文是 **Pi Agent 系列教程**第 1 篇。基于张汉东《[pi 的设计艺术](https://zhanghandong.github.io/pi-book/)》（CC BY-NC-SA 4.0）改编，用费曼学习法（概念 → 类比 → 动手）带你从零理解 Pi 的架构设计。

如果你用过 Claude Code 或 Cursor，你可能想过一个问题：**"从敲下回车到 Agent 开始干活，这中间到底发生了什么？"**

大多数人会说"调了 LLM API"。但真正有意思的部分不是"调 API"——而是**调完 API 之后**。应该继续干还是停下？用户打断了怎么办？上下文快满了怎么办？工具调超时了怎么办？

这些问题没有一个能用一次 API 调用解决。它们需要的是一台发动机——持续运转的决策引擎。Pi 把这件事做到极致，把发动机拆到只剩最关键的一个零件：**Agent Loop**。

---

## Part 1：概念——Pi 到底是什么？

### 它不是什么

先澄清一个常见的误解。Pi 不是"又一个 LLM 包装器"。LangChain、Vercel AI SDK 解决的核心问题是"怎么调 LLM"——怎么封装 API、怎么处理流式、怎么切换厂商。它们做的是一件很重要的事，但不是 Pi 做的事。

Pi 解决的核心问题是：**"调完 LLM 之后发生什么？"**

| 问题 | 包装器能解决吗？ | Pi 怎么解决？ |
|------|:--:|------|
| 调 20 家 LLM 厂商用统一接口 | ✅ | `pi-ai` 层的 Provider Registry |
| Agent 应该继续干还是停下？ | ❌ | Agent Loop 的 `while(true)` |
| 用户按了 Ctrl+C 怎么办？ | ❌ | AbortSignal 贯穿全部异步操作 |
| 上下文窗口快满了怎么办？ | ❌ | `transformContext` 回调 |
| 多个工具调用怎么编排？ | ❌ | 工具执行管线（prepare → execute → finalize） |
| 会话怎么分支回退？ | ❌ | 会话树（parentId 模型） + Compaction |

Pi 是**运行时（Runtime）**，不是框架（Framework）。框架倒置控制权——你填骨架槽位。运行时提供执行环境——你保留控制流。

### 四层洋葱架构

Pi 的架构是一颗严格执行向内依赖规则的洋葱：每一层只知道下一层的存在。

```
┌──────────────────────────────────────┐
│  第 4 层：产品外壳                      │
│  pi-tui / mom(Slack) / web-ui / RPC   │
├──────────────────────────────────────┤
│  第 3 层：产品内核 (pi-coding-agent)    │
│  会话树、Compaction、System Prompt 组装  │
│  130+ 工具实现、Extension/Skill 系统    │
├──────────────────────────────────────┤
│  第 2 层：循环引擎 (pi-agent-core)      │
│  agentLoop()、Agent 类、事件系统         │
│  仅 5 个源文件、约 1,900 行              │
├──────────────────────────────────────┤
│  第 1 层：统一调用面 (pi-ai)             │
│  20+ Provider 适配、事件流归一化          │
└──────────────────────────────────────┘
```

**第 1 层 `pi-ai`：** 把 Anthropic、OpenAI、Google、AWS Bedrock 等 20+ 家 LLM 厂商的 API 差异全部吸收。上层永远看到统一的 `AssistantMessage` 和统一的事件流（`text-delta`、`tool-call-delta`、`usage`），永远不需要知道底层是哪家厂商。

**第 2 层 `pi-agent-core`：** 这颗"心脏"只有 5 个文件、不到 2000 行代码。它只做一件事——跑循环。循环引擎是**无状态**的——消息列表、工具定义、配置全是调用者传入的，引擎自己什么都不持有。这使得同一份引擎可以被 CLI、Slack Bot、Web UI、测试 Harness 不加修改地复用。

**第 3 层 `pi-coding-agent`：** 把一个通用 Agent 引擎变成一个具体的编程助手。包含会话树（支持分支）、Compaction（上下文压缩）、System Prompt 组装、Extension/Skill 系统、以及 130+ 个工具实现。这一层是代码量最大的——约 42,000 行，占项目近一半。

**第 4 层：** 面向用户的产品形态——终端 TUI（35+ 组件）、Slack Bot（mom）、Web UI、RPC 模式。所有产品共用前三层。

### Agent Loop：发动机的核心

Agent Loop 的代码本质上就是一个 while 循环：

```
while (任务没完成) {
    1. 把"系统提示 + 工具列表 + 完整对话历史"发给 LLM
    2. 看 LLM 返回什么
       - 如果是不调工具的文本 → 任务完成，退出
       - 如果是工具调用 → 执行工具 → 把结果追加到对话历史 → 回到第 1 步
}
```

但 pi 的设计加了一个关键的复杂度：**双层嵌套循环**。

- **内层循环**：驱动持续工作——调 LLM → 执行工具 → 检查引导消息 → 再调 LLM
- **外层循环**：处理"唤醒"——当内层循环结束（Agent 本应停止时），检查有没有后续消息。如果有，重新启动内层循环

"引导"和"后续"语义不同：**引导**是"用户在工作途中插话"（如"换个思路做"），在当前工具执行完后立即注入，下一次 LLM 调用时生效。**后续**是"用户等 Agent 做完之后再追加新任务"（如"好了，现在写测试"），只在 Agent 即将退出时才消费。

### 为什么要分这么多层？

一位经验丰富的工程师几乎肯定会问这个问题。Pi 的回答是：

> "当且仅当两段代码有不同的使用者时，它们才应该在不同的包中。"

这条纪律贯穿了包数量从 3→7→4→7 的整个演化曲线：

- `pi-ai` 独立存在——有人只想用统一 LLM 调用而不需要 Agent 循环
- `pi-agent-core` 独立存在——有人想用循环引擎构建非编码类 Agent
- `pi-tui` 独立存在——它是一个与 AI 无关的通用终端 UI 框架
- `pi-storage-sqlite-node` 独立存在——想用 SQLite 存会话的人不该被迫拉进整个系统

包边界不是组织工具，而是**强制的分层纪律**——如果底层尝试导入上层代码，TypeScript 编译器会直接报错。这比任何团队约定都可靠得多。

---

## Part 2：类比——Pi 就像一台"乐高发动机"

### 发动机不应该管你的车是什么颜色

想象你从一架废弃的飞机上拆下来一台涡轮发动机。

这台发动机有一个特点：它不在乎你是把它装在赛车、卡车、摩托车还是发电机上。它的接口极其简单——给它燃料，它给你推力。怎么冷却、怎么挂载、怎么控制方向——全是你的问题。

Pi 的 Agent Loop 就是这台发动机。它：

- 不关心消息从哪里来（CLI 输入？Slack 消息？API 请求？——全是上层问题）
- 不关心上下文怎么存（内存？文件？SQLite？——调用者决定）
- 不关心工具有多少、能干什么（工具定义由上层传入）
- 不关心谁在看输出（输出全走事件流，订阅者自行处理）

这就是"极简内核，能力外置"哲学：**发动机只管转。**

### 四层洋葱就是"发动机在引擎舱里"

把这个类比展开：

| 汽车 | Pi |
|------|-----|
| 发动机（不管车长什么样） | `pi-agent-core`（无状态循环引擎） |
| 引擎舱（散热、油路、电路） | `pi-coding-agent`（会话管理、Compaction、工具集） |
| 车身（轿车、SUV、卡车） | 产品外壳（CLI、Slack、Web） |
| 燃油系统（兼容不同标号、不同油站） | `pi-ai`（20+ LLM 厂商统一接口） |

如果你只需要一个发动机，拿 `pi-agent-core`。如果你需要一辆完整的轿车，`pi-coding-agent` 已经把发动机装进了引擎舱。如果你需要一辆卡车——自己用发动机搭，Pi 不强迫你开轿车。

---

## Part 3：动手——从零写一个"最小 Agent Loop"

### 我们要做什么

不依赖 Pi，用约 60 行 TypeScript 写一个最小 Agent Loop。它只有一个工具（查看日期），但你跑完之后会完全理解 Pi 的循环引擎在做什么。

### 完整代码

```typescript
// mini-agent-loop.ts
// 极简 Agent Loop —— 一个约 60 行的发动机，演示 Pi 的核心设计

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

// ── 1. 类型定义 ──
type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface AssistantMessage {
  role: "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

interface ToolResult {
  role: "user";             // Anthropic tool_result 要求 role: "user"
  content: string;
}

// ── 2. 工具系统 ──
const TOOLS = [{
  name: "get_date",
  description: "获取今天的日期和星期。当你需要知道今天是什么日子时使用。",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
}];

function executeTool(name: string, _args: Record<string, unknown>): string {
  if (name === "get_date") {
    const now = new Date();
    return `今天是 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日，星期${["日","一","二","三","四","五","六"][now.getDay()]}`;
  }
  return `找不到工具: ${name}`;
}

// ── 3. Agent Loop（对应 pi 的 agentLoop 函数） ──
async function agentLoop(
  messages: Message[],
  signal: AbortSignal,
): Promise<string> {
  let finalAnswer = "";

  // 双层循环：外层处理"唤醒"，内层驱动工作
  let shouldContinue = true;
  while (shouldContinue && !signal.aborted) {
    shouldContinue = false;  // 默认一轮，有工具调用就继续

    // 调 LLM
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        tools: TOOLS,
        messages,
      }),
      signal,
    });
    const data = await resp.json();

    // Claude 的响应格式：有 text 内容和可选的 tool_use
    const textBlocks = data.content.filter((b: any) => b.type === "text");
    const toolBlocks = data.content.filter((b: any) => b.type === "tool_use");

    finalAnswer = textBlocks.map((b: any) => b.text).join("");

    // 没有工具调用 → 任务完成
    if (toolBlocks.length === 0) break;

    // 有工具调用 → 执行 → 结果追加 → 继续循环
    messages.push({
      role: "assistant",
      content: JSON.stringify(data.content),
    });

    const toolResults: ToolResult[] = [];
    for (const tc of toolBlocks) {
      const result = executeTool(tc.name, tc.input);
      toolResults.push({
        role: "user",
        content: JSON.stringify({
          type: "tool_result",
          tool_use_id: tc.id,
          content: result,
        }),
      });
      console.log(`  🔧 ${tc.name}() → ${result.slice(0, 40)}...`);
    }
    messages.push(...toolResults);
    shouldContinue = true;
  }

  return signal.aborted ? "已中止" : finalAnswer;
}

// ── 4. 跑起来 ──
async function main() {
  const controller = new AbortController();
  // 模拟用户 5 秒后按 Ctrl+C
  setTimeout(() => controller.abort(), 50_000);

  const answer = await agentLoop(
    [{ role: "user", content: "告诉我今天是几月几号星期几" }],
    controller.signal,
  );
  console.log(`\n📝 ${answer}`);
}

main();
```

### 运行效果

```bash
$ npx tsx mini-agent-loop.ts

  🔧 get_date() → 今天是 2026 年 8 月 6 日，星期四...

📝 今天是 2026 年 8 月 6 日，星期四。
```

### 这 60 行对应 Pi 的哪些设计？

| Demo 中的代码 | Pi 中的对应 | 关键设计决策 |
|:--|:--|:--|
| `agentLoop()` 函数 | `pi-agent-core` 的 `runLoop()` | 函数无内部状态，所有数据通过参数传入 |
| `executeTool()` | 工具执行管线 | 这是"发动机不知道工具有多少个"的具体体现 |
| `AbortSignal` | pi 的 AbortSignal 贯穿 | 用户中断不靠 flag 检查——靠原生 cancel |
| `TOOLS` 数组 | Extension 系统注册的 ToolDefinition | 工具是数据，不是代码装饰器 |
| `fetch()` 调 Anthropic | `pi-ai` 层的 Provider 接口 | 底层接口被完全隔离，换厂商不影响循环 |

### 从 60 行到生产级

| 维度 | 我们的 Demo | Pi 的生产级 Loop |
|------|----------|----------------|
| **提供商** | 只支持 Anthropic | 20+ 厂商，通过 Provider Registry 统一 |
| **循环** | 单层 while | 双层嵌套（引导 vs 后续消息语义不同） |
| **事件** | console.log | 完整的生命周期事件流（agent_start → turn_start → … → agent_end） |
| **中止** | 单个 AbortSignal | 贯穿所有异步操作的信号管道 |
| **上下文管理** | 无 | `transformContext` 回调（Compaction、分支摘要） |
| **错误处理** | 无 | stopReason 字段（不抛异常，优雅降级） |

---

## 总结

今天我们讲了三件事：

1. **Pi 不是 LLM 包装器，是 Agent 运行时**——它关心的是"调完 LLM 之后发生什么"，不是"怎么调 LLM"。

2. **四层洋葱架构的核心是纪律**——每一层只知道自己下面那层。Agent Loop 只有不到 2000 行，而且是完全无状态的——这正是它能在 CLI/Slack/Web/测试四种形态下不加修改地复用的原因。

3. **你写了一个 60 行的 Agent Loop**——它有工具调用、有 AbortSignal、有 loop 退出条件。这和 Pi 的内核引擎是同一个设计模式——只是 Pi 把这些原则执行到了生产级。

---

## 下一期预告

> **Pi 的工具设计：约束即保护**
>
> Pi 为什么不做"万能 bash"而要提供 6+1 个专用工具？为什么 Edit 工具要求 oldText 精确匹配？为什么搜索工具有截断策略？学完你会发现：给 LLM 设计工具和给人设计 UI 是一回事。

---

*本文基于张汉东《[pi 的设计艺术](https://zhanghandong.github.io/pi-book/)》（CC BY-NC-SA 4.0）第 1-3、8-10 章内容改编，用费曼学习法重构为"概念 → 类比 → 动手"三段式教程。*
