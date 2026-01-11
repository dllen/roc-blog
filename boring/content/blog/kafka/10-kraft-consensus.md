---
title: "Kafka 源码阅读：10. KRaft 共识协议"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, KRaft, Raft, Controller]
weight: 10
---

为了解决 ZK 依赖带来的问题，Kafka 3.x 引入了 KRaft (Kafka Raft) 模式，彻底移除了 ZooKeeper。

## 1. 架构变革

*   **Controller Quorum**: 一组 Controller 节点组成 Raft 集群。
*   **Metadata Log**: 元数据不再存 ZK，而是作为一个内部 Topic (`__cluster_metadata`) 存储在 Kafka 内部。

## 2. 核心组件

*   **QuorumController**: 新版 Controller。
*   **RaftClient**: 处理 Raft 协议（Leader 选举、日志复制）。
*   **MetadataLoader**: Broker 节点从 Metadata Log 中回放元数据。

## 3. 优势

1.  **更快的 Failover**: 备用 Controller 一直在同步 Metadata Log，切换时几乎不需要加载时间。
2.  **百万级分区**: 元数据存储在 Log 中，扩展性更好。
3.  **部署简单**: 不需要维护 ZK 集群。

---
**Next**: [Kafka 源码阅读：11. GroupCoordinator](../11-coordinator/)
