---
title: "Agent 是什么？—— 一个公式、一个类比、一个能跑的 Demo"
date: "2026-08-06"
update_date: "2026-08-06"
description: "从 Agent = LLM + 上下文 + 工具 这个核心公式出发，用一个实习生类比和一个 50 行 Python Demo，讲清 AI Agent 的本质。"
tldr: "Agent 不是魔法——它是有大脑（LLM）、有眼睛（上下文）、有双手（工具），再套上一副缰绳（Harness）的系统。读完这篇，你会理解 Agent 为什么能干活，以及它为什么会跑偏。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Harness Engineering", "Python", "系列教程"]
series: "AI Agent 系列教程"
series_order: 1
---

> 本文是 **AI Agent 系列教程** 第 1 篇。基于李博杰《深入理解 AI Agent》改编，用费曼学习法（概念 → 类比 → 动手）带你从零理解 Agent。

你用过 ChatGPT 写邮件，也用过 Cursor 写代码。但你想过没有：**从"一问一答的聊天"到"Agent 自己读文档、写代码、跑测试、提 PR"，中间到底多了什么？**

多出来的部分，就是今天要讲的核心。

---

## Part 1：概念——Agent 到底是什么？

### 一个公式

整个 AI Agent 领域，可以用一个公式概括：

> **Agent = LLM + 上下文 + 工具**

翻译成人话：

| 组件 | 角色 | 一句话 |
|------|------|--------|
| **LLM**（大语言模型） | 🧠 大脑 | 负责思考和决策——"下一步该干什么" |
| **上下文**（Context） | 👀 眼睛 | 让 Agent 看到世界——系统指令、对话历史、环境状态、检索到的知识 |
| **工具**（Tools） | 👐 双手 | 让 Agent 能改变世界——搜索、读写文件、执行代码、调用 API |

分解来看：

**LLM 是决策引擎。** 但它不是魔法——把它想象成一个纯函数：

```
决策 = LLM（上下文）
```

输入什么上下文，就产出什么决策。上下文的质量直接决定决策的质量。GPT-4 和一个入门实习生之间的差距，可能只是你给实习生的那份项目文档够不够好。

**上下文是"Agent 看到的世界"。** 每次调用 LLM，你塞进上下文的东西包含五部分：

1. **系统提示**（System Prompt）——给 Agent 的"员工手册"，定义身份、权限、行为规则
2. **工具定义**——告诉它有哪些工具可用，每个工具叫什么、干什么、需要什么参数
3. **用户消息**——你的输入
4. **助手消息**——Agent 之前的回复（包括推理过程、文本输出、工具调用请求）
5. **工具结果**——工具执行后返回的数据

前两项是**静态前缀**（每轮都一样），后三项是**动态轨迹**（每轮都在增长）。Agent 的每一次决策，都是基于这五样东西的总和。

**工具是"Agent 能改变什么"。** 没有工具，GPT-4 再聪明也只能聊天。有了工具，它能搜索网页、读写文件、执行代码、发送邮件——从一个"顾问"变成了一个"执行者"。

### 一个执行循环：ReAct

Agent 不是一次性出答案，而是在一个循环中工作：

```
用户输入
  → LLM 思考：我需要搜点什么？
  → LLM 调用搜索工具
  → 工具返回结果
  → LLM 思考：搜到的信息够不够？不够就再搜/换关键词
  → 够了，输出最终答案
```

这个循环叫 **ReAct**（Reasoning + Acting，推理+行动），是几乎所有现代 Agent 的底层逻辑：

```
while 任务没完成：
    把"系统提示 + 工具列表 + 完整对话历史"发给 LLM
    if LLM 返回了工具调用:
        执行工具，把结果追加到对话历史
    else:
        说明 LLM 认为任务已完成，输出最终答案，退出循环
```

### 但是……裸的 Agent 不够可靠

你很可能听过 Cursor 或 Claude Code 的"翻车"故事：Agent 信誓旦旦说"改完了"，其实啥也没改对；或者同一个文件反复改 8 遍，陷入死循环。

所以生产级 Agent 不能在裸公式上工作。真实世界的 Agent 架构是这个的扩展版：

> **Agent = LLM + 上下文 + 工具 + 约束 + 验证 + 纠偏**
> ​    ​    ​    ​= **模型 + Harness（缰绳）**

**Harness Engineering**（缰绳工程）是李博杰这本书最核心的主张：当模型能力趋同时，真正拉开差距的不是谁的模型更聪明，而是谁给模型搭的"缰绳系统"更好——约束、验证、反馈、纠偏、熵管理。你可以把它理解为给一匹千里马配上的鞍具和缰绳：马再能跑，没有缰绳也是乱跑。

---

## Part 2：类比——把 Agent 想象成一个实习生

为了帮你建立直观理解，我们用一个类比：**Agent 就是一个刚入职的实习生。**

| 实习生的要素 | Agent 的对应 | 含义 |
|------------|------------|------|
| 智力和知识储备 | **LLM** | 聪明，但缺乏对"当前项目"的了解 |
| 你给的项目文档、代码库地图、任务说明 | **上下文** | 告诉他在哪、在干什么、要注意什么 |
| 电脑、IDE、CI 流水线、提交权限 | **工具** | 让他能动手干活，而不是只能口头建议 |
| 公司的 Code Review、lint 规则、发布 checklist、on-call 流程 | **Harness** | 防止他搞出大乱子，给错误兜底 |

现在想想：一个实习生表现好不好，主要取决于什么？

- **当然取决于他聪不聪明（模型能力）。**
- 但更取决于：**你给的文档够不够清楚（上下文质量）、权限给得对不对（工具设计）、流程有没有兜底（Harness）。**

这就是为什么"Prompt Engineering"只是起点。当你只优化提示词时，你在优化这个实习生的"任务说明书"。但真正让他稳定产出的，是**文档体系 + 工具链 + 代码审查 + CI + 监控**这套完整系统——也就是 Harness。

再看一个具体场景。Claude Code 在帮你改代码时，它的 Harness 至少包含：

- **权限分级**：读文件自动放行，写文件需要确认，执行危险命令二次确认
- **熔断机制**：连续出错就停下来，不让你付无上限的 API 费
- **上下文压缩**：对话历史太长时自动摘要，避免 token 爆表
- **状态栏**：实时告诉你它在干什么、第几轮了、花了多少钱

这些都不是模型自带的能力——它们是工程师在模型外面搭的基础设施。**搭得越好，Agent 越稳。**

---

## Part 3：动手——50 行 Python，搭一个能搜索的 Agent

概念和类比讲完了。现在我们来**真的写一个**。

### 我们要做什么

一个极简 Agent：能用搜索引擎查信息，然后根据搜索结果回答问题。用 OpenAI API，代码在 50 行以内。

**逻辑很简单：**

1. 用户问一个问题
2. Agent 判断"这个我需要搜索吗？"
3. 如果需要，调用搜索工具 → 拿到结果 → 再想一下 → 输出答案
4. 如果不需要，直接回答

### 完整代码

```python
import json, requests
from openai import OpenAI

client = OpenAI()  # 默认读 OPENAI_API_KEY 环境变量

# ── 1. 定义工具：Agent 能干什么 ──
def search_web(query: str) -> str:
    """模拟搜索，实际可用 DuckDuckGo / SerpAPI 替换"""
    url = f"https://html.duckduckgo.com/html/?q={query}"
    resp = requests.get(url, headers={"User-Agent": "my-agent/1.0"})
    # 这里简化处理，真实场景需要做 HTML 解析
    return resp.text[:2000]

TOOLS = [{
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "搜索互联网获取实时信息。当需要最新数据或不确定答案时使用。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"}
            },
            "required": ["query"]
        }
    }
}]

# ── 2. 工具执行映射 ──
TOOL_MAP = {"search_web": search_web}

# ── 3. Agent 主循环 ──
def agent_loop(user_question: str, max_rounds: int = 5):
    messages = [{
        "role": "system",
        "content": (
            "你是一个有帮助的助手。遇到不确定的信息时，"
            "主动使用 search_web 工具搜索，而不是猜测。"
        )
    }, {
        "role": "user",
        "content": user_question
    }]

    for _ in range(max_rounds):
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto"  # 让模型自己决定要不要用工具
        )
        msg = resp.choices[0].message

        # 情况 A：模型认为可以回答，不调工具
        if not msg.tool_calls:
            return msg.content

        # 情况 B：模型要调工具
        messages.append(msg)  # 把模型的工具调用请求加入历史
        for tc in msg.tool_calls:
            fn_name = tc.function.name
            fn_args = json.loads(tc.function.arguments)
            result = TOOL_MAP[fn_name](**fn_args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result
            })
            print(f"  🔧 调用了 {fn_name}({fn_args['query'][:30]}...) → 返回 {len(result)} 字符")

    return "达到最大轮数，未能完成任务。"

# ── 4. 跑起来 ──
if __name__ == "__main__":
    answer = agent_loop("2026 年图灵奖颁给了谁？")
    print(f"\n📝 最终答案：\n{answer}")
```

### 代码逐段解释

**第 1 步：定义工具。** 工具的定义（名称、描述、参数 schema）会被塞进每次 LLM 调用的 `tools` 参数里。模型的训练让它能读懂这些定义，知道什么时候该调哪个工具。注意 `description` 写得越具体越好——这里强调"当需要最新数据时使用"，引导模型主动搜索而不是凭记忆胡猜。

**第 2 步：工具执行映射。** `TOOL_MAP` 是把工具名称映射到实际 Python 函数的字典。Agent 框架（这 50 行代码就是最简单的"框架"）收到模型的工具调用请求后，用这个字典找到对应用函数并执行。

**第 3 步：Agent 主循环。** 这是整个 Agent 的心脏——`agent_loop` 函数。

- 先把系统提示和用户问题放进消息列表
- 然后进入循环：把消息列表发给 LLM → 看 LLM 返回什么
- 如果 LLM 返回的是文本（不是工具调用），说明它认为可以回答了，直接返回
- 如果 LLM 返回的是工具调用，执行工具，把结果追加进消息列表，再循环一次
- `max_rounds=5` 是熔断器——防止无限循环烧钱

**第 4 步：运行。** 一条 `agent_loop(question)` 就启动了整个 Agent。

### 跑一下看看

```bash
$ export OPENAI_API_KEY="sk-..."
$ pip install openai requests
$ python agent.py

  🔧 调用了 search_web(2026 图灵奖...) → 返回 2000 字符

📝 最终答案：
根据搜索结果，2026 年图灵奖尚未公布。2025 年的图灵奖颁给了 Andrew Barto
和 Richard Sutton，以表彰他们在强化学习领域的贡献。图灵奖通常在每年 4-5
月公布，如果你想了解 2026 年的结果，建议届时关注 ACM 的官方公告。
```

Agent 判断这个问题需要最新信息 → 调用搜索 → 拿到结果 → 基于结果给出准确答案。它没有凭训练数据"编造"一个 2026 年图灵奖得主。

### 从 50 行到生产级

这个 Demo 只有 50 行，但你已经在跑一个**真正的 Agent 循环**了。把它和 Claude Code / Cursor 比，差距在哪？

| 维度 | 我们的 50 行 | 生产级 Agent |
|------|------------|------------|
| **工具数量** | 1 个（搜索） | 几十个（读文件、写文件、跑测试、Git 操作……） |
| **上下文管理** | 无限追加，迟早爆窗口 | KV Cache 优化、分层压缩、子 Agent 隔离 |
| **安全性** | 零 | 权限分级、熔断、输入清洗、输出校验 |
| **可观测性** | 一个 print | 完整的 trace、指标、日志 |
| **纠偏能力** | 无 | 出错自动重试、失败后回滚、死循环检测 |

这六样东西，就是我们说的 **Harness**。在后续系列中，我们会逐一拆解这些 Harness 的每个组件。

---

## 总结

今天我们讲了三个东西：

1. **Agent 不是魔法公式**——它就是一个循环：「LLM 做决策 → 调用工具 → 拿到结果 → 再做决策」。核心公式：`Agent = LLM + 上下文 + 工具`，生产级要加上 Harness（约束 + 验证 + 纠偏）。

2. **把 Agent 想成实习生**——他的表现不只取决于智力，更取决于你给的文档、权限、流程。这就是 Harness Engineering 的核心洞察。

3. **50 行代码就能跑一个 Agent**——我们真的写了一个。它能搜索、能思考、能回答。从这 50 行出发，往上加工具、加安全、加可观测性，就是生产级 Agent 的工程之旅。

---

## 下一期预告

> **Agent 的双手：工具调用与 MCP 协议**
>
> 现在 Agent 只有一个"手"（搜索）。我们会给它装上更多：文件操作、代码执行、API 调用。同时介绍 MCP（Model Context Protocol）——让工具像 USB 一样即插即用。配套实战：给 Agent 装上"天气查询 + 便签记录"两个工具。

---

*本文基于李博杰《[深入理解 AI Agent](https://bojieli.github.io/ai-agent-book/)》（Apache 2.0 协议）第 1 章内容改编，用费曼学习法重构为"概念 → 类比 → 动手"三段式教程。*
