---
title: "Flink 源码阅读：11. Operator Chain (算子链)"
date: 2026-01-12T21:00:00+08:00
description: "Flink 如何通过 Operator Chain 减少序列化开销和线程切换。"
tags: [Flink, Source Code, Optimization, Operator Chain]
weight: 11
---

Operator Chain 是 Flink 最重要的优化之一。

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
