---
title: "Flink 源码阅读：05. 调度中心 (ExecutionGraph)"
date: 2026-01-12T15:00:00+08:00
description: "JobMaster 如何将 JobGraph 转化为可执行的 ExecutionGraph，并申请 Slot。"
taxonomies:
  tags: [Flink, Source Code, ExecutionGraph, Scheduler]
weight: 5
tldr: "JobMaster 如何将 JobGraph 转化为可执行的 ExecutionGraph，并申请 Slot。"
keywords: ["Flink", "源码阅读", "05.", "调度中心", "ExecutionGraph", "Source Code", "Scheduler"]
---

JobMaster 启动后，接管了 JobGraph。它的首要任务是构建 `ExecutionGraph`。






## 0. 本章定位

ExecutionGraph 是 Flink 调度的灵魂：把 JobGraph 的每个算子按 Parallelism 展开为 ExecutionVertex，加 IntermediateResultPartition 描述数据通路，加 ExecutionEdge 表达上下游消费关系。读懂它，后续的 Task 调度、背压、Checkpoint Barrier 对齐都有锚点。ExecutionGraph 还维护状态转换：CREATED → SCHEDULED → DEPLOYED → RUNNING → FINISHED。生产中作业重启后卡在 SCHEDULED 状态，多半是 Slot 资源不够——返回 ExecutionGraph 验证。生产调优并行度与 Slot 数匹配时必看。

## 1. ExecutionGraph 结构
`ExecutionGraph` 是 `JobGraph` 的并行化版本。
*   `JobVertex` (JobGraph 节点) -> `ExecutionJobVertex`。
*   根据并行度 (Parallelism)，每个 `ExecutionJobVertex` 会包含多个 `ExecutionVertex`。
*   `ExecutionVertex` 代表一个具体的 SubTask。

例如：一个 map 算子，并行度为 2。
在 JobGraph 中是一个 `JobVertex`。
在 ExecutionGraph 中是一个 `ExecutionJobVertex`，包含 2 个 `ExecutionVertex`。

## 2. Scheduler (调度器)
Flink 默认使用 `DefaultScheduler` (Pipelined Region Scheduling)。
调度器决定何时部署 Task。
*   **Pipelined Region**: 通过 Pipeline 边连接的 Task 集合。必须一起调度（避免死锁）。

## 3. Slot 申请
当 Scheduler 决定调度某个 ExecutionVertex 时，会向 ResourceManager 申请 Slot。
ResourceManager 从空闲的 TaskManager 中分配 Slot，并告知 JobMaster。

## 4. 部署 Task
JobMaster 拿到 Slot 后，向对应的 TaskManager 发送 `SubmitTask` RPC 请求。
TaskManager 收到请求后，启动线程执行 Task。
