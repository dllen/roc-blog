---
title: "AgentOps 实战：让 Agent 从能跑变成能管"
date: 2026-11-04
update_date: 2026-11-04
description: "Agent 上线后真正的难题才开始：可观测性、交互追踪、反馈闭环、人工接管这四件事怎么搭。给出一套最小 AgentOps 栈的四层结构与可直接抄的 Langfuse 代码，并纠正一个常见误解——成本随调用链增长是线性的，不是指数的。"
tldr: "没有行动的观测，只是昂贵的日志存储。AgentOps 的产出不是漂亮面板，而是「下次出问题时，你能在一分钟内说清它错在哪一步」。"
keywords: ["AgentOps", "Agent 可观测性", "Trace 追踪", "Langfuse", "人工接管", "成本可见性"]
taxonomies:
  tags: ["AI Agent", "可观测性", "工程实践", "LLMOps"]
---

AgentOps 要解决的就是这么一件事：客服 Agent 上线三天就开始被投诉，「它乱回答」「明明订单已发货，它却说没发货」，而团队查不出原因。

排查时后端说：模型响应都正常，没有 5xx。运维说：延迟 800ms 左右，P99 没爆。产品经理翻对话记录，只拿到用户输入和最终回复，看不到中间调了哪些工具、传了什么参数、模型在哪一步开始跑偏。

**三个人都对，bug 就在三个人之间的缝隙里。** demo 只关心「能不能回答」，生产系统必须关心「每一步怎么回答、为什么这样回答、错了怎么修」。

这篇讲怎么补上这个缝隙，以及一个更实际的判断：**AgentOps 的产出不是面板，是「下次出问题时，你能不能在一分钟内说清它错在哪一步」。**

## 一、AgentOps 是四件事，不是一个监控面板

传统 DevOps 关注部署、可用性、资源利用率；MLOps 关注训练、版本管理、离线评估。Agent 是个活系统：它运行时会动态调工具、做多步决策、跟人交互。你要看到的不是「API 有没有返回」，而是「这个 Agent 经历了怎样的路径」。

拆成四件事：

| 组成 | 解决什么 | 缺了会怎样 |
|---|---|---|
| **可观测性** | 记录输入、输出、中间状态、工具调用、延迟、成本、异常 | Agent 是个黑盒，出错只能靠猜 |
| **交互追踪** | 把一次完整调用还原成时间线上的事件序列 | 复盘变成考古 |
| **反馈闭环** | 把线上问题回流到 prompt、工具、模型迭代 | 观测只是昂贵的日志存储 |
| **人工接管** | 在关键节点或异常时把控制权交还给人 | 高风险场景不敢上线 |

第三件最容易被漏。**没有闭环的 AgentOps 只是一个更贵的日志系统**——数据进去了，谁也不看，或者看了也不知道该改什么。

### Trace / Span / Event：三层数据结构

一次用户请求被建模为一条 **Trace**，里面包含多个 **Span**，Span 内再包含若干 **Event**：

- **Trace** —— 一次完整调用，从用户输入到最终输出。**问题复盘的最小单元。**
- **Span** —— Trace 内的子操作：一次模型调用、一次工具执行、一次检索。
- **Event** —— Span 内的关键节点：「模型决定调用工具」「工具返回异常」「触发人工复核」「命中敏感词」。

这个分层是整套体系的地基，因为它是**连接技术问题与业务影响的唯一桥梁**：只有把「这次调用花了 12 次模型调用、3 次工具失败、最终转人工」记成一条 Trace，你才能问出「转人工率上升是因为工具失败还是模型变啰嗦了」。

**Event 尤其重要**：把「成功完成预订」「触发人工接管」这类业务事件也写成 Event，技术指标和业务指标才能在同一条时间线上对齐。

## 二、最小 AgentOps 栈：四层

不要一上来就买全家桶。一个能用的最小栈是四层：

```
Agent 调用 → 调用日志 → 追踪平台 → 异常? → 告警/人工复核 → 优化 prompt/工具
                      ↓
                   归档分析
```

采集层尽量轻量，**异步上报、失败降级为本地日志**——观测代码不能成为新的故障源。

### 用 Langfuse 记录一次完整 Trace

Langfuse 的 Python SDK 现行是 v5，接口与网上常见的老教程差别很大（`from langfuse.decorators import observe, langfuse_context` 那一套是 v2 时代的写法）。现在的形态是：

```python
# agent_trace.py：用 Langfuse 记录一次 Agent 调用的完整 trace
# 依赖：pip install langfuse  （SDK 文档以 v5 为准）

import os
from langfuse import Langfuse, get_client, observe

# 显式传 key；也可以完全交给环境变量 LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY
client = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
    host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
)
langfuse = get_client()


def query_order(order_id: str) -> dict:
    """模拟订单查询工具。"""
    if order_id == "ORD-12345":
        return {"status": "已发货", "item": "无线耳机", "logistics": "顺丰速运"}
    return {"status": "未知", "error": "订单不存在"}


@observe(name="customer-service-agent")
def run_customer_service_agent(user_query: str, order_id: str) -> str:
    """客服 Agent 主入口，整个函数调用被记录为一个 Trace。"""
    # 给 Trace 打业务标签：这些字段决定了后面能不能按维度切指标
    langfuse.update_current_span(
        metadata={"user_query": user_query, "order_id": order_id,
                  "intent": "查询订单 + 退货政策"}
    )

    # Step 1: 调工具（每个工具调用是一个子 Span）
    order = query_order(order_id)

    # Step 2: 调模型（生成类型用 generation 而不是 span）
    with langfuse.start_as_current_observation(
        as_type="generation", name="answer-draft"
    ) as gen:
        answer = f"订单 {order_id} 当前状态：{order.get('status')}。"
        gen.update(output=answer)

    return answer
```

三个必须注意的细节：

**其一，`@observe` 的参数决定你在面板里看到什么。** `name="customer-service-agent"` 是 Trace 名；不写就用函数名。想在面板里按「哪类问题」筛，就得显式打 metadata 标签。

**其二，模型调用用 `as_type="generation"`，工具调用用 `as_type="span"`。** 这不是洁癖：只有 generation 会被算进 token 与成本统计，span 不会。**分错类型，你的成本面板就是错的。**

**其三，SDK 是异步的，会在后台缓冲。** 短进程（脚本、Serverless、Worker）结束前必须 `client.flush()`，否则最后一批 observation 直接丢掉——这是「本地跑没问题、上线丢数据」的常见原因。

## 三、评估：能用规则判的，就别用模型判

有了 Trace 数据，下一步是离线评估执行质量。这里有个判断值得单独拿出来：**不是所有维度都该交给模型评委。**

一个最小评估脚本，用规则判：

```python
# evaluate_agent.py：规则评估一次 Agent 执行
from dataclasses import dataclass, field

@dataclass
class AgentRun:
    trace_id: str
    user_query: str
    final_answer: str
    tool_calls: list = field(default_factory=list)
    expected_keywords: list = field(default_factory=list)
    forbidden_keywords: list = field(default_factory=list)


def evaluate_run(run: AgentRun) -> dict:
    """关键词 + 工具调用的规则评估。"""
    missing = [kw for kw in run.expected_keywords if kw not in run.final_answer]
    forbidden = [kw for kw in run.forbidden_keywords if kw in run.final_answer]
    has_tool_calls = len(run.tool_calls) > 0
    tool_errors = [t for t in run.tool_calls if t.get("status") == "error"]

    score = 1.0
    if missing:
        score -= 0.3 * len(missing)
    if forbidden:
        score -= 0.5 * len(forbidden)
    if not has_tool_calls:
        score -= 0.3
    if tool_errors:
        score -= 0.2 * len(tool_errors)

    return {
        "trace_id": run.trace_id,
        "score": max(score, 0.0),
        "missing": missing,
        "forbidden": forbidden,
        "tool_errors": len(tool_errors),
    }
```

关键不是这段代码，而是**它的适用范围**：

- 「答案里必须出现『已发货』」「不能出现『退款』」——**规则能判**，就别调模型；
- 「回复的语气是否专业」「是否答非所问但语义相关」——**只有模型能判**；
- 「这个回答对不对」——如果答案有标准答案，**规则或字符串匹配最可靠**，模型只是备选。

原因很直接：规则评估是确定性的、可重放的、零成本的；模型评估有随机性、有延迟、有成本，还可能判错。**把能判死的部分交给规则，把判不了的才交给模型**——这跟「能用 SQL 就不问模型」是同一条原则。

### 三类指标要一起看

| 类别 | 指标 | 回答什么问题 |
|---|---|---|
| **技术** | 任务完成率、工具调用准确率、同输入多次调用的一致性、异常率 | 它做对了吗 |
| **业务** | 用户满意度、转人工率、转化率 | 用户满意吗 |
| **成本** | 单次调用 token、单次调用的模型调用次数、**单位业务成果的成本** | 值得吗 |

第三类里那条「单位业务成果的成本」最容易被漏。**单次调用平均 token 没有决策价值**——把 Agent 的任务完成率从 60% 提到 90%，单次 token 涨了 50% 也可能是赚的。真正该看的是「每完成一次预订的成本」「每次成功解决工单的成本」。这个口径怎么建，展开在 [按成功任务算 Token 成本](/blog/agent-token-cost-per-task/)。

### 告警要指向动作

追踪和评估的终点是行动。可落地的告警规则：

- 连续 3 次工具调用失败；
- 单次调用成本超过阈值；
- 用户反馈「不满意」或触发敏感词；
- 响应时间超过 P99 阈值；
- 转人工率突然升高。

告警触发时，系统要把**当前会话上下文**（Trace ID、对话历史、已调用工具）推给人工，坐席不用去翻日志。这条做对了，AgentOps 才真正开始产生价值。

## 四、三个坑，第三个多数人算错了

### 坑一：只监控 API 延迟，不监控执行路径

一次用户请求内部可能包含多次模型调用、多次工具调用和状态转换。**API 返回 200 不代表 Agent 做对了。** 你看到的「稳定服务」可能正在持续输出错误答案。

做法：以 Trace 为核心的监控。每个 Trace 记录完整输入、输出、中间步骤、工具调用参数，把关键业务事件也写成 Event。

### 坑二：没有回滚机制就全量上线

prompt、工具描述、模型版本，任何一个变化都会改变 Agent 行为。一次 prompt 优化直接全量，结果大量 bad case，只能连夜回退——更糟的是没有版本管理，回退后还不知道哪个版本是稳定的。

做法：每次变更都版本化 + 灰度。**把 prompt 版本号写进 Trace 元数据**，这样才能按版本回溯指标、定位「哪个版本开始变差」。这一条是坑二和坑一的交汇点：没有版本号，指标下降时你连嫌疑人是谁都找不到。

### 坑三：成本随调用链「指数增长」？多数人算错了

常见说法是「模型成本随调用链指数增长」。**这句话不对，至少常见的理解不对。**

一次 Agent 任务调用模型 N 次，成本就是 N 倍，**对 N 是线性的**。真正会爆炸的是另一件事：**重试的级联**。

```
第一版 prompt 命中率低 → 模型多绕几步 → 步数多 → 成本高
                                  ↓
                    工具返回脏数据 → 重试 → 步数更多 → 成本更高
                                              ↓
                                    触发兜底重跑整条链路 → 成本再翻倍
```

是**重试把线性变成了近似二次**。所以真正要盯的不是「调用了几次模型」，而是**「一次任务平均重试了几次」**。这个指标在 Trace 里就是工具调用失败次数和任务重跑次数。

顺带一个实践上的推论：把「每个成功任务的成本」而不是「单次调用成本」设成告警阈值，前者会先报警，后者永远不报警。

## 五、选型：六个维度，三层架构

市面上可选 LangSmith、Langfuse、Phoenix，或 OpenTelemetry + 自建面板。评估维度：

| 维度 | 关键问题 |
|---|---|
| **Trace 完整性** | 能否记录模型调用、工具调用、输入输出、中间状态、元数据 |
| **延迟与成本** | 能否按 Trace/Span 统计 token、调用次数、运行时间 |
| **评分与评估** | 是否支持自定义 score、LLM-as-a-Judge、人工标注 |
| **告警与集成** | 能否接入现有告警通道（钉钉、飞书、PagerDuty） |
| **数据主权** | 是否支持私有化部署？数据能否导出？ |
| **生态兼容** | 是否兼容你的框架（自研、LangChain、LlamaIndex） |

比功能清单更该先问的三个问题：**数据会不会出境？存储成本能否承受？团队有没有能力维护？**

架构上分三层，可以按顺序建：

1. **采集层** —— 在 Agent 代码里埋 Trace 采集。要轻量，异步上报，失败降级本地日志。
2. **存储与分析层** —— 初期用 SaaS，规模上来后自建 ClickHouse / Elasticsearch / 对象存储。
3. **应用层** —— 面板、告警规则、评估报告、bad case 复盘。**这一层决定 AgentOps 能不能落地**，因为它是团队每天打开的那个页面。

即使初期全用 SaaS，也要规划好**数据导出路径**，别被单一供应商锁死。

还有一个「不要贪多」的建议：初期只聚焦两件事——**完整记录 Trace** 和 **关键步骤评分**。把问题定位能力先建起来，告警、A/B、成本分析都是后面的事。

## 六、结语

AgentOps 最容易被做成一堆没人看的大盘。判据很简单：**出问题时，它有没有让你在一分钟内说清「它错在哪一步」。**

如果答案是否的，那不管面板多好看，你建的都只是日志存储。

想动手的话，节奏可以这样：

- **第 1–2 周**：接入 SDK，保证每次调用都能生成完整 Trace。先不追求评分，先能看见。
- **第 3–4 周**：定关键指标（任务完成率、工具成功率、平均 token、转人工率），接进日常监控。
- **第 5–8 周**：建立 bad case 复盘，每周抽样分析失败 Trace，驱动 prompt 与工具迭代。
- **第 9–12 周**：引入评估脚本与 A/B，对每次变更做回归验证，并建立灰度发布。

## 相关阅读

- [按成功任务算 Token 成本](/blog/agent-token-cost-per-task/) — 成本口径、10 个高 ROI 习惯与指标体系
- [Agent Token 优化十层检查清单](/blog/agent-token-optimization-review-checklist/) — 把可观测性要求变成可勾选的评审项
- [Agent 怎么"学好"：评估体系、训练方法与持续进化](/blog/ai-agent/ai-agent-series-04-evaluation-evolution/) — 评估维度的完整展开
- [Harness Engineering：让 AI 编码智能体"能用、可控、可维护"的工程体系](/blog/harness-engineering/) — 编码 Agent 侧的工程化实践
- [Langfuse Python SDK 文档](https://langfuse.com/docs/observability/sdk/python/low-level-sdk) · [装饰器用法](https://langfuse.com/docs/observability/sdk/python/decorators) — 代码以官方当前版本为准
- [OpenTelemetry Python](https://opentelemetry.io/docs/languages/python/) — 想要数据主权时的自建底座
