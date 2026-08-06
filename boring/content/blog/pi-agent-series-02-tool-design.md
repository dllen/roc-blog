---
title: "Pi 的工具设计：为什么\"约束\"比\"自由\"更重要"
date: "2026-08-06"
update_date: "2026-08-06"
description: "Pi 给 LLM 设计工具的原则是：约束即保护。本文拆解 6+1 工具哲学、Edit 的精确替换、Bash 的边界、搜索的结构化，以及为什么 LLM 用结构化参数犯的错比自由文本少得多。"
tldr: "给 LLM 设计工具和给人设计 UI 是一回事——搞清楚它在什么时候会犯错、怎么防止它犯错。一个好的工具接口不是'能干什么'的列表，而是一道带护栏的通道。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Pi", "Tool Design", "TypeScript", "系列教程"]
series: "Pi Agent 系列教程"
series_order: 2
---

> 本文是 **Pi Agent 系列教程**第 2 篇。基于张汉东《[pi 的设计艺术](https://zhanghandong.github.io/pi-book/)》第 19-23 章改编。上一篇讲清了 Pi 的架构——四层洋葱和 Agent Loop 引擎。今天聚焦一个具体问题：**该给 Agent 什么工具？怎么设计工具接口才能让 LLM 少犯错？**

---

## Part 1：概念——工具是带护栏的接口

### 最天真的问题：为什么不能只给一个 Bash？

如果你刚接触 Agent 开发，很可能会问这个问题——"LLM 不是很擅长写代码吗？给它一个 shell 让它自己敲不就行了？"

Pi 的设计者给了明确答案。他选了 **6 个结构化工具 + Bash 后备**：

| 工具 | 作用 | 为什么不能只用 Bash |
|------|------|----------|
| `read` | 读文件，支持行范围 | `cat \| sed -n '50,79p'` 引号不匹配就完蛋 |
| `write` | 创建或全量覆盖文件 | echo heredoc 各种转义地狱 |
| `edit` | 精确替换（oldText → newText） | sed 替换一个拼写错误可能导致全局误伤 |
| `find` | 文件名模式匹配 | `find . -name '*.ts'` 跨平台差异是噩梦 |
| `grep` | 文本内容搜索 | rg 和 grep 参数不一致，模型更分不清 |
| `ls` | 列目录 | 简单操作，但 bash 里 `ls -la` 输出格式不稳定 |
| `bash` | 万能后备 | 上述工具覆盖不了的操作 |

核心原因：**"LLM 用结构化参数犯的错比用自由文本命令少得多。"**

对比一下：

```typescript
// 结构化工具——类型错误立即被捕获
read({ path: "src/index.ts", offset: 50, limit: 30 })

// 自由文本命令——任何小错产生模糊的 bash 报错
"cat src/index.ts | sed -n '50,79p'"
// 引号不匹配？管道遗漏？sed 语法错？——全是一个 "command not found" 或空输出
```

结构化参数有 schema 验证（Pi 用 TypeBox），传入错误类型（offset 传了字符串）会被**立即拒绝并反馈具体错误**。模型下一轮就能修正。Bash 命令的任何小错都会产生模糊的报错——可能需要多轮试错才能定位问题。

### 设计原则 1：为"高频且容易出错"的操作提供专用工具

Pi 的选择标准很清楚：如果某个操作 LLM 每天都在做（read、edit、search），而且用 bash 做容易出错，那就值得一个专用工具。

但不是所有 bash 操作都值得专用化。`wc -l *.ts | sort -n` 这种一行搞定的事，不值得。策略是**只为高频 + 高危操作提供专用工具**，其余交给 bash 后备。

### 设计原则 2：输出截断是硬约束，不是可有可无

LLM 的上下文窗口是稀缺资源。如果 grep 在一个 10 万行项目中搜索 "TODO"，匹配了 5000 行，全塞进上下文就是浪费 token。

Pi 的所有工具共享统一的截断逻辑：

- **行数上限**：2000 行
- **字节上限**：50 KB
- **先触及者生效**

但截断策略因工具而异：

| 工具 | 截断方式 | 原因 |
|------|---------|------|
| `read`、`grep`、`find` | `truncateHead` — 保留开头 | 前 N 条结果最有价值 |
| `bash` | `truncateTail` — 保留结尾 | "命令输出的最后几行通常包含错误信息" |

截断不产生半行，元信息完整携带总行数/字节和触发限制的具体类型——工具据此生成有意义的状态提示（如"输出共 5234 行，仅显示前 2000 行"）。

### 设计原则 3：约束采样——事后校验 + 事前保证

从 v0.82.0 开始，Pi 叠加了两层约束：

1. **TypeBox 事后校验**：Pi 侧的 schema 验证，工具执行前自动检查参数合法性
2. **constrainedSampling 事前保证**：让 provider 在解码时就用 JSON Schema 约束输出结构

两种模式共存：
- `json_schema`：按工具 schema 严格解码，分"prefer"（尽力而为）和"require"（必须严格）两档
- `grammar`：用正则或 Lark 语法约束输出，适用于非 JSON 格式

叠加效果：LLM 生成本身就被约束在合法结构内，外加 Pi 侧的二次验证兜底。从根本上减少了"工具参数格式非法"导致的失败。

---

## Part 2：类比——给 LLM 设计工具就像给盲人设计菜单

### 盲人餐厅

想象你是一家盲人餐厅的主厨。你的客人看不到菜——他们只能通过你的菜单描述和口味判断。

你会怎么设计菜单？

- ❌ **万能菜单**："我们有全世界的食材，你想吃什么我都能做。"——客人无从下手，可能会点一个根本不存在的组合
- ❌ **技术规格菜单**："猪里脊 150g ± 5g，盐 1.2g，烹饪温度 165°C，时间 8 分钟。"——精确但没用，客人不知道这些参数组合出来是什么
- ✅ **结构化菜单**："红烧排骨——甜咸口味，配米饭。什么时候想吃'让人满足的中式硬菜'时选这个。"

这正好对应了给 LLM 设计工具的三种方式：

| 菜单方式 | 对应工具设计 | 好坏 |
|---------|-----------|------|
| "什么都能做" | 只给一个 Bash | 自由度太高，LLM 不知道从哪里开始 |
| "技术规格" | JSON Schema 但没有 description / promptGuidelines | 类型正确但不知道什么时候该用 |
| "结构化菜单" | 有描述、有边界、有示例的工具 | LLM 知道什么时候用什么 |

### 精确替换 vs 模糊替换

继续盲人餐厅的类比。如果你让一位盲人厨师"把那盘菜里的花椒换成黑胡椒"，你需要给他一个**绝对不会搞混**的指示：

- ❌ "把花椒换掉"——如果盘里有花椒油和花椒粒，换哪个？
- ✅ "把位于盘子左上角的那三粒完整花椒换成等量的现磨黑胡椒"——唯一性保证

这就 Pi Edit 工具的核心约束：**`oldText` 必须精确匹配且唯一。**

```typescript
edits: Type.Array(Type.Object({
  oldText: Type.String({
    description: "Exact text for one targeted replacement. Must be unique."
  }),
  newText: Type.String({
    description: "Replacement text for this targeted edit."
  }),
}))
```

这个约束是强制性的。如果 LLM 提供的 `oldText` 在文件里出现两次，Pi 会拒绝这次编辑并告诉 LLM "你的 oldText 不唯一"。这不是不给 LLLM 自由，而是防止模糊替换导致意外修改——就像盲人厨师绝对不会被允许在没有确认的情况下替换食材。

---

## Part 3：动手——设计一个"带护栏"的工具

### 我们要做什么

用 TypeScript 写一个带 TypeBox schema 验证的工具定义，展示 Pi 的工具设计模式——不只是 JSON Schema，而是包含 description、边界、示例的完整契约。

### 完整代码

```typescript
// tool-design-demo.ts
// 演示 Pi 的工具设计理念：结构化参数 + 类型校验 + 描述即文档

import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// ── 1. 工具定义（模仿 Pi 的 ToolDefinition 接口） ──
interface ToolDefinition<TParams = Record<string, unknown>> {
  name: string;
  description: string;        // 告诉 LLM"什么时候用"
  parameters: TParams extends Record<string, unknown>
    ? ReturnType<typeof Type.Object>
    : never;
  promptGuidelines?: string[];  // 注入 system prompt 的使用指南
  execute: (args: Static<TParams>) => Promise<string>;
}

// ── 2. 定义一个"安全文件删除"工具 ──
const deleteFileSchema = Type.Object({
  path: Type.String({
    description:
      "要删除的文件路径（相对于项目根目录）",
  }),
  reason: Type.String({
    description:
      "删除原因，将写入操作日志。例：'不再使用的测试文件'",
  }),
  backup: Type.Boolean({
    description:
      "是否先备份到 .trash/ 目录。危险文件必须设为 true",
    default: true,
  }),
});

const deleteFileTool: ToolDefinition<typeof deleteFileSchema> = {
  name: "delete_file",
  description:
    "删除指定文件。当需要清理不需要的文件时使用。" +
    "不要用于删除 node_modules 等依赖目录——用 bash 'rm -rf'。" +
    "不能用于删除 .git 目录内的文件。",
  parameters: deleteFileSchema,
  promptGuidelines: [
    "- 删除前确认文件不在 .gitignore 的关键路径中",
    "- 如果文件曾被其他模块引用，先更新引用再删除",
    "- 一次只删除一个文件，批量删除用 bash",
  ],
  async execute(args: Static<typeof deleteFileSchema>) {
    return `已删除 ${args.path}（备份：${args.backup}，原因：${args.reason}）`;
  },
};

// ── 3. 工具执行管线：校验 → 转换 → 执行 ──
async function executeWithGuardrail<T extends Record<string, unknown>>(
  tool: ToolDefinition<any>,
  rawArgs: T,
): Promise<string> {
  // 3a. TypeBox 校验（Pi 的事后校验层）
  if (!Value.Check(tool.parameters, rawArgs)) {
    const errors = [...Value.Errors(tool.parameters, rawArgs)];
    return JSON.stringify({
      error: "参数校验失败",
      details: errors.map((e) => ({
        path: e.path,
        message: e.message,
        expected: e.schema?.description ?? "未知",
        received: JSON.stringify(e.value),
      })),
      hint: "请根据 details 中的具体信息修正参数后重试。",
    });
  }

  // 3b. 执行工具
  try {
    const result = await tool.execute(rawArgs);
    return result;
  } catch (err: any) {
    return JSON.stringify({
      error: "工具执行异常",
      message: err.message,
      hint: "请检查文件是否存在、权限是否正确。",
    });
  }
}

// ── 4. 演示：正确调用 vs 错误调用 ──
async function main() {
  console.log("=" .repeat(50));
  console.log("工具设计演示：delete_file");
  console.log("=".repeat(50));

  // 正确调用
  const ok = await executeWithGuardrail(deleteFileTool, {
    path: "src/old-helper.ts",
    reason: "功能已迁移到 utils/helper.ts，旧文件不再被引用",
    backup: true,
  });
  console.log(`\n✅ 正确调用：${ok}`);

  // 错误调用：缺少必填字段
  const bad1 = await executeWithGuardrail(deleteFileTool, {
    path: "src/old-helper.ts",
    // reason 缺失——必填字段
  });
  console.log(`\n❌ 缺少必填字段：${bad1.slice(0, 200)}...`);

  // 错误调用：类型错误
  const bad2 = await executeWithGuardrail(deleteFileTool, {
    path: "src/old-helper.ts",
    reason: "不再需要",
    backup: "yes",  // 应该是 boolean，传了 string
  });
  console.log(`\n❌ 类型错误：${bad2.slice(0, 200)}...`);
}

main();
```

### 运行效果

```bash
$ npx tsx tool-design-demo.ts

==================================================
工具设计演示：delete_file
==================================================

✅ 正确调用：已删除 src/old-helper.ts（备份：true，原因：功能已迁移到 utils/helper.ts，旧文件不再被引用）

❌ 缺少必填字段：{"error":"参数校验失败","details":[{"path":"/reason","message":"必填字段","expected":"删除原因...","received":"undefined"}],"hint":"请根据 details 中的具体信息修正参数后重试。"}

❌ 类型错误：{"error":"参数校验失败","details":[{"path":"/backup","message":"类型不匹配","expected":"boolean","received":"\"yes\""}],"hint":"请根据 details 中的具体信息修正参数后重试。"}
```

### 关键设计点

1. **`description` 是"决定树"，不是"功能列表"**：告诉 LLM 什么时候用、什么时候不该用、不能用在哪。模型的决策准确率直接取决于描述的精确度。

2. **TypeBox 校验的错误信息对 LLM 友好**：不只是"错了"，而是"哪里错、期望什么、实际收到了什么、怎么改"。这正是 Pi 的哲学——错误反馈越精确，模型自我纠正的成功率越高。

3. **`promptGuidelines` 参与 System Prompt 组装**：工具不只是执行体，还能指导 LLM 怎么使用自己——把最佳实践注入提示词。

---

## 总结

今天我们用"盲人餐厅"的类比讲清了 Pi 的工具设计哲学：

1. **结构化参数优于自由文本**——LLM 用 schema 约束的参数犯的错比自由拼接的 shell 命令少得多。

2. **6+1 工具策略精确地平衡了"易用"和"安全"**——高频且易错的操作给专用工具，其余留给 bash 后备。

3. **"约束即保护"是核心思想**——从输出截断到参数校验到 constrainedSampling，每层约束都是为了防止 LLM 犯它最常见的错误。

---

## 下一期预告

> **Pi 的能力外置：Extension / Skill / Resource Loader**
>
> Pi 为什么没有内建 MCP、子 Agent、权限弹窗、Plan Mode？因为这些功能都是"可以从更底层机制组合出来的"。下一篇拆解 Extension 系统——怎么用三个回调（execute、beforeToolCall、transformContext）组合出无限的产品形态。

---

*本文基于张汉东《[pi 的设计艺术](https://zhanghandong.github.io/pi-book/)》（CC BY-NC-SA 4.0）第 19-23 章内容改编。*
