---
title: "Flink 源码阅读：16. Checkpoint 核心流程"
date: 2026-01-13T02:00:00+08:00
description: "Chandy-Lamport 算法在 Flink 中的实现。Barrier 对齐与异步快照。"
tags: [Flink, Source Code, Checkpoint, Fault Tolerance]
weight: 16
---

Flink 的容错机制基于 **Chandy-Lamport 分布式快照算法**。

## 1. Barrier 注入
CheckpointCoordinator 向所有的 Source Task 发送 `CheckpointBarrier`。
Barrier 随着数据流向下游流动。

## 2. Barrier 对齐 (Alignment)
对于多输入的 Task（如 KeyBy 后的 Reduce）：
*   Task 必须等待**所有**输入通道的 Barrier 都到达，才能进行 Snapshot。
*   **Exactly-Once**: 在等待期间，已收到 Barrier 的通道的数据会被**缓存**起来，不能处理（否则状态就“超前”了）。
*   **At-Least-Once**: 不等待，直接处理。可能导致数据重复。
*   **Unaligned Checkpoint**: 不对齐。直接将 Barrier 之前的数据（In-flight data）也作为 Snapshot 的一部分保存下来。大大降低了反压下的 Checkpoint 超时率。

## 3. 异步快照 (Async Snapshot)
StateBackend 执行 Snapshot 时，通常分为同步和异步两个阶段。
*   **同步阶段**: 暂停处理数据，Copy On Write 或者是 RocksDB Iterator。耗时极短。
*   **异步阶段**: 将数据上传到 HDFS/S3。Task 继续处理数据。
