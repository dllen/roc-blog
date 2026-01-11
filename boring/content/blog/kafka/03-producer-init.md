---
title: "Kafka 源码阅读：03. Producer 初始化与 Metadata 更新"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Producer, Metadata]
weight: 3
---

Kafka Producer 是一个复杂的客户端，它是线程安全的，并且内部维护了一个 `Sender` 线程进行异步发送。

## 1. 核心组件

在 `new KafkaProducer()` 时，会初始化以下组件：
*   **Partitioner**: 分区器，决定消息发往哪个 Partition。
*   **Metadata**: 元数据管理器，维护 Topic 的 Partition 信息、Leader 位置等。
*   **RecordAccumulator**: 消息累加器，核心缓冲组件。
*   **Sender**: 后台 I/O 线程。
*   **NetworkClient**: 网络通信客户端。

## 2. 消息发送流程 (`doSend`)

1.  **WaitOnMetadata**: 确保有目标 Topic 的元数据。如果没有，阻塞等待更新。
2.  **Serialize**: 序列化 Key 和 Value。
3.  **Partition**: 计算目标 Partition。
4.  **Append**: 将消息追加到 `RecordAccumulator`。
    *   如果 Batch 满了，唤醒 Sender 线程。
5.  **Wakeup Sender**: 即使没满，也可能需要唤醒 Sender (视情况而定)。

## 3. Metadata 更新机制

Producer 并不是每次发送都去 Broker 拉取元数据。
*   **Lazy Loading**: 只有第一次用到某个 Topic 时才去拉取。
*   **Periodic Refresh**: 默认每隔一段时间 (`metadata.max.age.ms`) 强制刷新。
*   **Failure Trigger**: 当发生发送失败（如 NotLeaderForPartition）时，触发强制刷新。

---
**Next**: [Kafka 源码阅读：04. RecordAccumulator](../04-record-accumulator/)
