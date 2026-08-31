---
title: "Cloudflare Code Mode：让 LLM 写代码而非调工具，把 MCP 变成 TypeScript API"
date: 2026-08-31T13:00:00+08:00
description: "本文拆解 Cloudflare Code Mode：把 MCP 工具渲染成 TypeScript API、让模型写代码而非发 tool-call 的新范式。从「莎士比亚学中文」的类比讲起，拆解类型生成、V8 isolate 沙箱隔离、网络封锁与密钥保护，再结合 cloudflare/agents 框架的 connector 与 snippet 机制，最后给出何时值得引入的判断清单。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "MCP", "Tool Calling", "Cloudflare"]
extra:
  update_date: 2026-08-31T13:00:00+08:00
---

让 LLM 调用外部工具，几乎成了所有 Agent 的标配。但 Cloudflare 在 2025 年底的一篇博客里抛出了一个反直觉的论点：**也许我们一直让模型用错了姿势**——不该让模型「调用工具」，而该让它「写代码」。

这个想法落地成了一套叫 **Code Mode** 的机制，也是 `cloudflare/agents` 框架里最引人注目的一块。本文基于 Cloudflare 官方博客 [*Code Mode: The Better Way to Use MCP*](https://blog.cloudflare.com/code-mode/) 与 [cloudflare/agents](https://github.com/cloudflare/agents) 仓库的源码与文档整理。

> 本文基于 Cloudflare 官方博客 [*Code Mode: The Better Way to Use MCP*](https://blog.cloudflare.com/code-mode/) 与 [cloudflare/agents](https://github.com/cloudflare/agents) 仓库整理，代码与结论引自原文，评论与引申为笔者补充。

## 1. 传统 tool-calling 到底别扭在哪

先看清主流做法：模型输出一组**特殊 token**（非文本 token）标记一次工具调用，harness 把这些 token 解析成 JSON、执行工具，再把结果通过另一组特殊 token 喂回模型。模型每次要「读」一遍中间结果，才能把它传给下一次调用。

问题有三层：

1. **特殊 token 是模型没见过的东西。** 这些 `tool_call` / `tool_result` 标记只在训练数据里零星出现，和模型日常见到的海量真实文本格格不入。
2. **链式调用时 token 浪费巨大。** 模型必须把每个中间结果都「读进神经网络」再吐出来传给下一跳——哪怕它只关心最终结果。
3. **工具越多越笨。** 传统方式下每个工具都要塞进上下文占地方，模型在几十个工具里挑一个，出错率随数量上升。

博客里那个类比很传神：让 LLM 调工具，就像**让莎士比亚上一个月的普通话培训班**——他是语言大师，但你非要他通过一套生硬、陌生的中介来表达。

## 2. Code Mode 的核心思路：把工具变成 API，让模型写代码

Code Mode 换了个呈现方式：**把 MCP 工具渲染成一套带类型和文档注释的 TypeScript API，让模型写一段调用它的代码**，而不是发出一连串 tool-call。

动机一句话：**模型见过海量真实代码，见过的 tool-calling 轨迹却少得可怜。** 真实世界的 TypeScript 充斥着它的训练语料，而 tool-call 的示例多半是人工构造的「教学样本」。所以「写代码」踩在模型的强项上，「发调用」踩在弱项上。

以连接一个 MCP server 为例。Code Mode 会抓取 server 的 schema，把它转成带文档注释的 TypeScript 声明，模型看到的是这样一个接口：

```ts
declare const codemode: {
  fetch_agents_documentation: (args: { query: string }) => Promise<string>;
  search_agents_code: (args: { pattern: string }) => Promise<string[]>;
  fetch_generic_url_content: (args: { url: string }) => Promise<string>;
};
```

模型不再从「一堆工具」里挑一个，而是照着这份声明写一段程序：

```ts
const docs = await codemode.fetch_agents_documentation({ query: "codemode" });
const hits = await codemode.search_agents_code({ pattern: "createCodeTool" });
return { docs, hits };
```

模型在**一次请求**里把多个工具串起来，中间结果只在程序内部流转，最终只有 `return` 的值回到上下文。这正是 [DeepSeek Harness 的 PTC 模式](/blog/deepseek-harness-agent-runtime/)「五次往返压成一次」的思路源头。

## 3. 工作原理：类型生成 → 归一化 → 沙箱执行

Code Mode 的流水线可以拆成五步：

1. **类型生成。** `createCodeTool` 从你的工具定义（AI SDK / Zod / 纯 JSON Schema）生成 TypeScript 类型声明，拼进 system prompt。
2. **模型写代码。** 模型输出一个 async 箭头函数，调用 `codemode.toolName(args)`。
3. **归一化。** 用 acorn 做 AST 解析，把模型输出（可能带 markdown 代码围栏、各种格式）规整成合法的 async 函数。
4. **沙箱执行。** `DynamicWorkerExecutor` 起一个隔离的 Worker，每个命名空间对应一个 `ToolDispatcher`。
5. **结果回收。** 沙箱内每个命名空间是一个 `Proxy`，拦截调用、通过 Workers RPC 路由回宿主；`console.log` 的 stdout 被捕获，连同结果一起返回给模型。

最小接入长这样：

```ts
import { createCodeTool } from "@cloudflare/codemode/ai";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";

const tools = {
  getWeather: tool({
    description: "Get weather for a location",
    inputSchema: z.object({ location: z.string() }),
    execute: async ({ location }) => `Weather in ${location}: 72°F, sunny`,
  }),
};

const executor = new DynamicWorkerExecutor({ loader: env.LOADER });
const codemode = createCodeTool({ tools, executor });

const result = streamText({ model, messages, tools: { codemode } });
```

注意最后一行：传统方式下 `tools` 里塞的是几十个工具，这里只塞了**一个** `codemode` 工具。

## 4. 沙箱与隔离：V8 isolate，而不是容器

「让模型写的代码在本地执行」这件事，安全性是命门。Code Mode 的选择很克制：

- **用 Cloudflare Workers 的 V8 isolate 而非容器。** isolate 比容器轻得多，毫秒级启动、几 MB 内存，所以可以「每条生成代码一个新 isolate，跑完即弃」。容器做这种粒度太重。
- **默认封网。** 沙箱里 `fetch()` 和 `connect()` 直接抛错（`globalOutbound: null`），只有通过 TypeScript binding 代理到已连接的 MCP server 的调用才放行。
- **密钥不泄露。** 出站的 binding 走的是 agent supervisor——它持有 access token，模型生成的代码永远碰不到裸密钥。
- **靠 Worker Loader API 落地。** 这套「按需加载 Worker 代码」的能力来自新的 Worker Loader，本地通过 workerd/Wrangler 就能跑（生产侧当时还是 closed beta）。

一句话：模型写的代码，只能在「你事先声明好的那几扇门」里活动。

## 5. MCP 并没有被取代

有意思的是，Code Mode 并不否定 MCP，反而说 MCP 更值钱了——只是它的角色变了。

MCP 的价值在于**连接层**：它提供统一的方式去发现一个 API（连同文档和鉴权），让 agent 和 server 在互不了解的情况下也能协作，也让沙箱能把访问范围收敛到「已定义的几个工具」。Code Mode 解决的是**调用层**：把 MCP 暴露出来的工具，用更贴合模型强项的方式（代码）去调用。二者是叠加关系，不是替代关系。

```
传统：  MCP 工具 ──► 一堆 tool-call token ──► 模型逐个挑、逐个往返
Code Mode：MCP 工具 ──► TypeScript API 声明 ──► 模型写一段代码一次跑完
```

## 6. 更大的一张图：cloudflare/agents

Code Mode 只是 `cloudflare/agents` 里的一块。这个框架的底层卖点同样值得知道：**Agent 是「持久、有状态」的执行环境**，建立在 Cloudflare Durable Objects 之上。

- 每个 agent 本质是一个 Durable Object，自带存储、生命周期和状态，状态自动同步到所有连接的客户端，重启也不丢。
- 空闲时**休眠**、有请求时**唤醒**，不活跃时不花钱——因此支持跑**几百万个** agent，「每个用户一个、每个会话一个、每个游戏房间一个」。
- 前端通过 **typed RPC** 调用后端方法，像调本地函数一样；内置实时通信、调度、AI、MCP、workflow、邮件、语音、浏览器 agent 等一票能力。

围绕 codemode 还有几个进阶设计值得单独拎出来：

- **Connector**：把外部服务桥接进沙箱的类。`McpConnector` 包装一个 MCP server（每个 MCP 工具变成 namespace 上的一个方法，工具名会被清洗成合法 JS 标识符）；`OpenApiConnector` 包装 OpenAPI spec，**只在宿主侧读一次 spec**、每个 operation 派生一个类型化工具，模型直接 `stripe.CreatePaymentIntent({...})`，低层的 `request` 作为逃生舱保留。
- **Snippet**：可持久化、可寻址的「保存下来的脚本」。宿主把一次运行提升为 snippet（`saveSnippet("list-open-prs", {...})`），沙箱里模型用 `codemode.run("list-open-prs")` 按名执行。snippet 的身份由 connector 集合派生——**「一段 snippet 永远只跑在当初写它时的那组 connector 上」**，这个约束很聪明，避免了「换个环境跑出意外」的坑。
- **审批流**：运行时通过 `pending / approve / reject / rollback` 驱动人类审批，带 `needsApproval` 的工具能被拦截。

## 7. 局限：别把它当银弹

文档里诚实列出的限制，读起来和卖点一样重要：

- **运行时审批只对 connector 注解生效**；老 `createCodeTool` 对 `needsApproval: true` 的工具是直接**排除**，而不是暂停执行。
- **浏览器沙箱（IframeSandboxExecutor）的 timeout 拦不住紧同步死循环**——`while(true){}` 会卡死浏览器事件循环，因为没法抢占。
- **`DynamicWorkerExecutor` 依赖 Cloudflare Workers 环境**（Executor 接口开放，可自己实现 Node VM / QuickJS / 容器版）。
- **只执行 JavaScript**，不是任意语言。

## 8. 对我们的启发

**① 该不该用 Code Mode，先看任务形态。** 如果你的 agent 频繁做「多工具链式组合、循环、按中间值分支、并发汇总」，Code Mode 的「一次往返」收益很大；如果只是单步调用，引入一套代码沙箱反而过重。

**② 对比传统 tool-calling：**

| 维度 | 传统 tool-calling | Code Mode |
|---|---|---|
| 模型动作 | 从工具表挑一个发调用 | 照着类型声明写代码 |
| 多步组合 | 每步一次完整往返 | 一次请求内跑完 |
| 中间结果 | 全回上下文 | 只在程序内，最终值才回 |
| 工具数量增长 | 出错率上升 | 收敛为「一个入口」 |
| 训练数据契合度 | 弱（特殊 token 少见） | 强（真实代码海量） |
| 安全成本 | 每个工具单独控制 | 需整套沙箱 + 封网 + 密钥托管 |
| 基础设施要求 | 低 | 需 Worker Loader / 独立执行器 |

**③ 沙箱设计三件事缺一不可：** 轻量隔离（isolate 而非容器）、默认封网（`fetch`/`connect` 直接禁）、密钥托管在 supervisor 而非代码可达处。想自己实现「模型写代码」，这三条是底线。

**④ MCP 与 Code Mode 是分层关系，别二选一。** MCP 负责「连接与发现」，Code Mode 负责「调用方式」。把工具发现和工具调用解耦，才谈得上替换任一层的实现。

**⑤ 「持久状态 + 按需唤醒」是 agent 的新默认。** Durable Objects 那套「空闲休眠、唤醒执行、状态自动同步、百万级实例」的模型，把「无状态函数」的假设打翻了——有状态的 agent 才能承载跨会话的记忆与工作流。这也是上一篇 [DeepSeek Harness 拆解](/blog/deepseek-harness-agent-runtime/)里 dsh「持续学习」梦想的一个务实落点。

**⑥ 关注「snippet」这种能力沉淀形态。** 把一次成功的调用序列保存成可寻址的 snippet，本质是把「模型的一次经验」固化下来复用。这和持续学习里「把新能力沉淀成可复用单元」是同一个方向，只是粒度更工程化。

## 参考资料

- [Code Mode: The Better Way to Use MCP](https://blog.cloudflare.com/code-mode/) — Cloudflare Blog
- [cloudflare/agents](https://github.com/cloudflare/agents) — GitHub 仓库
- [@cloudflare/codemode README](https://github.com/cloudflare/agents/blob/main/packages/codemode/README.md) — codemode 包文档
- [Code Mode — Cloudflare Agents docs](https://developers.cloudflare.com/agents/tools/codemode/)
- [Worker Loader](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/) — Cloudflare Workers 文档
- [拆解 DeepSeek Harness：PTC 与「创造模式」如何重新设计 Agent 运行时](/blog/deepseek-harness-agent-runtime/) — 本文关联阅读
