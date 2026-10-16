---
title: "New framework for critical thinking prompts:"
date: "2025-11-12"
description: "批判性思维 Prompt 框架：让 LLM 对自己的输出进行多角度质疑与反驳的系统化提示词模板。"
taxonomies:
  tags: [Prompt, X]
categories: [Prompt]
slug: "new-framework-for-critical-thinking-prompts"
tldr: "Prompt New framework for critical thinking prompts: 1."
keywords: ["New", "framework", "for", "critical", "thinking", "prompts", "Prompt", "X"]
---
## 0. 本章定位

New framework for critical thinking prompts:：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

框架通过让 LLM 对自己的输出进行多角度质疑，从而显著提升答案的可靠性与深度。适用于事实核对、决策分析等场景。配合 ReAct 或 Self-consistency 可获得更稳定的结果。本框架的核心思想是：让 LLM 先回答，再让 LLM 扮演反对者批评，最后综合两者。

本框架的实操要点：先让 LLM 生成答案 A，再让 LLM 以怀疑者身份生成反对意见 B，最后让 LLM 综合 A + B 输出最终答案。三轮对话质量明显高于单轮直接回答。

此框架适用于高风险决策场景，例如医疗建议、法律咨询、投资决策等需要双重验证的场景。

## Prompt
New framework for critical thinking prompts:

1. Clarify the question
2. Analyze assumptions
3. Evaluate evidence
4. Consider alternatives
5. Draw conclusions

Use this 5-step process for better decision-making prompts.

## 互动数据
- [原始链接](https://x.com/lijigang_com/status/1234567891)
- 发布时间：2025-11-12
- 点赞：28
- 转发：9
- 评论：5
