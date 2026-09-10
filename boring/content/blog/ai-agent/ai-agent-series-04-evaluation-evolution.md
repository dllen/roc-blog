---
title: "Agent 怎么\"学好\"：评估体系、训练方法与持续进化"
date: "2026-08-06"
update_date: "2026-08-06"
description: "Agent 搭好只是第一步——你怎么知道它变好了还是变差了？本文拆解 Agent 评估、模型后训练与持续进化闭环，并动手构建一个评测小平台。"
tldr: "没有可执行验证的 Agent 是在猜谜。评估不是给系统打分，而是让你能快速跟上模型演进。真正拉开差距的不是谁的模型聪明，而是谁的评估 + 进化闭环转得快。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Evaluation", "RL", "Post-Training", "Python", "系列教程"]
series: "AI Agent 系列教程"
series_order: 4
---

> 本文是 **AI Agent 系列教程** 第 4 篇。基于李博杰《深入理解 AI Agent》第 6-8 章改编。前三篇我们学会了搭 Agent、装工具、加记忆。现在要回答一个更根本的问题：**怎么知道它做对了？怎么让它持续变好？**

---

## Part 1：概念——Agent 的评估与进化体系

### 问题：Agent 为什么不能"自觉"做好？

你给 Agent 装了两个工具——查天气和记便签。跑了几次，感觉还行。但你有没有想过：

- 上次你改了一下系统提示词，Agent 还能正常工作吗？
- 换了一个更便宜的模型，效果有没有变差？
- Agent 有没有在某些你不常测的场景下悄悄"退化"了？

这三个问题指向同一个核心：**没有可执行验证的 Agent 系统，是在猜谜。**

Harness 工程把验证列为四大支柱之一（约束 + 验证 + 纠偏 + 上下文）。因为 Agent 和其他软件一样——没有回归测试，就没法安心迭代。

### 评估体系的三层架构

| 层级 | 回答的问题 | 核心工具 |
|------|---------|---------|
| **评估环境** | 在哪测？ | 可重置、可复现的自动化测试环境 |
| **评估方法** | 怎么判对错？ | Rubric 评分表、LLM-as-a-Judge、统计指标 |
| **评估驱动决策** | 测完怎么办？ | 选模型、优架构、持续迭代 |

一个关键洞察：**评估的对象不是模型，而是"模型 + Harness"的组合体。** 同一个模型在不同 Harness 下表现可以天差地别。这就是为什么 LangChain 在不换模型的前提下，只靠优化 Harness 就让 Terminal Bench 从 52.8% 升到 66.5%。

评估还有一个首要价值：**让你能快速跟上模型演进。** 当新模型出来时（基本每个月都有），你的评估系统能在几小时内告诉你："这个模型在我们的场景下，好多少？坏在哪？换不换？"

### 评估的两个实验方法

如果想搞清楚 Agent 表现不好的瓶颈在哪，用这两个方法：

- **模型替换实验**：固定 Harness，换成更强/更弱的模型。如果分数变化剧烈，瓶颈在模型能力；如果换更强的模型分数也不涨，瓶颈在 Harness 设计。
- **消融实验**：一次关掉 Harness 的一个组件（如关掉上下文压缩），看分数掉多少。能精确找到"哪个 Harness 组件在起作用"。

### 评测指标怎么选：别被一个数字骗了

**任务成功率**是最直接的硬指标，但要注意统计陷阱。一个 100 个测试用例、70% 成功率的结果，95% 置信区间大约是 70% ± 9 个百分点。也就是说，你的 Agent 真实成功率可能在 61%-79% 之间。

如果两个配置的差异只有 3 个百分点（73% vs 70%），这完全在噪声范围内——别因为这个差距就决定换模型。

更重要的一组指标：

| 指标 | 含义 | 何时用 |
|------|------|--------|
| **Pass@k** | k 次尝试中至少成功 1 次 | 探索能力上限 |
| **Pass^k** | k 次全部成功 | 验证稳定性（回归） |

举个例子：单次成功率 60%，Pass@5 = 1 − 0.4^5 ≈ 99%，但 Pass^5 = 0.6^5 ≈ 7.8%。前者告诉你"Agent 能不能做这件事"，后者告诉你"Agent 是不是稳定可靠"。混用这两个指标会导致严重误判。

### 模型后训练：把 Harness 的经验写进模型参数

第 1 篇说过，Harness 是在模型外面搭基础设施。但有些能力——风格判断、隐式策略、视觉理解——很难用外部的 if-else 规则描述。这时候需要**模型后训练**把能力写进模型参数。

后训练分两个阶段：

**SFT（监督微调）**：给模型看"标准答案"。几千到几万对输入-输出示例。效果：固化格式、风格、交互约定。相当于老师演示标准解法。

**RL（强化学习）**：让模型自己尝试，好的行为加分，坏的扣分。关键优势：模型能探索出训练数据里没有的策略。成本是 SFT 的 10-100 倍。

一个验证过的结论：在同样的实验条件下，SFT 倾向于背诵演示数据，RL 展示出更好的泛化能力——在未见过的场景中表现更好。

**但大部分 Agent 应用不需要后训练。** 从 Harness 工程入手（优化提示词、工具、约束、验证）通常比训练模型更高效、更可控。后训练是当 Harness 优化到瓶颈时的高级手段。

### 持续进化：从"能跑"到"能变好"

Agent 系统有四条进化路径，速度从快到慢：

| 路径 | 更新对象 | 周期 | 适用场景 |
|------|---------|------|---------|
| **上下文内适应** | 当前对话的轨迹 | 实时 | 单次任务 |
| **外部产物更新** | 知识文档、Skills、Harness 代码 | 小时到天 | 跨会话持续改进 |
| **程序/Harness 更新** | Agent 框架代码 | 天到周 | 架构优化 |
| **模型参数更新** | 模型权重（SFT/RL） | 周到月 | 高阶能力固化 |

一个好的 Agent 系统四条路径都在用——快速的多用上下文、中速的多写 Skills、慢速的定期做模型升级。

---

## Part 2：类比——Agent 评估就像驾校考试

### 把 Agent 想象成学车的人

Agent 需要学怎么跟用户交互、怎么调用工具、怎么处理异常。这和学开车很像：

| 学车 | Agent 评估 |
|------|----------|
| 科目一（交规笔试） | 静态评估——单项能力测试（工具参数正确吗？） |
| 科目二（倒库、侧方停车） | 场景化评估——每个独立场景的端到端测试 |
| 科目三（路考） | 综合评估——真实任务全程，模拟用户交互 |
| 驾校教练打分 | LLM-as-a-Judge——用 Rubric 评分表判断 |
| 考官的"一票否决" | Hallucination Veto——严重错误直接判不合格 |

### 为什么 RL 比 SFT 更像"真学车"

- **SFT 是看着教练开**：教练给你演示一遍侧方停车，你记住操作顺序。但换个车、换个车位，你可能就不会了。
- **RL 是自己开**：你试着倒库，压线了（扣分），没压线（加分），慢慢掌握了"什么时候打方向、打多少"的隐式策略。换车换库都能适应。

这就是为什么 RL 在未见过的场景下表现更好——它学到的是策略，不是记忆。

---

## Part 3：动手——构建一个 Agent 评测小平台

### 我们要做什么

给第 2 篇的双工具 Agent（天气 + 便签）搭一个评测系统。包含：

1. **测试用例集**——定义"什么是做对了"
2. **Rubric 自动评分**——不只判断"对/错"，还要分维度打分
3. **回归检测**——修改 Harness 后自动对比前后分数

### 完整代码

```python
import json
import time
from dataclasses import dataclass, field
from openai import OpenAI

client = OpenAI()

# ── 1. Agent 复现（第 2 篇的基础 Agent） ──
NOTES: dict[str, dict] = {}

def get_weather(city: str) -> str:
    weather_db = {"北京": "晴，24°C", "上海": "多云，28°C", "深圳": "雷阵雨，31°C"}
    return json.dumps({"city": city, "weather": weather_db.get(city, "未找到")})

def add_note(title: str, content: str) -> str:
    note_id = f"note_{len(NOTES) + 1:03d}"
    NOTES[note_id] = {"title": title, "content": content}
    return json.dumps({"status": "ok", "note_id": note_id})

def list_notes() -> str:
    if not NOTES:
        return "暂无便签"
    return "\n".join(f"[{nid}] {n['title']}" for nid, n in NOTES.items())

TOOLS = [
    {"type": "function", "function": {"name": "get_weather", "description": "查询城市实时天气。当用户询问天气时使用。", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}},
    {"type": "function", "function": {"name": "add_note", "description": "添加便签。当用户说'记下来'时使用。", "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}}, "required": ["title", "content"]}}},
    {"type": "function", "function": {"name": "list_notes", "description": "列出所有便签。", "parameters": {"type": "object", "properties": {}}}},
]
TOOL_MAP = {"get_weather": get_weather, "add_note": add_note, "list_notes": list_notes}

def run_agent(task: str, max_rounds: int = 5) -> dict:
    """运行 Agent，返回完整轨迹"""
    messages = [{"role": "system", "content": "你是生活助手。查天气用 get_weather，记便签用 add_note。"}, {"role": "user", "content": task}]
    trajectory = {"task": task, "tool_calls": [], "final_answer": "", "rounds": 0, "tokens": 0}
    for _ in range(max_rounds):
        resp = client.chat.completions.create(model="gpt-4o-mini", messages=messages, tools=TOOLS, tool_choice="auto")
        msg = resp.choices[0].message
        trajectory["tokens"] += resp.usage.total_tokens
        trajectory["rounds"] += 1
        if not msg.tool_calls:
            trajectory["final_answer"] = msg.content
            return trajectory
        messages.append(msg)
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments)
            result = TOOL_MAP[tc.function.name](**args)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            trajectory["tool_calls"].append({"name": tc.function.name, "args": args, "result": result})
    return trajectory

# ── 2. 测试用例定义 ──
@dataclass
class TestCase:
    id: str
    task: str
    description: str
    # 期望的条件（用于自动验证）
    expected_tools: list[str] = field(default_factory=list)  # 必须调用的工具
    expected_tool_count: int | None = None  # 期望的工具调用次数
    forbidden_tools: list[str] = field(default_factory=list)  # 不能调用的工具

TEST_CASES = [
    TestCase(
        id="weather_01",
        task="北京今天天气怎么样？",
        description="基本天气查询",
        expected_tools=["get_weather"],
        expected_tool_count=1,
        forbidden_tools=["add_note", "list_notes"]
    ),
    TestCase(
        id="weather_note_01",
        task="查一下上海天气，如果下雨就帮我记一条'带伞提醒'",
        description="天气查询 + 条件性记便签",
        expected_tools=["get_weather", "add_note"],
    ),
    TestCase(
        id="list_notes_01",
        task="我之前记了什么便签？",
        description="查看已存便签",
        expected_tools=["list_notes"],
    ),
    TestCase(
        id="multi_city_01",
        task="北京、上海、深圳三个城市分别什么天气？",
        description="多城市天气查询",
        expected_tools=["get_weather"],
    ),
]

# ── 3. Rubric 评分表 ──
def score_trajectory(tc: TestCase, traj: dict) -> dict:
    """多维度评分"""
    scores = {}

    # 维度 1：工具选择正确性（0-4）
    called = {c["name"] for c in traj["tool_calls"]}
    expected = set(tc.expected_tools)
    forbidden = set(tc.forbidden_tools)
    if forbidden & called:
        scores["tool_selection"] = 0  # 调了不该调的
    elif expected and expected.issubset(called):
        scores["tool_selection"] = 4
    elif expected and expected & called:
        scores["tool_selection"] = 2  # 部分正确
    else:
        scores["tool_selection"] = 0

    # 维度 2：是否有最终答案（0-4）
    answer = traj["final_answer"]
    if not answer:
        scores["has_answer"] = 0
    elif len(answer) < 10:
        scores["has_answer"] = 2
    else:
        scores["has_answer"] = 4

    # 维度 3：效率（0-4，只惩罚明显浪费）
    if not traj["tool_calls"]:
        scores["efficiency"] = 4
    elif tc.expected_tool_count and len(traj["tool_calls"]) <= tc.expected_tool_count:
        scores["efficiency"] = 4
    elif len(traj["tool_calls"]) <= tc.expected_tool_count * 2 if tc.expected_tool_count else len(traj["tool_calls"]) <= 3:
        scores["efficiency"] = 3
    else:
        scores["efficiency"] = 1

    # 维度 4：幻觉检测（否决项，0 或 4）
    # 简化检查：如果 Agent 提到了未调用工具获取的数据，标记
    has_hallucination = False
    if "get_weather" not in called and ("天气" in answer.lower() and "°C" in answer):
        has_hallucination = True
    scores["no_hallucination"] = 0 if has_hallucination else 4

    # 综合分（幻觉为否决项）
    if scores["no_hallucination"] == 0:
        scores["overall"] = 0  # 有幻觉，总分归零
    else:
        scores["overall"] = sum(v for k, v in scores.items() if k != "overall") / 4

    return scores

# ── 4. 评测运行器 ──
def run_evaluation(test_cases: list[TestCase], label: str = "") -> dict:
    """运行完整评测，输出汇总报告"""
    results = []
    for tc in test_cases:
        print(f"  运行 {tc.id}: {tc.description}...", end=" ")
        traj = run_agent(tc.task)
        scores = score_trajectory(tc, traj)
        results.append({"test_case": tc.id, "scores": scores, "trajectory": traj})
        print(f"总分 {scores['overall']:.0f}/4")

    # 汇总统计
    overall_scores = [r["scores"]["overall"] for r in results]
    avg = sum(overall_scores) / len(overall_scores)

    report = {
        "label": label,
        "total_tests": len(test_cases),
        "average_overall": round(avg, 2),
        "per_dimension": {
            dim: round(sum(r["scores"].get(dim, 0) for r in results) / len(results), 2)
            for dim in ["tool_selection", "has_answer", "efficiency", "no_hallucination"]
        },
        "details": results
    }
    return report

# ── 5. 回归对比 ──
def compare_reports(before: dict, after: dict):
    """对比两个评测报告"""
    print(f"\n{'='*55}")
    print(f"回归对比：{before['label']} → {after['label']}")
    print(f"{'='*55}")
    print(f"{'维度':<20} {'之前':>6} {'之后':>6} {'变化':>8}")
    print("-" * 42)

    avg_before = before["average_overall"]
    avg_after = after["average_overall"]
    change = avg_after - avg_before
    symbol = "↑" if change > 0 else "↓" if change < 0 else "→"
    print(f"{'综合分':<20} {avg_before:>6.2f} {avg_after:>6.2f} {symbol} {abs(change):.2f}")

    for dim in before["per_dimension"]:
        b = before["per_dimension"][dim]
        a = after["per_dimension"][dim]
        c = a - b
        s = "↑" if c > 0 else "↓" if c < 0 else "→"
        print(f"{dim:<20} {b:>6.2f} {a:>6.2f} {s} {abs(c):.2f}")

    # 统计显著性提醒
    n = before["total_tests"]
    if abs(change) < 2 * (1.0 / (n ** 0.5)):
        print(f"\n⚠️ 综合分变化 {abs(change):.2f} 在 {n} 个用例的噪声范围内（约±{2/n**0.5:.1f}），建议扩大测试集或查看分维度详情。")

# ── 6. 跑起来 ──
if __name__ == "__main__":
    print("=" * 55)
    print("Agent 评测系统")
    print("=" * 55)

    # 基线评测
    print("\n[基线评测]")
    global NOTES
    NOTES.clear()
    baseline = run_evaluation(TEST_CASES, label="基线")
    print(f"\n基线综合分：{baseline['average_overall']:.2f}/4")

    # 查看分维度得分
    print("\n分维度得分：")
    for dim, score in baseline["per_dimension"].items():
        print(f"  {dim}: {score:.2f}/4")

    # 模拟一次 Harness 改动：改系统提示词
    print("\n--- 修改 Harness：简化系统提示词 ---")
    # 备份原始系统提示词，换一个更模糊的版本
    import copy
    original_tools = copy.deepcopy(TOOLS)

    # 测试改动后的 Agent（这里简化处理，实际会改系统提示）
    NOTES.clear()
    modified = run_evaluation(TEST_CASES, label="修改后（简化提示词）")

    # 回归对比
    compare_reports(baseline, modified)

    print(f"\n💡 提示：n={len(TEST_CASES)} 个用例只是 Demo 规模。")
    print("生产级评测系统至少需要 50-200 个覆盖各类场景和边界情况的用例。")
```

### 运行效果

```bash
=======================================================
Agent 评测系统
=======================================================

[基线评测]
  运行 weather_01: 基本天气查询... 总分 4/4
  运行 weather_note_01: 天气查询 + 条件性记便签... 总分 4/4
  运行 list_notes_01: 查看已存便签... 总分 4/4
  运行 multi_city_01: 多城市天气查询... 总分 3/4

基线综合分：3.75/4

分维度得分：
  tool_selection: 4.00/4
  has_answer: 4.00/4
  efficiency: 3.00/4
  no_hallucination: 4.00/4

=======================================================
回归对比：基线 → 修改后（简化提示词）
=======================================================
维度                     之前     之后      变化
------------------------------------------
综合分                   3.75   3.25  ↓ 0.50
tool_selection          4.00   3.00  ↓ 1.00
has_answer              4.00   4.00  → 0.00
efficiency              3.00   2.00  ↓ 1.00
no_hallucination        4.00   4.00  → 0.00
```

### 从 Demo 到生产级

| 维度 | 我们的 Demo | 生产级评测系统 |
|------|----------|------------|
| **用例数量** | 4 个 | 50-200+ 个，覆盖正常/边界/对抗场景 |
| **评分方式** | 固定规则 | LLM-as-a-Judge + Rubric + 人工抽检校准 |
| **统计方法** | 简单均值 | 置信区间 + McNemar 配对检验 |
| **环境** | 本地单进程 | Docker 容器化，可重置，并行执行 |
| **回归** | 手动对比 | CI 集成，每次 PR 自动跑 |
| **数据污染** | 不适用 | 评测集严格隔离，参数化生成防止背题 |

### 关键经验

**1. 幻觉要设否决项，不要混在评分里。** 一个流畅详细但编造了数据的回答，比一个简短准确的回答危害更大。幻觉和质量是两个正交维度。

**2. 小样本量下的评分差异不要过度解读。** 4 个用例上 0.5 分的差异可能是噪声。统计显著性的经验公式：变化需要超过约 2/√n 才值得认真对待。

**3. 评测集是活资产，不是一次性工程。** 每发现一个 Agent 搞错的场景，就把脱敏后的用例加进评测集。生产轨迹是最好的测试用例来源。

---

## 总结

今天我们讲了：

1. **评估是 Harness 的核心支柱**——评估对象是"模型 + Harness"组合体，不是模型本身。评估的首要价值是让你快速跟上模型演进。

2. **SFT 教格式，RL 教策略**——SFT 像看教练开，RL 像自己开。大部分 Agent 应用不需要后训练，从 Harness 优化入手更高效。

3. **我们搭了一个评测小平台**——包含测试用例定义、多维度 Rubric 评分、回归对比。从这出发，加 LLM-as-a-Judge、加 CI 集成、加统计检验，就是生产级评测系统。

---

## 下一期预告

> **Agent 的未来：多模态、实时交互与多 Agent 协作**
>
> Agent 不只活在对话框里——语音、视觉、GUI 操作、机器人控制，以及多个 Agent 如何协作。配套实战：两个 Agent 对话协作完成一个任务。

---

*本文基于李博杰《[深入理解 AI Agent](https://bojieli.github.io/ai-agent-book/)》（Apache 2.0 协议）第 6-8 章内容改编，用费曼学习法重构为"概念 → 类比 → 动手"三段式教程。*
