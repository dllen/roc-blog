---
title: "Flink 源码阅读：04. 提交流程 (JobGraph)"
date: 2026-01-12T14:00:00+08:00
description: "Client 端如何将用户代码转化为 JobGraph，并提交给 Dispatcher。"
taxonomies:
  tags: [Flink, Source Code, JobGraph, Submission]
weight: 4
tldr: "Client 端如何将用户代码转化为 JobGraph，并提交给 Dispatcher。"
keywords: ["Flink", "源码阅读", "04.", "提交流程", "JobGraph", "Source Code", "Submission"]
---

当我们执行 `bin/flink run` 时，发生了什么？








## 实战建议

本章读完应能独立画出 flink run → StreamGraph → JobGraph 的完整链路，并解释为什么 Chain 必须在 JobGraph 阶段完成。

## 0. 本章定位

flink run 命令背后藏着三层拓扑转换：用户算子链 → StreamGraph（逻辑视图）→ JobGraph（优化后视图）→ ExecutionGraph（运行时并行视图）。本章聚焦前两步：StreamGraphGenerator 怎么从用户 API 生成 StreamGraph，StreamingJobGraphGenerator 如何应用 Chain / SlotSharingGroup 优化得到 JobGraph。理解这两步对后续调优至关重要——disableChain / slotSharingGroup / ChainingStrategy 等参数都只能在这一层注入。生产中遇到算子没合并或 Slot 分配异常时，回到 JobGraph 是最快的定位路径。建议先熟悉用户 API（DataStream / SQL），再读源码。

## 1. StreamGraph 的生成
用户代码中的 `env.execute()` 是起点。
`StreamGraphGenerator` 遍历用户编写的算子链，生成 `StreamGraph`。
这是一个逻辑拓扑图，包含 `StreamNode` 和 `StreamEdge`。

## 2. JobGraph 的生成
`StreamGraph` 还不能直接运行，需要转化为 `JobGraph`。
`StreamingJobGraphGenerator.createJobGraph()` 负责这一步。
**关键优化：Operator Chain (算子链)**
*   如果两个算子可以 Chain 在一起（例如 map -> filter），它们会被合并成一个 `JobVertex`。
*   `JobVertex` 是 JobGraph 的节点。
*   每个 `JobVertex` 包含编译后的字节码（Serialized JobInformation）。

## 3. 提交到集群
Client (如 `RestClusterClient`) 将 JobGraph 序列化，并通过 HTTP/REST 发送给 Master 节点的 `Dispatcher`。
Dispatcher 收到后，会为这个 Job 创建一个 `JobMaster`。

## 4. 关键类
*   `StreamGraph`: 逻辑流图。
*   `JobGraph`: 物理作业图（经过 Chain 优化）。
*   `JobVertex`: JobGraph 的节点，对应一个或多个 Operator。
