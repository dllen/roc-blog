---
title: "Kafka 源码阅读：10. KRaft 共识协议"
date: 2026-01-15T10:00:00+08:00
description: "Kafka KRaft 共识协议源码解析：Controller Quorum + Metadata Log 取代 ZooKeeper、RaftClient 与 QuorumController 实现。"
taxonomies:
  tags: [Kafka, Source Code, KRaft, Raft, Controller]
weight: 10
tldr: "为了解决 ZK 依赖带来的问题，Kafka 3.x 引入了 KRaft (Kafka Raft) 模式，彻底移除了 ZooKeeper。"
keywords: ["Kafka", "源码阅读", "10.", "KRaft", "共识协议", "Source Code", "Raft", "Controller"]
---
## 0. 本章定位

Kafka 源码阅读：10. KRaft 共识协议：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

为了解决 ZK 依赖带来的问题，Kafka 3.x 引入了 KRaft (Kafka Raft) 模式，彻底移除了 ZooKeeper。

KRaft 是 Kafka 3.x 的默认共识协议，去除 ZooKeeper 依赖简化了部署；建议配合 Kafka 官方文档阅读 MetaLog 的设计。

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
