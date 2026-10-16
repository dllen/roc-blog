---
title: "Kafka 源码阅读：14. 副本同步机制"
date: 2026-01-15T10:00:00+08:00
description: "Kafka 副本同步机制源码解析：ReplicaFetcherThread、Leader/Follower LEO 与 HW 更新、ISR 维护与数据一致性。"
taxonomies:
  tags: [Kafka, Source Code, Replication, HW]
weight: 14
tldr: "Kafka 的多副本同步是基于 Leader Follower 模型的。"
keywords: ["Kafka", "源码阅读", "14.", "副本同步机制", "Source Code", "Replication", "HW"]
---
## 0. 本章定位

Kafka 源码阅读：14. 副本同步机制：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Kafka 的多副本同步是基于 Leader-Follower 模型的。

## 1. ReplicaFetcherThread

Follower Broker 上运行着 `ReplicaFetcherThread`，它本质上也是一个 Consumer，不断向 Leader 发送 `FetchRequest`。

## 2. HW 更新机制

High Watermark 的更新是保证数据一致性的关键。

1.  **Leader 端**:
    *   Leader 接收消息，写入 Log，更新 LEO。
    *   Follower Fetch 消息。
    *   Leader 根据所有 ISR 副本的 LEO，计算出 HW = min(ISR LEOs)。
2.  **Follower 端**:
    *   Follower 收到 Fetch Response（包含数据和 Leader 的 HW）。
    *   写入 Log，更新 LEO。
    *   更新自己的 HW = min(Local LEO, Leader HW)。

## 3. 截断 (Truncation)

*   **Case 1**: Follower 挂了重启，LEO > HW。需要截断到 HW，然后开始同步。
*   **Case 2**: Leader 挂了，新 Leader 选出。旧 Leader 恢复后变为 Follower，如果它的 LEO 高于新 Leader，也需要截断。

---
**Next**: [Kafka 源码阅读：15. 事务 (Transaction)](../15-transaction/)
