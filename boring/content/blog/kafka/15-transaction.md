---
title: "Kafka 源码阅读：15. 事务 (Transaction)"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Transaction, Exactly Once]
weight: 15
---

Kafka 0.11 引入了事务，支持 "Exactly Once Semantics" (EOS) 和跨分区写入原子性。

## 1. 核心概念

*   **TransactionalId**: 用户指定的唯一 ID，用于跨 Session 恢复事务。
*   **Transaction Coordinator**: 服务端组件，管理事务状态。
*   **Transaction Log**: 内部 Topic (`__transaction_state`)，持久化事务状态。

## 2. 事务流程

1.  **Init**: Producer 向 Coordinator 注册 TransactionalId，获取 PID 和 Epoch。
2.  **Add Partitions**: Producer 告诉 Coordinator 要写哪些 TopicPartition。
3.  **Produce**: 发送消息（带有 PID 和 Epoch）。
4.  **Commit/Abort**: Producer 发送结束请求。
    *   Coordinator 写入 `PREPARE_COMMIT` 到 Transaction Log。
    *   Coordinator 向所有涉及的分区 Leader 发送 `WriteTxnMarkersRequest`（写入 Commit/Abort Marker）。
    *   Coordinator 写入 `COMPLETE_COMMIT`。

## 3. 隔离级别

Consumer 端通过 `isolation.level` 控制可见性。
*   **read_uncommitted**: 可见所有消息。
*   **read_committed**: 只可见已 Commit 的消息（通过 LSO - Last Stable Offset 控制）。

---
**End**: [回到目录](../)
