---
title: "Flink 源码阅读：11. Operator Chain (算子链)"
date: 2026-01-12T21:00:00+08:00
description: "Flink 如何通过 Operator Chain 减少序列化开销和线程切换。"
taxonomies:
  tags: [Flink, Source Code, Optimization, Operator Chain]
weight: 11
tldr: "Flink 如何通过 Operator Chain 减少序列化开销和线程切换。"
keywords: ["Flink", "源码阅读", "11.", "Operator", "Chain", "算子链", "Source Code", "Optimization"]
---

Operator Chain 是 Flink 最重要的优化之一。








## 实战建议

Operator Chain 是 Flink 性能优势的核心之一；建议在自己的作业上跑 disableChain() 对比，理解 Chain 的实际收益。

阅读 OperatorChain 类时关注 startNewChain / disableChaining 等方法，是 Chain 行为的入口。

## 0. 本章定位

Operator Chain 是 Flink 最重要的优化之一：满足 Forward 连接 + 同并行度 + 同 Slot Group + 未禁用 Chain 条件的算子可合并为一个 Task，省去序列化 / 网络传输 / 线程切换开销。本章讲 Chain 判定逻辑（StreamingJobGraphGenerator）与两种实现方式（同线程 / 算子链）。生产中加个 map 算子性能不变，多半就是 Chain 命中。遇到 Chain 失败导致性能骤降，检查 disableChain 与 ChainingStrategy 配置。生产中遇到非预期的 Chain 行为可设 disableChain 强制拆开调试。

## 1. 什么是 Chain？
如果两个算子：
1.  没有 Shuffle (Forward 连接)。
2.  并行度相同。
3.  在同一个 Slot Sharing Group。
4.  没有被显式 disableChain。

那么它们可以合并成一个 Task。

## 2. 源码实现
在 `StreamingJobGraphGenerator` 中实现。
它会遍历 StreamGraph，寻找可以 Chain 的边。
如果可以 Chain，上游和下游算子会被放入同一个 `JobVertex`。

## 3. 运行时表现
在运行时，Chain 起来的算子运行在同一个线程中。
数据传递不再经过 Netty，甚至不再经过序列化/反序列化。
上游算子直接调用下游算子的 `processElement()` 方法。
这使得 Flink 的性能远超 Storm 等传统引擎。
