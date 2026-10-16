---
title: "🧠 Prompt Engineering Tip: Always provide context a"
date: "2025-11-13"
description: "Prompt 实战技巧（持续上下文）：通过持续注入上下文信息提升 LLM 输出一致性的工程实践。"
taxonomies:
  tags: [Prompt, X]
categories: [Prompt]
slug: "prompt-engineering-tip-always-provide-context-a"
tldr: "Prompt 🧠 Prompt Engineering Tip: Always provide context and examples."
keywords: ["🧠", "Prompt", "Engineering", "Tip", "Always", "provide", "context", "X"]
---
## 0. 本章定位

🧠 Prompt Engineering Tip: Always provide context a：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

持续上下文注入是工业级 Prompt 工程的基础：通过对话历史摘要、关键事实清单、用户偏好档案三种手段，让 LLM 在长对话中保持一致性。生产环境建议建立自动上下文压缩机制，避免每次对话都从零开始。

持续上下文的关键是摘要而非全量：每 10 轮对话做一次摘要，把摘要而非完整历史传给后续 LLM，可大幅降低 token 成本且不损失一致性。

生产建议在每轮对话后用 LLM 自动生成结构化摘要，把用户偏好、关键决策、未解决问题分别记录。

长对话中 token 累计是最常见成本失控来源，结构化摘要是工业实践的关键工程化手段。

## Prompt
🧠 Prompt Engineering Tip: Always provide context and examples. 

Instead of: 'Write a summary'
Try: 'Write a 3-sentence summary of this article for a busy executive who needs the key points quickly.'

Context + Examples = Better Results

## 互动数据
- [原始链接](https://x.com/lijigang_com/status/1234567890)
- 发布时间：2025-11-13
- 点赞：42
- 转发：15
- 评论：8
