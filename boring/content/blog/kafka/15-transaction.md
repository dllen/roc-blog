---
title: "Kafka 源码阅读：15. 事务 (Transaction)"
date: 2026-01-15T10:00:00+08:00
description: "Kafka 事务源码解析：TransactionalId、Transaction Coordinator、Transaction Log、2PC 提交与 Exactly Once Semantics 实现。"
taxonomies:
  tags: [Kafka, Source Code, Transaction, Exactly Once]
weight: 15
tldr: "Kafka 0.11 引入了事务，支持 \"Exactly Once Semantics\" (EOS) 和跨分区写入原子性。"
keywords: ["Kafka", "源码阅读", "15.", "事务", "Transaction", "Source Code", "Exactly Once"]
---
## 0. 本章定位

Kafka 源码阅读：15. 事务 (Transaction)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

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
