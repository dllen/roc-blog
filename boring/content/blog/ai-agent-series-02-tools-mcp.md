---
title: "Agent 的双手：工具调用、MCP 协议与一个双工具 Agent"
date: "2026-08-06"
update_date: "2026-08-06"
description: "工具是 Agent 改变世界的方式。本文拆解工具的五种分类、MCP 协议的设计思路，并带你给 Agent 装上'天气查询 + 便签记录'两个工具。"
tldr: "没有工具的 Agent 只是顾问，有了工具的 Agent 才是执行者。理解工具不是学会调 API，而是学会设计'Agent 能理解、能正确使用、不会闯祸'的工具接口。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Tool Calling", "MCP", "Python", "系列教程"]
series: "AI Agent 系列教程"
series_order: 2
---

> 本文是 **AI Agent 系列教程** 第 2 篇。基于李博杰《深入理解 AI Agent》第 4-5 章改编。上一篇我们搭了一个 50 行的搜索 Agent——它只有一个"手"。今天给它装上更多。

---

## Part 1：概念——工具到底是什么？

### 回顾：Agent 循环中的工具

还记得上一篇文章的 Agent 循环吗？

```
用户输入 → LLM 思考 → 需要工具？→ 调用工具 → 结果喂回 LLM → 再思考 → 输出答案
```

工具是这个循环里唯一**能改变外部世界**的环节。LLM 本身只能"想"，但工具能让它"做"。

### 工具的五种分类

按**调用方向**和**作用对象**，所有工具分成五类：

| 类型 | 谁发起 | 干什么 | 例子 |
|------|--------|--------|------|
| **感知工具** | Agent 主动 | 获取信息 | 搜索引擎、读文件、查数据库、API 查询 |
| **执行工具** | Agent 主动 | 改变世界 | 写文件、执行代码、发送请求、操作浏览器 |
| **协作工具** | Agent 主动 | 调度其他 Agent/人 | 派生子 Agent、请求人类确认 |
| **事件触发器** | 外部事件 | 唤醒 Agent | 定时器、新邮件到达、Webhook 回调 |
| **用户通信** | Agent 主动 | 主动联系用户 | 发消息、打电话、推送通知 |

前两类是 Agent 的"眼睛和手"，第三类是"叫帮手"，后两类让 Agent 从"一问一答"变成"持续在线"。

### 工具设计的第一原则

李博杰在书里给工具设计定了一条核心原则，我翻译成大白话：

> **通用工具胜过专用工具，除非有明确的安全、权限或性能理由。**

为什么？因为 LLM 的代码生成能力很强。你给它一个 `code_interpreter`（能跑 Python 的沙箱），它自己就能用 sympy 做数学、用 pandas 分析数据、用 matplotlib 画图——不需要你为每个场景写一个专用工具。专用工具的维护负担会随需求线性增长，通用工具用 LLM 的能力替你消化复杂度。

但**安全边界是例外**。`grep` 值得单独做一个工具而不能直接用 raw shell——因为 grep 是只读的，raw shell 能做任何事。

### 工具描述怎么写

工具描述是 Agent 能否正确使用工具的决定性因素。三条规则：

1. **告诉它"什么时候用"，而不是"能干什么"。** "搜索网页"不如"当需要实时信息或不确定答案时使用搜索"——后者给了模型一个决策条件。

2. **边界比能力更重要。** 明确列出"不能干什么"——比如"这个工具只搜索 2024 年之后的内容"，能大幅减少误用。

3. **给 1-5 个真实调用示例。** JSON Schema 描述的是类型，不是惯例——"时间戳用秒还是毫秒""嵌套过滤器怎么写"，只有示例能讲清。有研究表明加入示例能把工具调用准确率从 72% 提升到 90%。

一条工程经验：**当 Agent 频繁选错工具时，先改工具描述，别急着换模型。**

### MCP 协议：让工具像 USB 一样即插即用

2024 年底 Anthropic 发布了 **MCP**（Model Context Protocol），解决一个实际问题：你给 Claude Desktop 写了一个查天气的工具，到了 Cursor 里又得重写一遍。

MCP 的架构很简单——客户端-服务端：

```
Agent（MCP 客户端）
  ├── MCP 服务器 A：天气查询、股票查询
  ├── MCP 服务器 B：数据库读写、文件管理
  └── MCP 服务器 C：邮件发送、日历管理
```

- **MCP 服务器** 暴露工具、资源（只读数据）、提示模板
- **MCP 客户端**（Agent 框架、IDE）通过标准协议通信
- 本地用 stdio，远程用 Streamable HTTP

一个 MCP 服务器写好，Cursor、Claude Desktop、OpenClaw 都能用。开发一次，到处运行。

**但 MCP 有个现实的性能问题：** 五个 MCP 服务器可能引入 ~55,000 token 的工具定义，全塞进系统提示里会直接撑爆上下文。解决方法有两种：按需发现（Agent 先用一个轻量"工具搜索工具"找到需要的工具，再加载详细定义）和分层组织（先匹配服务器，再匹配工具，把搜索空间从"几千个工具"降到"几十个服务器 × 几十个工具"）。

---

## Part 2：类比——给实习生配工具箱

上一篇文章我们把 Agent 比作实习生。现在想象你要给这个实习生配**工具箱**。

### 你会怎么配？

你不会把公司里所有工具都堆在他桌上——钉枪、电焊机、激光测距仪全塞过去，他反而不知道该用哪个。你会：

- **只放他工作确实需要的工具**（不要钉枪，他是写代码的）
- **每个工具贴标签，写清什么时候用**（"螺丝刀——当需要拧螺丝时用，不要用来撬东西"）
- **危险工具上锁**（电钻需要师傅确认才能拿）
- **用完检查**（写了文件之后自动跑一下 lint）

这就是 Agent 的工具设计哲学：

| 好实习生管理 | Agent 工具设计 |
|------------|------------|
| 只配必要的工具 | 按需发现，不把几千个工具全塞进上下文 |
| 贴标签写用例 | 工具描述写"决策条件"，不只是"功能列表" |
| 危险工具上锁 | 权限分级、Proposer-Reviewer 机制 |
| 用完检查 | write_file 之后自动跑 lint，结果反馈给 Agent |

### 一个反例：参数失真

假设你给实习生的命令行工具悄悄做了一些"自动修正"——比如自动把中文引号转成英文引号。实习生看到的文件内容里是中文引号，调工具搜这个字符串却搜不到——因为工具在背后默默改了参数。他不知道发生了什么，只会觉得"我是不是看错了"。

这对应 Agent 工具设计里一条铁律：

> **模型感知到的世界和工具操作的世界之间，不能存在系统性偏差。**

任何转换、规范化，要么不做，要么写在工具描述里，并作为工具结果的一部分回报给模型。

---

## Part 3：动手——给 Agent 装上多个工具

### 我们要做什么

把上一篇的单工具 Agent 升级为带两个工具的版本：

1. **查天气**：给定城市名，返回天气信息（模拟 API）
2. **记便签**：Agent 可以把信息写进便签本，下次对话时能读回来

同时引入一个关键设计：**工具执行后的自动验证。**

### 完整代码

```python
import json
from datetime import datetime
from openai import OpenAI

client = OpenAI()

# ── 1. 便签存储（模拟数据库） ──
NOTES: dict[str, dict] = {}  # {note_id: {title, content, created_at}}

# ── 2. 工具实现 ──
def get_weather(city: str, country: str = "CN") -> str:
    """模拟天气查询，实际可用 OpenWeatherMap API 替换"""
    # 模拟数据
    weather_db = {
        "北京": "晴，24°C，湿度 45%，北风 3 级",
        "上海": "多云，28°C，湿度 70%，东南风 2 级",
        "深圳": "雷阵雨，31°C，湿度 85%，西南风 4 级",
    }
    result = weather_db.get(city, f"未找到 {city} 的天气数据")
    return json.dumps({"city": city, "weather": result, "updated": datetime.now().isoformat()})

def add_note(title: str, content: str) -> str:
    """添加便签，返回便签 ID"""
    note_id = f"note_{len(NOTES) + 1:03d}"
    NOTES[note_id] = {"title": title, "content": content, "created_at": datetime.now().isoformat()}
    return json.dumps({"status": "ok", "note_id": note_id, "title": title})

def list_notes() -> str:
    """列出所有便签"""
    if not NOTES:
        return "暂无便签"
    result = []
    for nid, note in NOTES.items():
        result.append(f"[{nid}] {note['title']} ({note['created_at'][:10]})")
    return "\n".join(result)

# 工具定义（注意 description 的写法：决策条件 + 反例）
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": (
                "查询指定城市的实时天气。"
                "当用户询问天气、气温、是否下雨等问题时使用。"
                "不要用于查询历史天气或天气预报——本工具只返回当前天气。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市中文名称，如'北京'、'上海'"},
                    "country": {"type": "string", "description": "国家代码，默认 CN", "default": "CN"}
                },
                "required": ["city"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_note",
            "description": (
                "添加一条便签笔记，持久化保存。"
                "当用户说'记下来'、'帮我保存'、'加到便签'时使用。"
                "不要用于临时计算或不需要保存的信息。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "便签标题，简洁概括内容"},
                    "content": {"type": "string", "description": "便签正文"}
                },
                "required": ["title", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_notes",
            "description": (
                "列出当前所有已保存的便签。"
                "当用户问'我记过什么'、'查看便签'、'之前记了什么'时使用。"
                "不需要参数。"
            ),
            "parameters": {"type": "object", "properties": {}}
        }
    }
]

TOOL_MAP = {"get_weather": get_weather, "add_note": add_note, "list_notes": list_notes}

# ── 3. 自动验证钩子 ──
def verify_tool_call(tool_name: str, args: dict, result: str) -> str | None:
    """工具执行后自动检查，返回 None 表示通过，否则返回错误信息"""
    if tool_name == "add_note":
        data = json.loads(result)
        if data.get("status") != "ok":
            return f"便签添加失败：{result}"
        if len(data.get("title", "")) == 0:
            return "便签标题为空"
    if tool_name == "get_weather":
        if "未找到" in result:
            return f"天气查询无结果，可能需要更正城市名"
    return None  # 验证通过

# ── 4. Agent 主循环 ──
def agent_loop(user_input: str, max_rounds: int = 8):
    messages = [{
        "role": "system",
        "content": (
            "你是一个生活助手 Agent，可以查天气和记便签。\n"
            "- 遇到天气问题主动用 get_weather，不要猜测\n"
            "- 用户叫你记东西时用 add_note\n"
            "- 用户问之前记过什么时用 list_notes\n"
            "- 不要编造天气数据"
        )
    }, {
        "role": "user",
        "content": user_input
    }]

    for round_num in range(max_rounds):
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto"
        )
        msg = resp.choices[0].message

        if not msg.tool_calls:
            return msg.content

        # 追加助手消息到历史
        messages.append(msg)

        for tc in msg.tool_calls:
            fn_name = tc.function.name
            fn_args = json.loads(tc.function.arguments)

            # 执行工具
            try:
                raw_result = TOOL_MAP[fn_name](**fn_args)
            except Exception as e:
                raw_result = json.dumps({"error": str(e)})

            # 自动验证
            verify_error = verify_tool_call(fn_name, fn_args, raw_result)
            if verify_error:
                raw_result = json.dumps({"warning": verify_error, "result": json.loads(raw_result)})

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": raw_result
            })

            print(f"  🔧 第{round_num+1}轮: {fn_name}({json.dumps(fn_args, ensure_ascii=False)})")
            if verify_error:
                print(f"     ⚠️ 验证警告: {verify_error}")

    return "达到最大轮数限制。"

# ── 5. 跑起来 ──
if __name__ == "__main__":
    print("=" * 50)
    print("场景 1：查天气 + 记便签")
    print("=" * 50)
    answer = agent_loop("帮我查一下深圳的天气，如果下雨就把'带伞提醒'记到便签里")
    print(f"\n📝 Agent：{answer}\n")

    print("=" * 50)
    print("场景 2：跨轮记忆")
    print("=" * 50)
    answer = agent_loop("我之前记过什么便签？")
    print(f"\n📝 Agent：{answer}")
```

### 这次多了什么？

和上一篇的 50 行相比，这次有三个关键升级：

**1. 多工具协同。** Agent 有了三个工具而不是一个。它需要自己判断"现在该用哪个"。注意工具描述里的决策条件——"当用户询问天气时使用""当用户说记下来时使用"——这些不是废话，是给模型的决策路由表。

**2. 自动验证钩子。** `verify_tool_call` 函数在每次工具执行后自动跑。如果 `add_note` 返回失败，或天气查询返回"未找到"，错误信息会被追加上去，Agent 在下一轮就能看到并纠正。这是 Harness 里"验证"组件的最简实现——不需要复杂的 Sidecar，一个 10 行的检查函数就能避免很多静默失败。

**3. 跨轮状态。** `NOTES` 字典在内存里保存了 Agent 写的便签。第二个场景里，Agent 能读到之前记的内容。这就是最简单的"记忆"——但它只在进程存活时有效。下一篇我们会讲真正的持久化记忆系统。

### 运行效果

```bash
==================================================
场景 1：查天气 + 记便签
==================================================
  🔧 第1轮: get_weather({"city": "深圳"})
  🔧 第2轮: add_note({"title": "带伞提醒", "content": "深圳今天有雷阵雨，出门记得带伞。"})

📝 Agent：深圳目前是雷阵雨，气温 31°C，湿度较高。我已经帮你把"带伞提醒"记到便签里了，出门别忘了带伞！

==================================================
场景 2：跨轮记忆
==================================================
  🔧 第1轮: list_notes({})

📝 Agent：你目前有一条便签：
- [note_001] 带伞提醒（2026-08-06）
```

---

## 总结

今天我们讲了：

1. **工具是 Agent 的双手**——五类工具覆盖了从"看"到"做"到"叫人"到"被叫醒"的完整交互模式。通用工具胜过专用工具，除非有安全边界。

2. **工具设计是工程活**——描述写什么（决策条件、边界、示例）比实现写什么更重要。MCP 让工具可复用，但要注意上下文开销。

3. **多工具 + 自动验证 = 更可靠的 Agent**——我们在上一篇基础上加了三个工具和一个验证钩子。Agent 现在能协同使用多个工具，出错时能及时发现并纠正。

---

## 下一期预告

> **Agent 的记忆：RAG、知识库与跨会话持久化**
>
> 目前的 Agent 关了进程就"失忆"。下一期我们给 Agent 装上真正的长期记忆——用向量数据库搭 RAG，让 Agent 能记住你的偏好、检索你给过的文档、跨会话保持上下文。配套实战：搭一个"能记住你"的问答 Agent。

---

*本文基于李博杰《[深入理解 AI Agent](https://bojieli.github.io/ai-agent-book/)》（Apache 2.0 协议）第 4-5 章内容改编，用费曼学习法重构为"概念 → 类比 → 动手"三段式教程。*
