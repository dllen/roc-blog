---
title: "Pi 的能力外置：为什么\"不内建\"比\"内建\"更强大"
date: "2026-08-06"
update_date: "2026-08-06"
description: "Pi 不做内建子 Agent、不做内建 MCP、不做内建权限弹窗、不做内建 Plan Mode。这不是偷懒——这是极简内核哲学。本文拆解 Extension 系统和三个回调如何组合出无限产品形态。"
tldr: "Pi 的核心只有三个回调：execute（控制做什么）、beforeToolCall（控制能做什么）、transformContext（控制看到什么）。其余一切都是这三个回调的组合。这不是功能缺失——这是一种更强的设计。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Pi", "Extension", "Skill", "Architecture", "TypeScript", "系列教程"]
series: "Pi Agent 系列教程"
series_order: 3
---

> 本文是 **Pi Agent 系列教程**第 3 篇。基于张汉东《[pi 的设计艺术](https://zhanghandong.github.io/pi-book/)》第 15-18 章改编。上一篇拆解了 Pi 的工具设计哲学——约束即保护。今天看向 Pi 最反直觉的设计：**几乎所有行业认为"Agent 框架该有"的功能，Pi 都没有内建。** 但它用三个回调组合出了所有功能。

---

## Part 1：概念——Pi 的四件"不做的事"

### 这不是偷懒

先来直面 Pi 最受争议的四个设计决定：

| 行业惯例 | Pi 的做法 | 组合机制 |
|---------|---------|---------|
| 内建子 Agent 调度 | 子 Agent 是普通工具调用 | `execute` 回调 |
| 内建 MCP 协议 | Extension + Skill 两套体系 | `registerTool` + system prompt |
| 内建权限弹窗 | `beforeToolCall` 钩子 | `beforeToolCall` 回调 |
| 内建 Plan Mode | `transformContext` 回调 | `transformContext` + `beforeToolCall` |

Pi 的设计者用一个原则统一了这些决定：

> **"如果一个功能可以用更底层的机制组合出来，就不应该把它内建到内核中。"**

这不是偷懒——这是对复杂度的管理。每个内建功能都是一份维护负担、一份 API 合约、一份向后兼容承诺。如果用三个回调能组合出所有需求，你得到的是一个**指数级更可组合**的系统。

### 三个回调构成完整的控制面

这三个回调覆盖了 Agent 必须被控制的三个维度：

```
execute        → 控制"做什么"（工具的实现逻辑）
beforeToolCall → 控制"能做什么"（权限边界）
transformContext → 控制"看到什么"（上下文变换）
```

每个具体功能都是这三个回调的组合：

| 你想实现的功能 | 用什么回调 | 怎么组合 |
|-------------|---------|---------|
| **子 Agent** | `execute` | 在工具执行函数内跑一个新的 Agent Loop |
| **权限弹窗** | `beforeToolCall` | 检查工具名和参数，block 或放行 |
| **Plan Mode** | `transformContext` + `beforeToolCall` | planning 阶段注入"只做计划"指令 + 阻止所有工具执行；execute 阶段注入"按计划执行"指令 |
| **上下文压缩** | `transformContext` | 在消息传给 LLM 前旧消息替换为摘要 |
| **工具黑名单** | `beforeToolCall` | 匹配危险工具名 → block |
| **动态权限** | `beforeToolCall` | 根据时间/角色/上下文决定是否放行 |

### 相比内建的代价

这种设计不是没有代价。Pi 自己总结了四点：

1. **入门摩擦大**——用户面对四层洋葱，每一层有自己的类型和回调。追踪一条消息从用户输入到模型响应需要穿越全部四层。
2. **重复实现**——CLI、Slack、Web 三个产品外壳各自实现了相似的会话加载、System Prompt 构建、工具权限检查。
3. **文档负担**——内建功能写一次文档就好；外置功能需要每个产品各自记录组合方式。
4. **调试难**——Bug 可能出在内核、产品层、或两者的交互中。层数越多，诊断路径越长。

但这些是"为多产品适应性付出的税"。对于单产品团队，框架式设计也许更合适。对于 Pi 这样需要**同一份内核驱动终端、Slack、浏览器、GPU 集群**的路由器，这笔税是合理的。

### Extension 系统：让用户写代码扩展 Agent

Pi 的 Extension 系统是"能力外置"的核心实现机制。一个 Extension 能做五件事：

1. **注册工具**——新工具和内建工具同等的待遇（agent loop 的工具分发中一视同仁）
2. **订阅事件**——二十多种生命周期事件，分"观察型"（被动获知）和"干预型"（通过返回值影响系统行为）
3. **注册命令和快捷键**——新增斜杠命令（如 `/deploy`）、键盘快捷键、CLI flag
4. **注入消息**——三种方式（自定义消息、模拟用户输入、追加 Entry）在不同时机注入上下文
5. **注册 Provider**——v0.81.0 起，extension 可以注册完整的 LLM Provider，自带认证和模型列表

一个 Extension 就是导出一个 `setup` 函数的 TypeScript 文件。pi 用 `jiti` 在运行时编译加载——不需要预编译步骤，改完代码重启 pi 就生效。

### 两阶段初始化：防止 Extension 在系统中"裸奔"

这是 Pi Extension 系统最精妙的设计。Extension 的 `setup()` 执行时，系统还没有完全就绪。此时 Runtime 的 action 方法全是 **throwing stubs**——如果你在 `setup()` 里调用 `sendMessage()` 或 `setModel()`，会立即得到一个明确的报错。

第二阶段，Runner 调用 `bindCore()` 把真实的 action 实现注入替换 stubs。只有在 `session_start` 事件触发后，这些方法才可用。

用 throwing stubs 而不是 silent no-op 是刻意的——让开发者在错误使用时立即得到明确报错，而不是困惑于"为什么我的 sendMessage 没反应"。

### Skill 机制：用文档替代代码

和 Extension 互补的是 Skill——纯 Markdown 文档，注入 System Prompt，教 LLM 怎么完成特定任务。

对比很鲜明：

| 需求 | 用 Skill | 用 Extension | 用 MCP |
|------|---------|------------|--------|
| 教 LLM 一个工作流 | ✅ 最适合 | 过度设计 | 过度设计 |
| 注入领域知识 | ✅ 最适合 | 过度设计 | 过度设计 |
| 调外部 API | ❌ | ✅ | ✅ |
| 操纵 Agent 内部状态 | ❌ | ✅ 唯一选项 | ❌ |
| 修改 UI 行为 | ❌ | ✅ 唯一选项 | ❌ |
| 跨框架复用 | ❌ | ❌ | ✅ |

Pi 不排斥 MCP 的标准化价值，但认为用一个独立进程（启动/维护/监控 + JSON-RPC 通信层 + 进程间错误处理）来告诉 LLM"你该用 TDD 流程"是用大炮打蚊子。当前 pi 的生态定位是专注于自己的产品和工具集，跨框架互操作不是优先考虑。

---

## Part 2：类比——三个旋钮 vs 一百个功能按钮

### 音乐工作室

想象你走进一个**音乐工作室**。桌上有两个设备：

- **设备 A（框架式 Mixer）**：有 100 个预置效果按钮——"摇滚氛围""深夜爵士""古典温暖"……每个按钮调好了一套 EQ + 压缩 + 混响参数。按一下就行。
- **设备 B（协议式 Mixer）**：只有三个旋钮——低频、中频、高频。你可以拧出任意组合。

设备 A 的 100 个按钮看起来很强大，但如果你想做一个"不是摇滚不是爵士不是古典"的声音——比如"公路旅行中在加油站听到的老式收音机放的后摇"——你会发现没有一个按钮能做这件事。

设备 B 的三个旋钮看起来很简陋，但你知道它们能组合出无穷无尽的可能。

Pi 就是那台"三个旋钮"的设备：

| 设备 B 的旋钮 | Pi 的回调 |
|------------|---------|
| **低频**（基础音色的厚度） | `execute`（决定 Agent 的工具做什么） |
| **中频**（人声和乐器的清晰度） | `beforeToolCall`（决定 Agent 能做什么） |
| **高频**（空气感和空间感） | `transformContext`（决定 Agent 看到什么） |

### 从三个旋钮到四种策略

同一个 `beforeToolCall` 旋钮，拧出四种完全不同的问题：

**策略 1：交互式确认。** CLI 用户想每次危险操作都看到弹窗确认。`beforeToolCall` 里调 `confirm("真的要删除整个 node_modules？")` 返回 block 或 allow。

**策略 2：命令白名单。** CI/CD 场景不能有人交互。`beforeToolCall` 里只允许命令匹配一个预定义前缀列表，其余全 block。

**策略 3：完全自动。** Docker 沙箱环境（如 Pi 的 Slack bot——mom），所有操作都发生在隔离容器里，搞不坏宿主系统。`beforeToolCall` 永远返回 `undefined`（不 block）。

**策略 4：基于角色审批。** 内部工具的 admin 用户全放行，restricted 用户的危险工具 block。

内置弹窗假设用户会用鼠标点"允许"或"拒绝"。`beforeToolCall` 不做这种假设——它把决定权还给产品层。

---

## Part 3：动手——写一个"Extension 式"工具系统

### 我们要做什么

不依赖 Pi，用约 70 行 TypeScript 展示 Extension 系统的核心模式：**事件订阅 + 工具注册 + 钩子干预**。实现一个"动态权限"系统——从 `beforeToolCall` 一个钩子长出不同的安全策略。

### 完整代码

```typescript
// extension-pattern-demo.ts
// 演示 Pi 的 Extension 模式：事件 + 钩子 + 工具注册

// ── 1. 类型定义 ──
type EventMap = {
  session_start: [];
  tool_call: [{ name: string; args: Record<string, unknown> }];
  agent_end: [{ finalAnswer: string }];
};

type EventName = keyof EventMap;

interface ToolDef {
  name: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface Extension {
  name: string;
  setup(ctx: ExtensionContext): void;
}

interface ExtensionContext {
  on<E extends EventName>(event: E, handler: (...args: EventMap[E]) => void): void;
  registerTool(tool: ToolDef): void;
}

// ── 2. 三种"安全策略"Extension ──

// 策略 A：交互式确认（CLI 用户）
const interactiveConfirmExt: Extension = {
  name: "interactive-confirm",
  setup(ctx) {
    const DANGEROUS_TOOLS = ["bash", "delete_file", "write"];
    ctx.on("tool_call", ({ name, args }) => {
      if (DANGEROUS_TOOLS.includes(name)) {
        // 生产环境这里会是真实的用户输入
        console.log(`  ⚠️  [interactive] 确认：${name}(${JSON.stringify(args).slice(0, 50)}...) ? 模拟用户点"允许"`);
      }
    });
  },
};

// 策略 B：白名单（CI/CD 无人值守）
const whitelistExt: Extension = {
  name: "ci-whitelist",
  setup(ctx) {
    const WHITELIST = ["read", "find", "grep", "ls"];
    ctx.on("tool_call", ({ name }) => {
      if (!WHITELIST.includes(name)) {
        console.log(`  🚫 [whitelist] BLOCK: ${name} 不在 CI 白名单中`);
      }
    });
  },
};

// 策略 C：基于时间窗口的动态权限
const timeWindowExt: Extension = {
  name: "time-window",
  setup(ctx) {
    ctx.on("tool_call", ({ name }) => {
      const hour = new Date().getHours();
      if (name === "write" && hour < 9) {
        console.log(`  🔒 [time-window] BLOCK: 9 点前禁止写文件（当前 ${hour}:00）`);
      }
    });
  },
};

// ── 3. Extension Runner（模拟 Pi 的 Runner + 两阶段初始化） ──
class MiniExtensionRunner {
  private tools = new Map<string, ToolDef>();
  private handlers = new Map<EventName, Function[]>();

  registerExtension(ext: Extension) {
    const ctx: ExtensionContext = {
      on: (event, handler) => {
        if (!this.handlers.has(event)) this.handlers.set(event, []);
        this.handlers.get(event)!.push(handler);
      },
      registerTool: (tool) => {
        this.tools.set(tool.name, tool);
        console.log(`  📦 注册工具: ${tool.name}`);
      },
    };
    ext.setup(ctx);
  }

  async executeTool(name: string, args: Record<string, unknown>) {
    // 触发 tool_call 事件（所有 Extension 的 handler 执行）
    const handlers = this.handlers.get("tool_call") ?? [];
    for (const h of handlers) {
      h({ name, args });
    }
    // 执行工具
    const tool = this.tools.get(name);
    if (tool) return tool.execute(args);
    return `工具 ${name} 未找到`;
  }
}

// ── 4. 跑起来 ──
async function main() {
  const runner = new MiniExtensionRunner();

  // 注册 Extension（每个实现一种安全策略）
  runner.registerExtension(interactiveConfirmExt);
  runner.registerExtension(whitelistExt);
  runner.registerExtension(timeWindowExt);

  // 模拟 Agent 调用工具
  console.log("\n模拟 write 工具调用：");
  await runner.executeTool("write", { path: "config.ts", content: "..." });

  console.log("\n模拟 bash 工具调用：");
  await runner.executeTool("bash", { command: "rm -rf /tmp/test" });
}

main();
```

### 运行效果

```bash
$ npx tsx extension-pattern-demo.ts

模拟 write 工具调用：
  ⚠️  [interactive] 确认：write({"path":"config.ts","content":"..."}) ? 模拟用户点"允许"
  🚫 [whitelist] BLOCK: write 不在 CI 白名单中
  🔒 [time-window] BLOCK: 9 点前禁止写文件（当前 15:00）

模拟 bash 工具调用：
  ⚠️  [interactive] 确认：bash({"command":"rm -rf /tmp/test"}) ? 模拟用户点"允许"
  🚫 [whitelist] BLOCK: bash 不在 CI 白名单中
```

### 关键设计点

1. **一个事件 → 多个 handler 并行执行。** 同一个 `tool_call` 事件被三个 Extension 同时监听，每个按自己的规则判断。互不干扰，互不知晓对方的存在。这就是组合的力量。

2. **Extension 之间完全解耦。** `interactiveConfirmExt` 不知道 `whitelistExt` 的存在，也不需要知道。只要它们都注册到 Runner，系统自动把事件分发给所有 handler。

3. **策略可叠加、可替换。** 你想换一种权限策略？关掉一个 Extension，注册另一个。不需要改 Runner 代码，不需要改其他 Extension。

---

## 总结

今天用一个"三个旋钮 vs 一百个按钮"的类比讲清了 Pi 最核心的设计哲学：

1. **"不内建"不是功能缺失**——是发现几乎所有产品功能都可以从三个回调（execute、beforeToolCall、transformContext）组合出来。

2. **Extension 系统用"事件 + 钩子 + 工具注册"模式**——让第三方在不改核心的前提下扩展 Agent 能力。

3. **Skill（Markdown）和 Extension（TypeScript）互补**——前者管文档层面（告诉 LLM 怎么做），后者管运行层面（实际执行操作）。

---

## 下一期预告

> **Pi 的设计哲学：极简内核 + 反主流选择**
>
> 最后一篇回顾 Pi 的整体哲学——为"用 24% 的代码驱动 100% 的产品形态"付出的代价是什么、这套架构的适用边界在哪、你应该在什么时候选择这种设计（以及什么时候不该）。

---

*本文基于张汉东《[pi 的设计艺术](https://zhanghandong.github.io/pi-book/)》（CC BY-NC-SA 4.0）第 15-18 章内容改编。*
