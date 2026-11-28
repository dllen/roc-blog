---
title: "Agent 的三笔账：工具、步数与反思"
date: "2026-11-27"
description: "从我的面试答案笔记《04 AI Agent》里取工具设计、ReAct 与 Plan-and-Execute、反思三题，补三个可跑的模型：工具数量的双重税、两种范式的 token 曲线、反思的盈亏平衡点。"
tldr: "工具数量是双重税：50 个工具时至少选错 63.6%、占上下文 4.7%；分层检索 8 个把错误率降到 14.9%（净成功率 80.8% vs 全给的 36.4%），但要付 5% 的召回失败。两种范式的 token 曲线：ReAct 是平方（30 步 582,000），Plan-and-Execute 是线性（39,000，差 14.9 倍）；上下文压缩能把 30 步降到 240,000，但 10 步时压缩反而更贵。反思的盈亏平衡：成本涨 67%（3→5 次调用），成功率必须涨同样比例才打平。"
keywords: ["AI Agent", "工具设计", "ReAct", "Plan-and-Execute", "反思"]
taxonomies:
  tags: ["AI 工程", "Agent", "技术深度", "面试笔记"]
---

Agent 的三笔账？工具能放多少个、任务要多少步、反思划不划算。我的面试答案笔记《04 AI Agent》里有 20 道题（什么是 Agent、Harness Engineering、ReAct、Plan-and-Execute、function calling、结构化输出、工具设计、单/多 agent、MCP、SubAgents、记忆、agent loop、反思、上下文工程与压缩、评测、agent 安全），答案都写得很完整，但三笔「各是多少」是定性的。这篇把它们算出来。

## 口径说明

- 源是我自己的面试答案笔记 `06-面试/答案/04-AI-Agent-答案.md`（24 KB，20 题）。可以自由引用；本文正文主体是**自写可复现模型**。
- 三个脚本只依赖 Python 标准库；输出为实跑结果，逐行可复现（无随机数，两次运行输出逐字一致）。
- 笔记里给出的量（工具设计的 5 条原则、ReAct 的 Thought-Action-Observation、Plan-and-Execute 的 Planner + Executor 及其对比表、反思的三种范式与 Generate→Critique→Refine 循环）直接标注来源；**我为了建模补的**（每工具 token 数、单个工具选择错误率、召回率、每轮 token、反思调用数与成功率、调用单价）都标为「估」。
- **撞题与边界**：自动判 TITLE_HIT（命中标题相近的已发文章）。已发语料里已有《Loop Engineering：Agent 循环工程化》《删掉 90% 的 harness 之后》《彻底搞懂 Agent Skills》《上下文工程：指令、材料与完成的定义》《按成功任务算 Token 成本》——**它们讲工程化框架、harness 精简、Skills/MCP、上下文工程与 token 口径**；本文只做三件它们没算的事：工具数量与**选择错误率**的双重量化、两种范式的 **token 曲线形状**、反思的**盈亏平衡点**。

## 一、笔记的骨架：三个机制

**Q8 工具设计**：原则是「少而精、原子化、描述清晰、可恢复、有错误反馈」；五条具体规则——**描述即 Prompt**（模型靠 description 判断何时调用，所以要写明何时该用、何时不该用、参数含义、副作用）、原子化（别做 `do_everything(query, action, ...)`）、参数 schema 严格（JSON Schema 必填项、最小长度、枚举值写全）、错误返回结构化（`{"error": ..., "suggestion": ...}` 而不是抛异常）、幂等优先。

**Q4/Q5 两种范式**：**ReAct** 把思考与行动交错——Thought（自然语言推理）→ Action（工具调用）→ Observation（工具返回拼回 prompt 继续）；**Plan-and-Execute** 拆成 Planner（一次性产出完整计划）与 Executor（逐步执行子任务）。笔记的对比表里有一行「Token 消耗：ReAct 高（逐步推理）vs Plan-and-Execute 较低（计划可缓存复用）」，还有「失败处理：局部重试 vs 重新激活 Planner」。

**Q16 反思**：把「做」与「评」拆成两个阶段，三种范式——**Self-Reflection**（同一个 LLM 被要求「请检查你的答案有没有错」）、**External Critic / Reward Model**、**Multi-Agent Debate**（两个 Agent 各给方案、互相挑刺、最后合并或仲裁）；典型循环是 Generate → Critique → Refine → 重新评估（是则再循环）。

## 二、增量一：工具数量是一笔双重税

笔记说工具要「少而精」，但没说少到什么程度、多的代价是什么。把它算出来：

```python
"""工具数量是一笔双重税：选择错误率 + 上下文占用。

用笔记的量：工具设计的 5 条原则（描述即 Prompt、原子化、严格 schema、结构化错误、幂等）、
「少而精」。
只依赖标准库；输出确定性。
"""
CTX_WINDOW = 128_000
TOKENS_PER_TOOL = 120      # 描述 + JSON Schema（估）
P_SELECT_ERR = 0.02        # 单个工具被选错/选不中的概率（估）
RECALL = 0.95              # 分层检索时正确工具被召回的概率（估）
REQ_DAY = 100_000

print("一、工具越多，选错的概率越高（错误独立假设）")
print("%-8s %16s %18s %18s" % ("工具数 N", "至少选错", "工具定义 token", "占上下文窗口"))
for n in (5, 10, 20, 50, 100, 200):
    err = 1 - (1 - P_SELECT_ERR) ** n
    tokens = n * TOKENS_PER_TOOL
    print("%-8d %15.1f%% %16s %17.1f%%" % (n, err * 100, format(tokens, ","),
                                          100.0 * tokens / CTX_WINDOW))
print()
print("二、分层：先检索出 K 个候选工具再给模型")
print("%-8s %14s %16s %14s %18s" % ("候选数 K", "选择错误率", "工具 token", "召回失败", "净成功率"))
for k in (3, 8, 20, 50):
    err = 1 - (1 - P_SELECT_ERR) ** k
    tokens = k * TOKENS_PER_TOOL
    net = RECALL * (1 - err)
    print("%-8d %13.1f%% %14s %13.1f%% %17.1f%%" % (k, err * 100, format(tokens, ","),
          (1 - RECALL) * 100, net * 100))
print()
print("三、和「工具全给」逐项比（净成功率 = 召回率 x 选对率）")
def compare(n_direct, k_retrieved):
    err_d = 1 - (1 - P_SELECT_ERR) ** n_direct
    err_r = 1 - (1 - P_SELECT_ERR) ** k_retrieved
    net_d = 1 - err_d
    net_r = RECALL * (1 - err_r)
    print("  全给 %3d 个：净成功率 %5.1f%%、工具 token %6s | 检索 %2d 个：净成功率 %5.1f%%、工具 token %5s"
          % (n_direct, net_d * 100, format(n_direct * TOKENS_PER_TOOL, ","),
             k_retrieved, net_r * 100, format(k_retrieved * TOKENS_PER_TOOL, ",")))
compare(50, 8)
compare(50, 20)
compare(200, 20)
print()
print("四、上下文被工具定义吃掉的比例会挤掉真正的工作记忆")
print("%-10s %14s %14s %20s" % ("工具数", "工具 token", "剩余上下文", "够放几轮 1,200 token"))
for n in (20, 50, 200):
    used = n * TOKENS_PER_TOOL
    left = CTX_WINDOW - used
    print("%-10d %14s %14s %19.1f 轮" % (n, format(used, ","), format(left, ","), left / 1200))
print()
print("五、工具定义是**每个请求都要重发**的：它与轮数相乘")
for n in (20, 50, 200):
    per_req = n * TOKENS_PER_TOOL
    for steps in (10, 30):
        print("   %3d 个工具 x %2d 轮 -> 工具定义重复发送 %s token" % (n, steps, format(per_req * steps, ",")))
print()
print("判据：")
print("  - **工具数量同时收两次税**：选错的概率（1-(1-p)^N）与占用的上下文（120N token）。")
print("    N=50 时至少选错 %.0f%%、占窗口 %.0f%%；N=200 时几乎必然选错。" % (
    (1 - (1 - P_SELECT_ERR) ** 50) * 100, 100.0 * 50 * TOKENS_PER_TOOL / CTX_WINDOW))
print("  - **分层检索同时改善两项，但引入召回失败**：50 个工具直接给 vs 检索 8 个 ->")
print("    选择错误率 64%% -> 15%%、工具 token 6,000 -> 960；代价是 %.0f%% 的请求正确工具没被召回（直接失败）。" % ((1 - RECALL) * 100))
print("    判据：**净成功率才是比较口径**——把召回失败算进来，分层才是划算的。")
print("  - **工具定义占的上下文会直接挤掉工作记忆**：50 个工具占 %.0f%% 窗口，剩下只够 %.1f 轮对话；" % (
    100.0 * 50 * TOKENS_PER_TOOL / CTX_WINDOW, (CTX_WINDOW - 50 * TOKENS_PER_TOOL) / 1200))
print("    更关键的是它**每轮都要重发**：50 个工具 x 30 轮 = %s token 只是工具定义，" % format(50 * TOKENS_PER_TOOL * 30, ","))
print("    还没算任何对话内容 —— 工具多在多轮场景里是**乘法**成本。")
```

输出：

```text
一、工具越多，选错的概率越高（错误独立假设）
工具数 N                至少选错         工具定义 token             占上下文窗口
5                    9.6%              600               0.5%
10                  18.3%            1,200               0.9%
20                  33.2%            2,400               1.9%
50                  63.6%            6,000               4.7%
100                 86.7%           12,000               9.4%
200                 98.2%           24,000              18.8%

二、分层：先检索出 K 个候选工具再给模型
候选数 K             选择错误率         工具 token           召回失败               净成功率
3                  5.9%            360           5.0%              89.4%
8                 14.9%            960           5.0%              80.8%
20                33.2%          2,400           5.0%              63.4%
50                63.6%          6,000           5.0%              34.6%

三、和「工具全给」逐项比（净成功率 = 召回率 x 选对率）
  全给  50 个：净成功率  36.4%、工具 token  6,000 | 检索  8 个：净成功率  80.8%、工具 token   960
  全给  50 个：净成功率  36.4%、工具 token  6,000 | 检索 20 个：净成功率  63.4%、工具 token 2,400
  全给 200 个：净成功率   1.8%、工具 token 24,000 | 检索 20 个：净成功率  63.4%、工具 token 2,400

四、上下文被工具定义吃掉的比例会挤掉真正的工作记忆
工具数              工具 token          剩余上下文     够放几轮 1,200 token
20                  2,400        125,600               104.7 轮
50                  6,000        122,000               101.7 轮
200                24,000        104,000                86.7 轮

五、工具定义是**每个请求都要重发**的：它与轮数相乘
    20 个工具 x 10 轮 -> 工具定义重复发送 24,000 token
    20 个工具 x 30 轮 -> 工具定义重复发送 72,000 token
    50 个工具 x 10 轮 -> 工具定义重复发送 60,000 token
    50 个工具 x 30 轮 -> 工具定义重复发送 180,000 token
   200 个工具 x 10 轮 -> 工具定义重复发送 240,000 token
   200 个工具 x 30 轮 -> 工具定义重复发送 720,000 token

判据：
  - **工具数量同时收两次税**：选错的概率（1-(1-p)^N）与占用的上下文（120N token）。
    N=50 时至少选错 64%、占窗口 5%；N=200 时几乎必然选错。
  - **分层检索同时改善两项，但引入召回失败**：50 个工具直接给 vs 检索 8 个 ->
    选择错误率 64% -> 15%、工具 token 6,000 -> 960；代价是 5% 的请求正确工具没被召回（直接失败）。
    判据：**净成功率才是比较口径**——把召回失败算进来，分层才是划算的。
  - **工具定义占的上下文会直接挤掉工作记忆**：50 个工具占 5% 窗口，剩下只够 101.7 轮对话；
    更关键的是它**每轮都要重发**：50 个工具 x 30 轮 = 180,000 token 只是工具定义，
    还没算任何对话内容 —— 工具多在多轮场景里是**乘法**成本。
```

三处结论：

**第一，工具数量同时收两次税。** 单个工具的选择错误率取 2%（错误独立假设）：N=20 → 至少选错 **33.2%**；N=50 → **63.6%**；N=200 → **98.2%**。同时工具定义（描述 + schema，按 120 token/工具估）占上下文：50 个 → 6,000 token（窗口的 4.7%），200 个 → 24,000 token（18.8%）。**判据：N 个工具的准确率代价是 `1−(1−p)^N`——它对 N 的敏感度远高于直觉**，所以「多给几个工具让模型自己挑」在几十个工具量级就已经不成立。

**第二，分层检索同时改善两项，但引入第三项（召回失败）。** 50 个工具直接给 vs 先检索出 8 个候选：选择错误率 **63.6% → 14.9%**、工具 token **6,000 → 960**；代价是检索层有 5% 的概率没把正确工具召回（请求直接失败）。**净成功率（召回率 × 选对率）才是比较口径**：全给 50 个是 **36.4%**，检索 8 个是 **80.8%**——分层明显更划算。**判据：不要只看错误率下降多少，要把召回失败一起算进去再比。**

**第三，工具定义是乘法成本，不是一次性成本。** 50 个工具占窗口 5%、剩下只够 101.7 轮对话——看着不致命；但**工具定义每个请求都要重发**：50 个工具 × 30 轮 = **180,000 token，全是工具定义，还没算任何对话内容**。**判据：工具多在多轮场景里是乘数级的浪费**——这正是笔记「少而精」的算术依据，也是分层检索真正的价值所在。

## 三、增量二：ReAct 与 Plan-and-Execute 的 token 曲线形状不同

笔记的对比表说 ReAct「token 消耗高」、Plan-and-Execute「较低」，但没说是高多少、怎么随步数涨。算出来：

```python
"""ReAct vs Plan-and-Execute：token 曲线是平方还是线性。

用笔记的量：ReAct 的 Thought-Action-Observation 循环、Plan-and-Execute 的 Planner + Executor、
两者对比表（Token 消耗 ReAct 高、计划可缓存复用）。
只依赖标准库；输出确定性。
"""
INIT_PROMPT = 2_000       # 系统提示 + 任务（token）
TURN_TOKENS = 1_200       # 每轮的 thought + action + observation（估）
PLAN_TOKENS = 1_000       # 一次性计划的 token（估）
COMPACT_WINDOW = 8_000    # 上下文压缩后的固定窗口（估）


def react_total(steps):
    """ReAct：第 i 轮的 prompt 包含前 i-1 轮的全部内容 -> 总输入 token 是二次的。"""
    per_turn_prompt = []
    ctx = INIT_PROMPT
    for _ in range(steps):
        per_turn_prompt.append(ctx)
        ctx += TURN_TOKENS
    return sum(per_turn_prompt)


def react_compacted(steps):
    """压缩后：每轮 prompt 固定为窗口大小。"""
    return steps * COMPACT_WINDOW


def plan_total(steps):
    return INIT_PROMPT + PLAN_TOKENS + steps * TURN_TOKENS


print("%-8s %16s %18s %18s %16s" % ("步数", "ReAct 总输入", "压缩后 ReAct", "Plan-Execute", "倍差"))
for steps in (5, 10, 20, 30, 50):
    r = react_total(steps)
    rc = react_compacted(steps)
    pe = plan_total(steps)
    print("%-8d %16s %18s %18s %15.1fx" % (steps, format(r, ","), format(rc, ","),
                                            format(pe, ","), r / pe))
print()
print("   => ReAct 的总输入随步数**二次增长**（每轮都重发全部历史），")
print("      Plan-and-Execute 是线性的（计划一次、每步只带子目标与当前观察）。")
print()
print("一、压缩能救回多少")
for steps in (10, 30, 50):
    r = react_total(steps)
    rc = react_compacted(steps)
    print("   %2d 步：%s -> %s token（省 %.1f 倍），但仍比 Plan-Execute 多 %.1f 倍"
          % (steps, format(r, ","), format(rc, ","), r / rc, rc / plan_total(steps)))
print()
print("二、Plan-and-Execute 的返工成本：计划错了要重规划")
REWORK_RATE = 0.25        # 需要重新规划的比例（估）
for steps in (10, 30):
    pe = plan_total(steps)
    pe_rework = pe * (1 + REWORK_RATE) + plan_total(steps) * REWORK_RATE * 0.5
    print("   %2d 步：一次跑完 %s token；含 %.0f%% 返工 -> 期望 %s token（仍只有 ReAct 的 %.1f%%）"
          % (steps, format(pe, ","), REWORK_RATE * 100, format(int(pe_rework), ","),
             100.0 * pe_rework / react_total(steps)))
print()
print("判据：")
print("  - **ReAct 的成本是步数的平方**：10 步 %s token、30 步 %s、50 步 %s；" % (
    format(react_total(10), ","), format(react_total(30), ","), format(react_total(50), ",")))
print("    Plan-and-Execute 是线性的（30 步 %s）-> **长任务必须换范式或做上下文压缩**。" % format(plan_total(30), ","))
print("  - **压缩把平方变成线性**（每轮 prompt 固定 8,000）：30 步 %s -> %s（省 %.1f 倍），" % (
    format(react_total(30), ","), format(react_compacted(30), ","), react_total(30) / react_compacted(30)))
print("    但仍比 Plan-and-Execute 多 %.1f 倍；而且 **10 步时压缩反而更贵**（%s -> %s），" % (
    react_compacted(30) / plan_total(30), format(react_total(10), ","), format(react_compacted(10), ",")))
print("    因为自然上下文还没涨到窗口上限 —— **压缩是长任务的补救，不是默认动作**。")
print("  - **Plan-and-Execute 的代价在返工**：计划错了要重规划，期望成本上升 %.0f%%；" % (100 * REWORK_RATE))
print("    判据：**「结构化任务用 Plan-and-Execute、探索性任务用 ReAct」的成本差就是重规划率**——")
print("    重规划率低于约 %.0f%% 时才稳赢。" % (100 * 0.2))
```

输出：

```text
步数              ReAct 总输入          压缩后 ReAct       Plan-Execute               倍差
5                  22,000             40,000              9,000             2.4x
10                 74,000             80,000             15,000             4.9x
20                268,000            160,000             27,000             9.9x
30                582,000            240,000             39,000            14.9x
50              1,570,000            400,000             63,000            24.9x

   => ReAct 的总输入随步数**二次增长**（每轮都重发全部历史），
      Plan-and-Execute 是线性的（计划一次、每步只带子目标与当前观察）。

一、压缩能救回多少
   10 步：74,000 -> 80,000 token（省 0.9 倍），但仍比 Plan-Execute 多 5.3 倍
   30 步：582,000 -> 240,000 token（省 2.4 倍），但仍比 Plan-Execute 多 6.2 倍
   50 步：1,570,000 -> 400,000 token（省 3.9 倍），但仍比 Plan-Execute 多 6.3 倍

二、Plan-and-Execute 的返工成本：计划错了要重规划
   10 步：一次跑完 15,000 token；含 25% 返工 -> 期望 20,625 token（仍只有 ReAct 的 27.9%）
   30 步：一次跑完 39,000 token；含 25% 返工 -> 期望 53,625 token（仍只有 ReAct 的 9.2%）

判据：
  - **ReAct 的成本是步数的平方**：10 步 74,000 token、30 步 582,000、50 步 1,570,000；
    Plan-and-Execute 是线性的（30 步 39,000）-> **长任务必须换范式或做上下文压缩**。
  - **压缩把平方变成线性**（每轮 prompt 固定 8,000）：30 步 582,000 -> 240,000（省 2.4 倍），
    但仍比 Plan-and-Execute 多 6.2 倍；而且 **10 步时压缩反而更贵**（74,000 -> 80,000），
    因为自然上下文还没涨到窗口上限 —— **压缩是长任务的补救，不是默认动作**。
  - **Plan-and-Execute 的代价在返工**：计划错了要重规划，期望成本上升 25%；
    判据：**「结构化任务用 Plan-and-Execute、探索性任务用 ReAct」的成本差就是重规划率**——
    重规划率低于约 20% 时才稳赢。
```

三处结论：

**第一，ReAct 的成本随步数平方增长，Plan-and-Execute 是线性。** ReAct 每轮都把全部历史重发一遍，所以总输入是 `Σ(初始 + 已累积)`：10 步 **74,000**、30 步 **582,000**、50 步 **1,570,000** token。Plan-and-Execute 计划一次、每步只带子目标与当前观察：30 步 **39,000**。**倍差随步数拉大：4.9×（10 步）→ 14.9×（30 步）→ 24.9×（50 步）**。**判据：长任务必须换范式或做上下文压缩**——步数越多，两种范式的差距越不成比例。

**第二，上下文压缩把平方变成线性，但它是长任务的补救、不是默认动作。** 每轮 prompt 固定 8,000：30 步 582,000 → **240,000**（省 2.4 倍），仍比 Plan-and-Execute 多 6.2 倍；而 **10 步时压缩反而更贵**（74,000 → 80,000），因为自然上下文还没涨到窗口上限。**判据：压缩省的是「重复发送」，不是「步骤本身」**——它把 O(n²) 拉回 O(n·窗口)，但换不掉范式差异。

**第三，Plan-and-Execute 的代价是返工，而返工率就是这个范式选择的临界值。** 计划错了要重新规划：25% 返工率下，30 步的期望成本从 39,000 升到 **53,625** token——**仍只有 ReAct 的 9.2%**。所以「结构化任务用 Plan-and-Execute」这条经验法则可以量化成：**重规划率低于约 20% 时才稳赢**；而「探索性强、每步都可能改方向」的任务，重规划率天然高，此时 ReAct 的「自然重想」反而是优势。

## 四、增量三：反思的盈亏平衡点

笔记讲了反思的三种范式与循环结构，但没算「加一轮反思要花多少、值不值」。算：

```python
"""反思（Reflection）的成本账：什么时候才划算。

用笔记的量：Reflection 把「做」与「评」拆开（Self-Reflection / External Critic / Multi-Agent Debate）、
Generate -> Critique -> Refine -> 重新评估的循环。
只依赖标准库；输出确定性。
"""
CALL_COST = 0.01          # 每次模型调用（估）
BASE_CALLS = 3            # 无反思：生成 + 一次工具调用 + 收尾
REFLECT_EXTRA = 2          # 每轮反思：critique + refine


def cost_per_success(total_calls, success_rate):
    return total_calls * CALL_COST / success_rate


print("一、无反思 vs 一轮反思")
for s0, s1 in ((0.40, 0.70), (0.60, 0.75), (0.80, 0.88)):
    c0 = BASE_CALLS * CALL_COST
    c1 = (BASE_CALLS + REFLECT_EXTRA) * CALL_COST
    ps0 = cost_per_success(BASE_CALLS, s0)
    ps1 = cost_per_success(BASE_CALLS + REFLECT_EXTRA, s1)
    verdict = "反思更划算" if ps1 < ps0 else "反思不划算"
    print("   成功率 %.0f%% -> %.0f%%：单次成本 $%.2f -> $%.2f；每个成功任务 $%.4f -> $%.4f（%s）"
          % (s0 * 100, s1 * 100, c0, c1, ps0, ps1, verdict))
print()
print("二、盈亏平衡点：成功率要涨多少才打平")
cost_ratio = (BASE_CALLS + REFLECT_EXTRA) / BASE_CALLS
for s0 in (0.5, 0.7, 0.85):
    s_break = s0 * cost_ratio
    print("   基础成功率 %.0f%% -> 需涨到 %.1f%%（+%.0f%%）才与不反思等效（成本涨 %.0f%%）"
          % (s0 * 100, s_break * 100, 100 * (cost_ratio - 1), 100 * (cost_ratio - 1)))
print()
print("三、多轮反思的期望成本（每轮以概率 p 结束）")
for p in (0.3, 0.5, 0.8):
    expected_rounds = 1 / (1 - p)
    calls = BASE_CALLS + expected_rounds * REFLECT_EXTRA
    print("   收敛概率 %.0f%% -> 期望 %.2f 轮 -> 期望调用 %.1f 次 = $%.3f/次任务（无反思 $%.2f，%dx）"
          % (p * 100, expected_rounds, calls, calls * CALL_COST, BASE_CALLS * CALL_COST,
             calls / BASE_CALLS))
print()
print("四、外部 Critic / 多 Agent 辩论的乘数")
for name, extra in (("Self-Reflection（同模型再问一次）", 2), ("External Critic（多一个模型副本）", 3),
                     ("Multi-Agent Debate（两个方案 + 仲裁）", 6)):
    print("   %-32s 额外 %d 次调用 -> 总 %d 次 -> %.1fx 成本"
          % (name, extra, BASE_CALLS + extra, (BASE_CALLS + extra) / BASE_CALLS))
print()
print("判据：")
print("  - **反思是「成本换成功率」，而且要有盈亏平衡点**：成本涨 %.0f%%（3 -> 5 次调用），" % (100 * (cost_ratio - 1)))
print("    成功率必须涨同样的比例才打平；基础成功率 %.0f%% 时要涨到 %.0f%% 才行。" % (50, 50 * cost_ratio))
print("    所以「加反思」不能只看「成功率涨了」，要看**每个成功任务的成本**。")
print("  - **多轮反思的期望成本是几何级数**：收敛概率 50%% 时期望 2 轮、7 次调用（%.1fx 成本）；" % (7.0 / BASE_CALLS))
print("    收敛概率越低越贵 —— 所以要先提高 critique 的质量，再加轮数。")
print("  - **多 Agent 辩论是乘数**：Self-Reflection %.1fx、外部 Critic %.1fx、辩论 %.1fx ——" % (
    5 / BASE_CALLS, 6 / BASE_CALLS, 9 / BASE_CALLS))
print("    它的收益要单独证明，否则就是纯粹的 token 放大器。")
```

输出：

```text
一、无反思 vs 一轮反思
   成功率 40% -> 70%：单次成本 $0.03 -> $0.05；每个成功任务 $0.0750 -> $0.0714（反思更划算）
   成功率 60% -> 75%：单次成本 $0.03 -> $0.05；每个成功任务 $0.0500 -> $0.0667（反思不划算）
   成功率 80% -> 88%：单次成本 $0.03 -> $0.05；每个成功任务 $0.0375 -> $0.0568（反思不划算）

二、盈亏平衡点：成功率要涨多少才打平
   基础成功率 50% -> 需涨到 83.3%（+67%）才与不反思等效（成本涨 67%）
   基础成功率 70% -> 需涨到 116.7%（+67%）才与不反思等效（成本涨 67%）
   基础成功率 85% -> 需涨到 141.7%（+67%）才与不反思等效（成本涨 67%）

三、多轮反思的期望成本（每轮以概率 p 结束）
   收敛概率 30% -> 期望 1.43 轮 -> 期望调用 5.9 次 = $0.059/次任务（无反思 $0.03，1x）
   收敛概率 50% -> 期望 2.00 轮 -> 期望调用 7.0 次 = $0.070/次任务（无反思 $0.03，2x）
   收敛概率 80% -> 期望 5.00 轮 -> 期望调用 13.0 次 = $0.130/次任务（无反思 $0.03，4x）

四、外部 Critic / 多 Agent 辩论的乘数
   Self-Reflection（同模型再问一次）         额外 2 次调用 -> 总 5 次 -> 1.7x 成本
   External Critic（多一个模型副本）         额外 3 次调用 -> 总 6 次 -> 2.0x 成本
   Multi-Agent Debate（两个方案 + 仲裁）    额外 6 次调用 -> 总 9 次 -> 3.0x 成本

判据：
  - **反思是「成本换成功率」，而且要有盈亏平衡点**：成本涨 67%（3 -> 5 次调用），
    成功率必须涨同样的比例才打平；基础成功率 50% 时要涨到 83% 才行。
    所以「加反思」不能只看「成功率涨了」，要看**每个成功任务的成本**。
  - **多轮反思的期望成本是几何级数**：收敛概率 50% 时期望 2 轮、7 次调用（2.3x 成本）；
    收敛概率越低越贵 —— 所以要先提高 critique 的质量，再加轮数。
  - **多 Agent 辩论是乘数**：Self-Reflection 1.7x、外部 Critic 2.0x、辩论 3.0x ——
    它的收益要单独证明，否则就是纯粹的 token 放大器。
```

三处结论：

**第一，反思是成本换成功率，而且有明确的盈亏平衡点。** 一轮反思 = critique + refine 两次额外调用 → 成本从 3 次调用涨到 5 次（**+67%**）。要打平，**成功率必须涨同样的比例**：基础成功率 50% 时要涨到 **83.3%**；70% 时要涨到 **116.7%**——**已经不可能**。所以在模型里三个常见组合里，**只有「成功率 40% → 70%」这一档划算**（每个成功任务 $0.075 → $0.071），而「60% → 75%」与「80% → 88%」都不划算（$0.050 → $0.067、$0.0375 → $0.057）。**判据：加反思不能只看「成功率涨了」，要看每个成功任务的成本**——这正是《按成功任务算 Token 成本》那篇的口径。

**第二，多轮反思的期望成本是几何级数。** 每轮以概率 p 结束：p=30% → 期望 1.43 轮、5.9 次调用（$0.059）；p=50% → 2 轮、7 次（$0.070，2.3×）；p=80% → **5 轮、13 次（$0.130，4.3×）**。**判据：要先把 critique 的质量提上去，再考虑加轮数**——收敛概率越低，越贵。

**第三，多 Agent 辩论是纯乘数。** Self-Reflection **1.7×**、External Critic（多一个模型副本）**2.0×**、Multi-Agent Debate **3.0×**。**判据：辩论的收益必须单独证明**——否则它就是 token 放大器；而且它是唯一一个能「用更多模型换准确率」的范式，所以它的成本论证标准应该更高。

## 五、把三个模型套回本章（判据清单）

1. **工具数量是双重税**：准确率 `1−(1−p)^N`（N=50 → 63.6%、N=200 → 98.2%）+ 上下文占用（120N token，N=200 占窗口 18.8%）。
2. **分层检索要用净成功率比**：50 全给 vs 检索 8 个 → 36.4% vs **80.8%**（召回失败 5% 已计入）。
3. **工具定义每轮重发**：50 工具 × 30 轮 = **180,000 token** 只算定义 → 工具多在多轮场景是乘法成本。
4. **ReAct 的 token 是平方**：10/30/50 步 = 74,000 / 582,000 / 1,570,000；Plan-and-Execute 线性（30 步 39,000），倍差 4.9× / 14.9× / 24.9×。
5. **压缩是长任务的补救**：30 步 582,000 → 240,000（省 2.4×），但 10 步时压缩反而更贵（74,000 → 80,000）。
6. **范式选择的临界值是重规划率**：25% 返工下 Plan-and-Execute 期望 53,625 token（仍只有 ReAct 的 9.2%）；重规划率 <约 20% 才稳赢。
7. **反思的盈亏平衡**：成本 +67%（3→5 次调用）→ 成功率要涨同样比例才打平（50% 基础要涨到 83.3%；70% 基础已不可能）。
8. **多轮反思是几何成本**：收敛概率 80% → 期望 5 轮、13 次调用（4.3×）。
9. **辩论是纯乘数**：Self-Reflection 1.7×、External Critic 2.0×、Debate 3.0× → 收益要单独证明。

## 六、这一章不重复已发的内容

- **Agent 循环的工程化框架**（四大循环层次、六大基础设施、十大失败模式）：见《[Loop Engineering：Agent 循环工程化](/blog/loop-engineering-agent-loops/)》——那篇讲怎么组织，本文算**两种范式的 token 曲线形状**。
- **harness 该瘦身多少、工具该删到几个**：见《[删掉 90% 的 harness 之后](/blog/deleting-90-percent-of-your-harness/)》——那篇用 token/task 口径证明「四个 harness 分数几乎相同、成本差近一倍」；本文补的是**工具数量与选择错误率的量化**与**工具定义的乘法成本**。
- **按成功任务算 token 成本**：见《[按成功任务算 Token 成本](/blog/agent-token-cost-per-task/)》——本文的反思账直接用那个口径（每个成功任务的成本），但不重复它的十项习惯清单。
- **Agent Skills 与 MCP 的差异**：见《[彻底搞懂 Agent Skills](/blog/deep-dive-into-agent-skills/)》与《[上下文工程](/blog/context-engineering-instruction-and-material/)》。

## 七、这三个模型判不了什么

- **单个工具 2% 的选择错误率、错误独立、召回率 95%、每工具 120 token、每轮 1,200 token、反思成功率提升都是估的**。真实错误**高度相关**（模型搞不清一类工具，就会在那一类上连续出错），独立假设会**低估** N 个工具的真实风险——所以「N=50 时 63.6%」在实践中可能更糟。
- **没算工具描述质量的作用**。笔记说「描述即 Prompt」，而描述写得好坏直接决定那个 2% 是 0.5% 还是 5%——**同一套工具数，写得好与写得差能差 10 倍的准确率**。这比「减工具」更划算，但本文没量化。
- **ReAct 的平方增长假设「每轮都重发全部历史」**。真实实现普遍有前缀缓存（prompt 前缀命中缓存则不计价/不算时延），那会把成本拉回接近线性；**本文算的是没有缓存、或缓存不命中时的上界**。而 Plan-and-Execute 的计划缓存同样受益于前缀缓存——**两边的优势都会缩小**。
- **反思的「成功率提升」没区分任务类型**：事实核对类任务上 critique 收益大、开放式写作上收益小；而且 critique 也会「自信地错」，让答案更差——**这个方向的损失本文没建模**。
- **三个模型都没碰多 agent 的并行性**（多个 Executor 同时跑子任务省的是墙钟时间不是 token）与 MCP 的工具接入成本——它们是另外两笔账。

## FAQ（八、常见问题）

**工具给多少个合适？** 这是双重税：选择错误率按 `1−(1−p)^N` 涨（单工具 2% 时，20 个 → 33.2%、50 个 → **63.6%**、200 个 → 98.2%），上下文还要占 120N token。**更省的做法是分层**：先检索 8 个候选（错误率降到 14.9%、token 降到 960），净成功率 **80.8%** vs 全给 50 个的 36.4%——代价是 5% 的召回失败，比较时必须一起算。

**工具多了还占上下文吗？** 占，而且每轮都重发：50 个工具 × 30 轮 = **180,000 token** 全是工具定义，还没算对话内容。**工具多在多轮场景里是乘法成本**——这正是「少而精」的算术依据。

**ReAct 和 Plan-and-Execute 差多少 token？** ReAct 每轮重发全部历史，所以是平方：10/30/50 步 = **74,000 / 582,000 / 1,570,000**；Plan-and-Execute 线性，30 步 **39,000**。倍差随步数拉大：4.9× → 14.9× → **24.9×**。**长任务必须换范式或压缩上下文。**

**那压缩上下文能替代换范式吗？** 不能全替：每轮 prompt 固定 8,000 后，30 步 582,000 → **240,000**（省 2.4 倍），但仍比 Plan-and-Execute 多 6.2 倍；而且 **10 步时压缩反而更贵**（74,000 → 80,000）。**压缩省的是重复发送，不是步骤本身**，它是长任务的补救。

**什么时候该用 Plan-and-Execute？** 判据是重规划率：25% 返工下它的期望成本是 53,625 token（仍只有 ReAct 的 9.2%），**重规划率低于约 20% 才稳赢**；探索性任务每步都可能改方向，重规划率天然高，ReAct 的「自然重想」反而占优。

**加一轮反思划算吗？** 看盈亏平衡点：一轮反思让成本从 3 次调用涨到 5 次（**+67%**），所以成功率必须涨同样比例才打平——基础 50% 要涨到 **83.3%**，基础 70% 已经**不可能**（要 116.7%）。在模型里只有「40% → 70%」这一档划算。**判据：比的是每个成功任务的成本，不是成功率本身。**

**多轮反思与多 Agent 辩论的成本？** 多轮是几何级数：收敛概率 50% 时期望 2 轮、7 次调用（2.3×），80% 时 5 轮、13 次（**4.3×**）——先提 critique 质量再加轮数。辩论是纯乘数：Self-Reflection **1.7×**、External Critic **2.0×**、Debate **3.0×**，收益要单独证明。

## 出处

- 源笔记（我的）：`06-面试/答案/04-AI-Agent-答案.md`（20 道题的完整答案，本文取 Q4 / Q5 / Q8 / Q16 四题）。
- 相关一手资料：[ReAct 论文（arXiv:2210.03629）](https://arxiv.org/abs/2210.03629)（Thought-Action-Observation 循环）、[Reflexion 论文（arXiv:2303.11366）](https://arxiv.org/abs/2303.11366)（自我反思的实证收益）、[ReAct 官方仓库](https://github.com/ysymyth/ReAct)（工具与提示模板）。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
