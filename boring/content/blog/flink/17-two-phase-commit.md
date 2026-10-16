---
title: "Flink 源码阅读：17. Two-Phase Commit (2PC)"
date: 2026-01-13T03:00:00+08:00
description: "Flink 如何实现端到端的 Exactly-Once？Sink 端的两阶段提交详解。"
taxonomies:
  tags: [Flink, Source Code, 2PC, Exactly-Once, Kafka]
weight: 17
tldr: "Flink 如何实现端到端的 Exactly-Once？Sink 端的两阶段提交详解。"
keywords: ["Flink", "源码阅读", "17.", "Two-Phase", "Commit", "2PC", "Source Code", "Exactly-Once"]
---

Flink 内部通过 Checkpoint 保证了状态的 Exactly-Once。
但要实现端到端（End-to-End）的 Exactly-Once，还需要 Sink 端的配合。




## 0. 本章定位

端到端 Exactly-Once 需要 Sink 端配合 Checkpoint 做两阶段提交。本章讲 TwoPhaseCommitSinkFunction 抽象：beginTransaction / invoke / preCommit / commit / abort / abortPending 五方法，对应 Checkpoint 的几个阶段。Kafka Sink 用 TransactionalId 实现 2PC；MySQL Sink 用 XA 事务；Pulsar Sink 用 BookKeeper 事务。理解 2PC 才能写出不丢不重的 Sink——生产中数据丢失多半是 Sink 端没正确实现 preCommit/abort。

## 1. TwoPhaseCommitSinkFunction
Flink 提供了抽象类 `TwoPhaseCommitSinkFunction`。
利用 Checkpoint 的生命周期来实现 2PC。

## 2. 流程详解
1.  **beginTransaction**: 在 Checkpoint 开始前，开启一个事务（如 Kafka Producer 的事务）。
2.  **preCommit**: 在 Checkpoint 完成 Snapshot 时，预提交事务（Flush 数据，但不 Commit）。
3.  **commit**: 当 JobMaster 确认**所有** Task 的 Checkpoint 都成功后，通知 Sink 执行 `notifyCheckpointComplete`。Sink 正式提交事务。
4.  **abort**: 如果 Checkpoint 失败，回滚事务。

## 3. Kafka Sink 案例
FlinkKafkaProducer 利用 Kafka 的 Transaction API。
*   Pre-commit: 写入带有 Transaction ID 的数据。
*   Commit: 发送 commitTransaction 指令。
Consumer 只有配置 `isolation.level=read_committed` 才能看到这些数据。
