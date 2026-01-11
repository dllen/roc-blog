---
title: "Flink 源码阅读：10. StreamGraph 生成"
date: 2026-01-12T20:00:00+08:00
description: "DataStream API 如何转化为流图。StreamGraphGenerator 源码解析。"
tags: [Flink, Source Code, StreamGraph, DataStream]
weight: 10
---

`StreamGraph` 是 Flink 作业的第一层拓扑结构。

## 1. Transformations
用户调用的 API（如 `map`, `filter`, `keyBy`）并不会立即执行，而是生成一个 `Transformation` 对象。
这些 `Transformation` 构成了一棵树。

## 2. StreamGraphGenerator
`StreamGraphGenerator.generate()` 方法遍历 `Transformation` 树。
它将每个 `Transformation` 转化为一个 `StreamNode`，并根据上下游关系添加 `StreamEdge`。

## 3. 设置并行度与 SlotSharingGroup
在此阶段，会确定每个节点的并行度 (Parallelism)。
还会分配 Slot Sharing Group。默认情况下，所有算子都在 "default" 组。
`keyBy` 会引入一个 `PartitionTransformation`，对应 StreamGraph 中的 `PARTITION_HASH` 类型的边。
