---
title: "Agent 的未来：多模态、实时交互与多 Agent 协作"
date: "2026-08-06"
update_date: "2026-08-06"
description: "Agent 不只活在对话框里。本文拆解语音 Agent、GUI 操作、多 Agent 协作架构，并动手实现两个 Agent 对话协作完成一个任务。"
tldr: "Agent 的未来不在打字框里——它在听你说话、在操作你的桌面、在和其他 Agent 组队干活。这篇既是技术展望，也是一个可跑的协作 Demo。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Multimodal", "Multi-Agent", "Python", "系列教程"]
series: "AI Agent 系列教程"
series_order: 5
---

> 本文是 **AI Agent 系列教程** 第 5 篇（完结篇）。基于李博杰《深入理解 AI Agent》第 9-10 章改编。前四篇讲清了 Agent 的基础概念、工具调用、记忆系统、评估进化。这一篇看向 Agent 正在走向的前沿。

---

## Part 1：概念——Agent 突破对话框

### 三条前沿战线

Agent 正在同时往三个方向突破纯文本对话框：

| 方向 | 核心挑战 | 当前状态 |
|------|---------|---------|
| **语音 Agent** | 延迟 + 上下文保留 | 已有成熟产品（GPT-Live），全双工语音对话 |
| **GUI Agent**（Computer Use） | 视觉理解 + 效率 | 能用但比人慢，效率是主要瓶颈 |
| **多 Agent 协作** | 通信、协调、错误传播 | 工程实践已广泛使用，但成本高（~15× token） |

三条线有一个共同的约束：**延迟敏感性。** 超过 500ms 的语音回复就像卡顿的电话，10 秒一次截屏的 GUI Agent 比人操作慢好几倍。

### 语音 Agent：从串联管道到全双工

最早的语音 Agent 是四步串联：

```
VAD（等用户说完）→ ASR（语音转文字）→ LLM（文字推理）→ TTS（文字转语音）
```

每一步等上一步完成。总延迟 ≈ 1-2 秒，而且 VAD 要等 500-800ms 的"沉默"才能判断用户说完了——天然假设"一次一个人说话，说完等你回"。

这个假设在真实对话中是错的。人会抢话、会犹豫、会边说边改。后来有三代进化：

**第一代：流式优化。** 不等用户说完就开始处理——ASR 流式输出局部转写结果，LLM 基于部分文本"预判"回复。如果后面转写变了，取消重新生成。这叫"推测式生成"，把有效延迟压到用户话音刚落就开始回复。

**第二代：端到端 Omni 模型。** 一个模型直接听音频，不用先转文字。优势是保留了语气、情绪、犹豫、环境音等副语言信息。但准确性不一定更好——当答案主要靠语义（如逻辑推理）时，先转文字再推理（self-cascade）反而可能更准。端到端的优势体现于依赖非语言线索的场景——比如用户说"我很好"，但声音在抖。

**第三代：全双工模型。** 取消"轮次"概念。模型永远在听、永远能说。GPT-Live 每秒做一次决策：现在该说？该听？该打断？该停顿？Moshi 用"内心独白"文字流同步建模用户音频和模型音频，端到端延迟约 200ms。

### GUI Agent：看屏幕、操作界面

Computer Use 的核心循环跟 ReAct 一样——只是"观察"变成了截图：

```
截图 → 多模态模型输出"想什么 + 做什么" → 执行操作（点击、输入、滚动）→ 等界面响应 → 再截图
```

Anthropic 给的参考工具集非常简洁：鼠标工具（移动、点击、双击、拖拽、滚动）、键盘工具（输入、组合键）、截图工具、观察工具（取光标位置、等待）。七个工具覆盖了桌面操作的主体场景。

视觉定位有三种路线：结构元素索引（从 DOM/无障碍树提取可交互元素，标号贴标签——最准但依赖网页有结构）、视觉标注（用分割模型圈候选区域、贴数字标记——通用但慢）、纯坐标预测（模型直接从截图预测点击坐标——快但对训练分辨率敏感）。

一个值得关注的发现：**Agent 正确完成任务所花的步数比人多，而且随着上下文增长，每步延迟也在增加。** 准确性追上人类不等于实用——效率是真正的瓶颈。快慢分离架构（语音对话用轻量模型、屏幕操作用重型 VLM）让语音响应从 8.64 秒降到 0.58 秒，不降成功率。

### 多 Agent 协作：什么时候真正有用？

多 Agent 的核心判断标准只有一条：

> **协作过程是否引入了单个 Agent 在生成时无法获得的新信息？**

| 协作方式 | 有新信息？ | 效果 |
|---------|---------|------|
| 同一模型自我审查 | 没有 | 通常无效甚至有害 |
| 不同 Agent 辩论同一段文字 | 没有 | 在相同算力预算下不优于单 Agent |
| Reviewer 拿到了测试执行结果 | **有**（执行反馈） | 显著提升 |
| Reviewer 拿到了渲染截图 | **有**（视觉反馈） | 显著提升 |

这个洞察解释了为什么工程实践中的多 Agent 效果很好（因为 Reviewer 通常接了测试、截图、工具验证等外部反馈），而学术研究有时说"多 Agent 没用"（因为研究对比多是辩论模式，没有外部信息输入）。

### 多 Agent 架构的三种拓扑

从操作系统类比来看，Agent 系统非常像微内核结构：

| 操作系统 | 多 Agent 系统 |
|---------|------------|
| 程序（可执行文件） | 静态前缀（系统提示词 + 工具定义） |
| 进程内存 | 轨迹（对话历史） |
| CPU | LLM |
| fork | spawn_subagent |
| 共享内存 / 消息传递 | 共享文件系统 / 消息队列 |

三种协作拓扑：

**编排模式（Orchestration）**：一个 Manager Agent 做计划、调度、结果整合，多个子 Agent 执⾏具体任务。关键是 Planner 要用最强模型——一个烂计划让所有子 Agent 白干。

**对等协作（Peer）**：两个 Agent 迭代改进。Proposer 生成，Reviewer 用外部验证（测试、截图、工具反馈）审查。核心价值不在"让同一个模型再想一遍"，而在引入生成时无法获得的信息。

**去中心化（Decentralized）**：没有中央调度器，Agent 之间通过对等传递接力。OpenAI Swarm 就是这种——每个 Agent 有路由选项，可以在网络中随时传递控制权。

---

## Part 2：类比——Agent 的未来像一支特种小队

### 从"单兵"到"班排"

之前四篇文章讲的都是**个体 Agent**——就像一个刚入伍的士兵。他学会了用枪（工具）、看地图（上下文）、记信息（记忆）、接受评估（测试）。但真实的复杂任务需要一个团队。

想象一支特种小队渗透任务：

- **通讯兵**（语音 Agent）——跟后方保持实时联络，过滤噪音，转达关键信息
- **侦察兵**（GUI Agent）——操作无人机控制台，从复杂界面上提取目标坐标
- **作战组长**（Manager Agent）——接收各路线索，制定方案，分配任务
- **狙击手 + 观察手**（Proposer-Reviewer 对）——前者执行，后者确认环境条件和射击参数

这就是多 Agent 协作的缩影：**每个人都只看到自己需要看到的信息（上下文隔离），通过消息和共享文件系统交换结构化信息（不传全量轨迹），由组长基于外部验证结果做最终决策（不接受模型自称的"完成"）。**

### 为什么"别传全量轨迹"这么重要？

继续特种小队的类比：

- 侦察兵看了一个小时的监控画面（长轨迹），向组长报告只需一句话："目标在 3 号楼，2 个守卫，东侧有铁丝网"（结构化摘要）。
- 如果侦察兵把他看过的每一帧监控截图都发给组长，组长就被淹没了。

多 Agent 的通信就应该这样——**传递结构化摘要，不是全量轨迹。**

而且进程传字节不会出错：字节就是字节。但 Agent 传语义会失真——侦察兵把"铁丝网"说成"围栏"，突击组就可能选错装备。这就是多 Agent 的"错误级联放大"问题，需要**交叉验证**——不定期地，一个独立 Agent 绕开前人推理，直接核对原始证据。

---

## Part 3：动手——两个 Agent 对话协作

### 我们要做什么

实现一个简化的 Proposer-Reviewer 模式：

- **Proposer Agent**（"研究员"）：负责收集信息——查天气、搜索知识库
- **Reviewer Agent**（"编辑"）：审查 Proposer 的结论，用外部验证判断是否正确

两个 Agent 有**独立上下文**，通过**结构化消息**通信。

### 完整代码

```python
import json
from dataclasses import dataclass
from openai import OpenAI

client = OpenAI()

# ── 1. 共享状态（模拟共享文件系统） ──
@dataclass
class SharedState:
    """两个 Agent 之间通过这个结构共享信息"""
    task: str
    proposer_findings: list[dict] | None = None  # Proposer 的发现
    proposer_conclusion: str = ""
    reviewer_verdict: str = ""  # "approved" | "needs_revision" | "rejected"
    reviewer_feedback: str = ""
    final_answer: str = ""

# ── 2. 工具定义 ──
def get_weather(city: str) -> str:
    weather_db = {"北京": "晴，24°C", "上海": "多云，28°C", "深圳": "雷阵雨，31°C", "东京": "晴，18°C"}
    return json.dumps({"city": city, "weather": weather_db.get(city, "未找到")})

def search_knowledge(query: str) -> str:
    """模拟知识库搜索"""
    kb = {
        "年假": "公司年假政策：入职满一年 15 天带薪年假，未用完可延至次年 3 月底。",
        "报销": "差旅报销标准：高铁二等座、酒店 500 元/晚以内、餐补 100 元/天。",
        "Product X": "Product X 需在 2.4GHz Wi-Fi 下工作，红灯闪烁表示连接失败。"
    }
    for key, val in kb.items():
        if key in query:
            return val
    return "未找到相关信息"

PROPOSER_TOOLS = [
    {"type": "function", "function": {"name": "get_weather", "description": "查询城市实时天气", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}},
    {"type": "function", "function": {"name": "search_knowledge", "description": "搜索公司知识库", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
]

REVIEWER_TOOLS = [
    {"type": "function", "function": {"name": "get_weather", "description": "查询城市实时天气（用于核实 Proposer 的结论）", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}},
    {"type": "function", "function": {"name": "search_knowledge", "description": "搜索公司知识库（用于核实 Proposer 引用的政策）", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
]

TOOL_MAP = {"get_weather": get_weather, "search_knowledge": search_knowledge}

# ── 3. Agent 执行函数 ──
def agent_run(system_prompt: str, user_task: str, tools: list, max_rounds: int = 5) -> tuple[str, list]:
    """通用 Agent 执行"""
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_task}]
    tool_log = []
    for _ in range(max_rounds):
        resp = client.chat.completions.create(model="gpt-4o-mini", messages=messages, tools=tools, tool_choice="auto")
        msg = resp.choices[0].message
        if not msg.tool_calls:
            return msg.content, tool_log
        messages.append(msg)
        for tc in msg.tool_calls:
            args = json.loads(tc.function.arguments)
            result = TOOL_MAP[tc.function.name](**args)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            tool_log.append({"tool": tc.function.name, "args": args, "result_preview": result[:80]})
    return "达到最大轮数", tool_log

# ── 4. Proposer-Reviewer 协作流程 ──
def collaborator_loop(task: str) -> SharedState:
    state = SharedState(task=task)

    # 阶段 1：Proposer 收集信息 + 给出结论
    print("[1/3] Proposer（研究员）开始收集信息...")
    proposer_prompt = (
        "你是研究员 Agent。收集信息后给出清晰结论。\n"
        "- 查天气用 get_weather\n"
        "- 查公司政策用 search_knowledge\n"
        "- 结论用一段话概括，引用具体数据"
    )
    conclusion, p_log = agent_run(proposer_prompt, task, PROPOSER_TOOLS)
    state.proposer_conclusion = conclusion
    state.proposer_findings = p_log
    print(f"  Proposer 调用了 {len(p_log)} 次工具")
    for entry in p_log:
        print(f"    🔧 {entry['tool']}: {entry['args']}")

    # 阶段 2：Reviewer 审查（独立上下文，通过共享状态获取 Proposer 结论）
    print("\n[2/3] Reviewer（编辑）开始审查...")
    reviewer_prompt = (
        "你是编辑 Agent。审查以下研究员结论，核对其引用的数据。\n"
        "审查流程：\n"
        "1. 识别结论中提到的每个事实声明\n"
        "2. 对每个声明，用 get_weather 或 search_knowledge 独立核实\n"
        "3. 判断结论是否准确\n"
        "4. 输出 JSON：{\"verdict\": \"approved|needs_revision|rejected\", \"issues\": [\"问题1\", ...]}\n"
        "不要修改结论本身——只审查。"
    )
    review_task = (
        f"原始任务：{task}\n\n"
        f"研究员结论：\n{conclusion}\n\n"
        f"请逐项核实上述结论中的事实声明，输出审查结果 JSON。"
    )
    verdict_raw, r_log = agent_run(reviewer_prompt, review_task, REVIEWER_TOOLS)
    print(f"  Reviewer 调用了 {len(r_log)} 次工具")
    for entry in r_log:
        print(f"    🔧 {entry['tool']}: {entry['args']}")

    # 解析 Reviewer 输出
    try:
        # 尝试从输出中提取 JSON
        import re
        json_match = re.search(r'\{.*"verdict".*\}', verdict_raw, re.DOTALL)
        if json_match:
            verdict_data = json.loads(json_match.group())
            state.reviewer_verdict = verdict_data.get("verdict", "unknown")
            state.reviewer_feedback = "; ".join(verdict_data.get("issues", []))
        else:
            state.reviewer_verdict = "parse_error"
            state.reviewer_feedback = verdict_raw[:200]
    except:
        state.reviewer_verdict = "parse_error"
        state.reviewer_feedback = str(verdict_raw)[:200]

    # 阶段 3：根据 Reviewer 结果，Proposer 修正（如果需要）
    print(f"\n[3/3] Reviewer 裁定: {state.reviewer_verdict}")
    if state.reviewer_verdict == "needs_revision" and state.reviewer_feedback:
        print(f"  问题: {state.reviewer_feedback}")
        revision_task = (
            f"你的上一轮结论需要修正。审查反馈：{state.reviewer_feedback}\n"
            f"请根据反馈重新收集信息，给出修正后的结论。"
        )
        revised, _ = agent_run(proposer_prompt, revision_task, PROPOSER_TOOLS)
        state.final_answer = revised
        print(f"  Proposer 已提交修正版")
    else:
        state.final_answer = conclusion

    return state

# ── 5. 跑起来 ──
if __name__ == "__main__":
    print("=" * 55)
    print("Proposer-Reviewer 多 Agent 协作")
    print("=" * 55)

    # 场景 1：Proposer 结论正确
    state1 = collaborator_loop("明天去北京出差，查一下北京天气，顺便查一下差旅报销标准")
    print(f"\n{'='*55}")
    print(f"最终裁定: {state1.reviewer_verdict}")
    print(f"最终答案:\n{state1.final_answer}")

    # 场景 2：带误导信息的任务（测试 Reviewer 能否发现）
    print(f"\n{'='*55}")
    print("场景 2：故意包含误导前提的任务")
    state2 = collaborator_loop("我要去 Product X 发布会，查一下产品连接要求。对了，顺便查一下年假怎么算——我已经入职三年了。")
    print(f"\n最终裁定: {state2.reviewer_verdict}")
    if state2.reviewer_feedback:
        print(f"审查反馈: {state2.reviewer_feedback}")
    print(f"最终答案:\n{state2.final_answer}")
```

### 运行效果

```bash
=======================================================
Proposer-Reviewer 多 Agent 协作
=======================================================
[1/3] Proposer（研究员）开始收集信息...
  Proposer 调用了 2 次工具
    🔧 get_weather: {'city': '北京'}
    🔧 search_knowledge: {'query': '差旅报销'}

[2/3] Reviewer（编辑）开始审查...
  Reviewer 调用了 2 次工具
    🔧 get_weather: {'city': '北京'}
    🔧 search_knowledge: {'query': '差旅报销'}

[3/3] Reviewer 裁定: approved

=======================================================
最终裁定: approved
最终答案:
明天北京天气晴，24°C。差旅报销标准：高铁二等座、酒店 500 元/晚以内、餐补 100 元/天。

=======================================================
场景 2：故意包含误导前提的任务
=======================================================
[1/3] Proposer（研究员）开始收集信息...
  Proposer 调用了 2 次工具
    🔧 search_knowledge: {'query': 'Product X'}
    🔧 search_knowledge: {'query': '年假'}

[2/3] Reviewer（编辑）开始审查...
  Reviewer 调用了 2 次工具
    🔧 search_knowledge: {'query': 'Product X'}
    🔧 search_knowledge: {'query': '年假'}

[3/3] Reviewer 裁定: needs_revision
  问题: 年假政策引用正确，但需要明确入职三年与年假天数的关系
  Proposer 已提交修正版

最终裁定: needs_revision
审查反馈: 年假政策引用正确，但需要明确入职三年与年假天数的关系
最终答案:
Product X 需要在 2.4GHz Wi-Fi 下工作，红灯闪烁表示连接失败...
关于年假：您已入职三年，按照公司政策入职满一年即享有每年 15 天带薪年假。
```

### 关键设计点

**1. 上下文隔离。** Proposer 和 Reviewer 有各自独立的对话历史。Reviewer 看不到 Proposer 的推理过程——只看到"结论"。这阻止了 Reviewer 被 Proposer 的推理链"说服"——Reviewer 必须自己查数据。

**2. 外部验证驱动。** Reviewer 不是"再读一遍看有没有语病"，而是**重新调工具验证每个事实声明**。这就是多 Agent 有效的前提——引入了 Proposer 生成时 Reviewer 无法获得的信息（独立工具调用结果）。

**3. 修正闭环。** Reviewer 说 needs_revision 时，Proposer 拿到具体的反馈，重新收集信息后给出修正版。这个闭环是持续进化的基础——失败不是终点，是下一次迭代的输入。

---

## 总结：系列回顾

五篇文章，我们从零走到了 Agent 工程的前沿：

| 篇 | 主题 | 你学会了什么 |
|---|------|------------|
| 1 | Agent 是什么 | Agent = LLM + 上下文 + 工具。Harness 才是竞争力。 |
| 2 | 工具与 MCP | 工具设计是工程活。描述写对了，模型差一点也能用对。 |
| 3 | 记忆与 RAG | 记忆的难点不在存，在"正确的时机召回正确的内容"。 |
| 4 | 评估与进化 | 没有可执行验证的 Agent 是在猜谜。评估让你跟上模型演进。 |
| 5 | 多模态与协作 | Agent 正在突破对话框。多 Agent 有效的关键是引入新信息。 |

如果只记一句话，记住这个：

> **Agent 不是魔法，是系统工程。模型决定上限，Harness 决定下限——而真正能用的是下限。**

关于"模型会不会吃掉 Harness"——源书后记给出答案：模型会不断内化 Harness 的功能，但 Harness 的边界也会不断外扩。就像编程语言从汇编演进到 Python，但软件工程不但没消失，反而更复杂了。**Harness 工程才是核心竞争力。**

---

*本文基于李博杰《[深入理解 AI Agent](https://bojieli.github.io/ai-agent-book/)》（Apache 2.0 协议）第 9-10 章内容改编。整个系列用费曼学习法（概念 → 类比 → 动手）重构原书核心内容为 5 篇渐进教程。*
