---
title: "Flink 源码阅读：05. 调度中心 (ExecutionGraph)"
date: 2026-01-12T15:00:00+08:00
description: "JobMaster 如何将 JobGraph 转化为可执行的 ExecutionGraph，并申请 Slot。"
tags: [Flink, Source Code, ExecutionGraph, Scheduler]
weight: 5
---

JobMaster 启动后，接管了 JobGraph。它的首要任务是构建 `ExecutionGraph`。

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
