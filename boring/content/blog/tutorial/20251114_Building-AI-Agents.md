---
title: "Building AI Agents"
date: "2025-11-14"
description: "从零到一构建、评估与迭代 AI 代理的实践路线与资源"
tags: [AI, Agents, MCP, RAG, ReAct, CoT, ToT]
categories: [Tutorial]
slug: "building-ai-agents"
---

## 为什么是代理（Agents）
- 从聊天到行动：LLM 由“对话”走向“执行”，代理通过工具使用、计划分解、状态记忆与自我反思完成复杂任务。
- 工作方式转变：任务循环为感知 → 计划 → 执行 → 评估 → 记忆更新 → 下一轮行动。
- 真实价值场景：浏览器操作、代码编辑、知识检索、工作流编排、数据处理与分析、跨系统自动化。

## 核心能力图谱
- 感知与状态化：解析输入、网页/文档结构抽取、环境状态建模。
- 计划与分解：Chain-of-Thought（CoT）、ReAct、Tree-of-Thought（ToT）做任务拆解与行动计划。
- 工具使用：API/浏览器/文件/代码/搜索/数据库等工具的安全调用（Toolformer、MCP 提供标准化接口）。
- 记忆与上下文：短期/长期记忆；语义记忆（向量库）、情节记忆（事件序列）、工作记忆（当前任务状态）。
- 反馈与自我修正：Reflexion 自我反思、评估驱动重试；人类反馈与自动度量结合。
- 多智能体协作：角色分工、同步/异步通信、协调策略与冲突处理。
- 可靠性与安全：越权防护、注入攻击防护、工具调用权限、速率限制、审计与追踪。

## 典型架构（参考实现）
- 输入层：用户意图与环境信息（网页、文件、API 结果）。
- 规划层：任务理解、计划生成与策略选择（ReAct/CoT/ToT）。
- 执行层：工具调用器（MCP/自研 toolkits），带限制与回滚策略。
- 记忆层：向量数据库（Pinecone/Faiss）+ 事件日志（JSON/DB）+ 会话上下文管理。
- 评估层：在线度量（成功率/时间/成本/稳定性）+ 离线基准（任务集回放）。
- 编排层：多代理工作流（编排器/队列/并发池）与可观测性（日志、追踪）。
- 接口层：CLI/HTTP 服务/UI。

## 关键技术与论文
- ReAct：推理+行动交替框架，既解释又执行，提升复杂任务完成率。
- Chain-of-Thought Prompting：引导模型“逐步思考”，提高推理准确性。
- Tree of Thoughts：分支式思考与搜索，解决开放式与多路径问题。
- Toolformer：让模型学会何时调用工具与如何处理返回。
- Generative Agents：模拟具备记忆与日程的“类人代理”，用于交互式环境。
- Reflexion：自我反思驱动的重试与改进，显著提升任务成功率。
- RAG Survey：系统性检索增强（RAG）实践与评估方法。

## MCP 与标准化工具调用
- MCP（Model Context Protocol）：统一工具接口，降低集成成本与安全风险。
- 价值：标准化请求/响应格式、权限控制、审计与跨模型复用。
- 场景：浏览器、文件系统、数据库、代码编辑器、第三方 API。

## 从零到一的实战路线
- 明确目标与边界：任务类型（浏览器/代码/数据）、权限范围、期望成功率与成本预算。
- 选择组件：Claude/OpenAI/Gemini + 工具调用层（MCP/自研）+ 向量库 + 评估框架。
- Prompt 策略：系统提示（角色、约束）、思维链示例、动作模板、结构化输出（JSON）。
- 工具与安全：定义工具协议、参数校验、权限与速率限制、错误恢复与回滚。
- 记忆与检索：语义记忆（向量库）+ 情节记忆（事件日志）；明确写入/读取策略。
- 评估与迭代：建立任务集，自动回放、记录指标、对比不同策略（ReAct vs CoT vs Reflexion）。
- 上线与监控：度量（成功/失败/耗时/Token/成本）、告警与可视化；灰度与 A/B。

## Prompt 工程要点
- 指令清晰：角色、目标、约束与失败标准；输出结构化 JSON。
- CoT 与 ReAct：需要推理与行动交替的场景用 ReAct；纯推理用 CoT。
- 示例驱动：提供 1–3 个“任务→计划→工具调用→结果→评估”的高质量示例。
- 上下文封装：表格、JSON、Markdown 文本块；引用唯一 ID 便于追踪与审计。
- 自我反思与重试：引导“为什么失败”“下次怎么做”“修正计划”。

## 评估与度量
- 成功率：任务完成比例；分任务类别统计。
- 质量得分：是否满足验收条件；人审/自动规则/回归测试。
- 成本与延迟：Token 花费与响应时间；超时与重试次数。
- 稳定性：工具调用失败率、环境异常率、可重现程度。
- 可观测性：完整事件日志、工具输入输出、Prompt 与模型版本、追踪 ID。

## 常见陷阱与安全
- 注入攻击与越权：严格限制工具参数、白名单目标、拆分权限域、审计所有外部调用。
- 上下文污染：将不可信内容隔离在代码块或只读区；避免同上下文执行“改变世界”的动作。
- 评估偏差：仅看单轮成功率忽略重试次数与成本；建议综合指标。
- 过拟合示例：示例过多导致窄化；保持通用指令与少量高质量样例。

## 案例与工具（精选）
- 浏览器代理：从“读取页面→提取→总结→点击/填表→提交→校验→重试”的闭环。
- 代码助手：Claude Code/DevBots 实践——关键是沙箱、测试与审计。
- 数据工作流：RAG + 结构化工具；引入向量库（Pinecone 等）与质量评估。

## 学习路径与资源清单
### Videos
- LLM Introduction: https://www.youtube.com/watch?v=zjkBMFhNj_g
- LLMs from Scratch: https://www.youtube.com/watch?v=9vM4p9NN0Ts
- Agentic AI Overview (Stanford): https://www.youtube.com/watch?v=kJLiOGle3Lw
- Building and Evaluating Agents: https://www.youtube.com/watch?v=d5EltXhbcfA
- Building Effective Agents: https://www.youtube.com/watch?v=D7_ipDqhtwk
- Building Agents with MCP: https://www.youtube.com/watch?v=kQmXtrmQ5Zg
- Building an Agent from Scratch: https://www.youtube.com/watch?v=xzXdLRUyjUg
- Philo Agents: https://www.youtube.com/playlist?list=PLacQJwuclt_sV-tfZmpT1Ov6jldHl30NR

### Repos
- GenAI Agents: https://github.com/nirdiamant/GenAI_Agents
- Microsoft's AI Agents for Beginners: https://github.com/microsoft/ai-agents-for-beginners
- Prompt Engineering Guide: https://lnkd.in/gJjGbxQr
- Hands-On Large Language Models: https://lnkd.in/dxaVF86w
- AI Agents for Beginners: https://github.com/microsoft/ai-agents-for-beginners
- GenAI Agents: https://lnkd.in/dEt72MEy
- Made with ML: https://lnkd.in/d2dMACMj
- Hands-On AI Engineering: https://github.com/Sumanth077/Hands-On-AI-Engineering
- Awesome Generative AI Guide: https://lnkd.in/dJ8gxp3a
- Designing Machine Learning Systems: https://lnkd.in/dEx8sQJK
- Machine Learning for Beginners (Microsoft): https://lnkd.in/dBj3BAEY
- LLM Course: https://github.com/mlabonne/llm-course

### Guides
- Google's Agent Whitepaper: https://lnkd.in/gFvCfbSN
- Google's Agent Companion: https://lnkd.in/gfmCrgAH
- Building Effective Agents (Anthropic): https://lnkd.in/gRWKANS4
- Claude Code Agentic Coding Practices: https://lnkd.in/gs99zyCf
- OpenAI's Practical Guide to Building Agents: https://lnkd.in/guRfXsFK

### Books
- Understanding Deep Learning: https://udlbook.github.io/udlbook/
- Building an LLM from Scratch: https://lnkd.in/g2YGbnWS
- The LLM Engineering Handbook: https://lnkd.in/gWUT2EXe
- AI Agents: The Definitive Guide - Nicole Koenigstein: https://lnkd.in/dJ9wFNMD
- Building Applications with AI Agents - Michael Albada: https://lnkd.in/dSs8srk5
- AI Agents with MCP - Kyle Stratis: https://lnkd.in/dR22bEiZ
- AI Engineering (O’Reilly): https://www.oreilly.com/library/view/ai-engineering/9781098166298/

### Papers
- ReAct: https://lnkd.in/gRBH3ZRq
- Generative Agents: https://lnkd.in/gsDCUsWm
- Toolformer: https://lnkd.in/gyzrege6
- Chain-of-Thought Prompting: https://lnkd.in/gaK5CXzD
- Tree of Thoughts: https://lnkd.in/gRJdv_iU
- Reflexion: https://lnkd.in/gGFMgjUj
- Retrieval-Augmented Generation Survey: https://lnkd.in/gGUqkkyR

### Courses
- HuggingFace's Agent Course: https://lnkd.in/gmTftTXV
- MCP with Anthropic: https://lnkd.in/geffcwdq
- Building Vector Databases with Pinecone: https://lnkd.in/gCS4sd7Y
- Vector Databases from Embeddings to Apps: https://lnkd.in/gm9HR6_2
- Agent Memory: https://lnkd.in/gNFpC542
- Building and Evaluating RAG apps: https://lnkd.in/g2qC9-mh
- Building Browser Agents: https://lnkd.in/gsMmCifQ
- LLMOps: https://lnkd.in/g7bHU37w
- Evaluating AI Agents: https://lnkd.in/gHJtwF5s
- Computer Use with Anthropic: https://lnkd.in/gMUWg7Fa
- Multi-Agent Use: https://lnkd.in/gU9DY9kj
- Improving LLM Accuracy: https://lnkd.in/gsE-4FvY
- Agent Design Patterns: https://lnkd.in/gzKvx5A4
- Multi Agent Systems: https://lnkd.in/gUayts9s

### Newsletters
- Gradient Ascent: https://lnkd.in/gZbZAeQW
- DecodingML by Paul: https://lnkd.in/gpZPgk7J
- Deep (Learning) Focus by Cameron: https://lnkd.in/gTUNcUVE
- NeoSage by Shivani: https://blog.neosage.io/
- Jam with AI by Shirin and Shantanu: https://lnkd.in/gQXJzuV8
- Data Hustle by Sai: https://lnkd.in/gZpdTTYD

## 落地建议
- 从“单一工具+单目标”的微型代理开始（如浏览器抓取与总结），先打通端到端闭环。
- 引入评估与日志后再增加记忆与多步计划；注意限制权限与速率、保障可回滚。
- 用 MCP 或统一工具接口降低集成复杂度；将评估与迭代纳入常态工作流。