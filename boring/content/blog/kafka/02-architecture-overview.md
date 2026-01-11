---
title: "Kafka 源码阅读：02. 架构概览"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Architecture, Concepts]
weight: 2
---

在深入代码之前，必须统一核心术语的定义。

## 1. 逻辑架构

*   **Topic**: 逻辑上的消息队列。
*   **Partition**: 物理上的分片。一个 Topic 由多个 Partition 组成，实现负载均衡。
*   **Offset**: 消息在 Partition 中的唯一序号，单调递增。

## 2. 物理架构

*   **Broker**: Kafka 服务节点。
*   **Controller**: 集群的大脑，负责元数据管理、Partition 分配、Leader 选举。
*   **Coordinator**: 负责消费者组管理 (GroupCoordinator) 和事务管理 (TransactionCoordinator)。

## 3. 副本机制 (Replication)

Kafka 的高可用依赖于多副本。

*   **Leader Replica**: 处理读写请求。
*   **Follower Replica**: 被动从 Leader 拉取数据，不处理客户端请求（除非开启 Follower Fetching）。
*   **AR (Assigned Replicas)**: 分区的所有副本。
*   **ISR (In-Sync Replicas)**: 与 Leader 保持同步的副本集合。只有 ISR 中的副本才有资格被选为新 Leader。
*   **OSR (Out-of-Sync Replicas)**: 滞后的副本。

## 4. 水位 (Watermark)

*   **LEO (Log End Offset)**: 日志末端位移，下一条消息写入的位置。
*   **HW (High Watermark)**: 高水位，ISR 中所有副本 LEO 的最小值。HW 之前的消息才被认为是 Committed 的，对消费者可见。

---
**Next**: [Kafka 源码阅读：03. Producer 初始化与 Metadata 更新](../03-producer-init/)
