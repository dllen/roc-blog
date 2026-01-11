---
title: "Kafka 源码阅读：09. 传统 Controller"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Controller, ZooKeeper]
weight: 9
---

在 Kafka 2.8 之前（以及 3.x 的 ZK 模式），Controller 是集群的核心管理器，强依赖 ZooKeeper。

## 1. 选举机制

所有 Broker 启动时，都会尝试在 ZK 创建临时节点 `/controller`。
*   创建成功的 Broker 成为 Controller。
*   其他 Broker 监听该节点，一旦 Controller 宕机（节点消失），触发重新选举。

## 2. 职责

*   **Partition State Machine**: 管理分区状态 (New, Online, Offline, NonExistent)。
*   **Replica State Machine**: 管理副本状态。
*   **Leader Election**: 当 Leader 挂掉，从 ISR 中选出新 Leader。
*   **Metadata Update**: 将最新的元数据广播给所有 Broker (`UpdateMetadataRequest`)。

## 3. 性能瓶颈

传统 Controller 是单线程处理所有事件的。当集群规模很大（Partition 数万）时：
1.  **Failover 慢**: Controller 切换需要从 ZK 加载所有元数据，非常耗时。
2.  **ZK 压力大**: 大量写入 ZK。

---
**Next**: [Kafka 源码阅读：10. KRaft 共识协议](../10-kraft-consensus/)
