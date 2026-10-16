---
title: "Flink 源码阅读：10. StreamGraph 生成"
date: 2026-01-12T20:00:00+08:00
description: "DataStream API 如何转化为流图。StreamGraphGenerator 源码解析。"
taxonomies:
  tags: [Flink, Source Code, StreamGraph, DataStream]
weight: 10
tldr: "DataStream API 如何转化为流图。StreamGraphGenerator 源码解析。"
keywords: ["Flink", "源码阅读", "10.", "StreamGraph", "生成", "Source Code", "DataStream"]
---

`StreamGraph` 是 Flink 作业的第一层拓扑结构。








## 实战建议

生产中遇到 Pipeline 大小异常，先 dump StreamGraph 看 Chain 是否被错误合并；理解这一层是后续调优的前提。

进一步可在本地 fork Flink 源码，单步调试 StreamGraphGenerator 观察 StreamNode / StreamEdge 的创建时机。

## 0. 本章定位

StreamGraph 是用户 API 到 JobGraph 的中间表示。本章讲 Transformation 树如何转 StreamGraph（StreamNode + StreamEdge）：每个算子变成一个 StreamNode，连边记录并行度、SharingGroup、ChainingStrategy。理解这一步是理解算子链和优化器的基础。StreamGraphGenerator 还做算子 ID 分配、虚拟算子插入（CHAIN_HEAD / CHAIN_TAIL），决定了最终 Task 数与拓扑结构。生产中遇到算子合并异常，先看 StreamGraph 验证 ChainingStrategy 设置。

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

进一步可在本地 fork Flink 1.18 或更新分支的源码，编写单测调用 StreamGraphGenerator 验证生成结果。
