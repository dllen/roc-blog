---
title: "Kafka 源码阅读：00. 阅读大纲与学习路线"
date: 2026-01-15T10:00:00+08:00
description: "Apache Kafka 源码阅读系列大纲。从 Scala 到 Java，从 ZK 到 KRaft，深入剖析消息系统的王者。"
tags: [Kafka, Source Code, Outline, Roadmap]
weight: 0
---

Apache Kafka 是分布式流处理平台的标杆。本系列将基于 Kafka 3.x 源码（Scala + Java），深入剖析其底层原理。

## Phase 1: 基础与架构 (Architecture & Basics)
*   **01. 环境搭建与源码编译**: 如何构建 Kafka 源码（Gradle），IntelliJ IDEA 调试环境配置。
*   **02. 架构概览**: Broker, Topic, Partition, Replica, AR/ISR, HW/LEO 核心概念解析。

## Phase 2: 生产者 (Producer)
*   **03. Producer 初始化与 Metadata 更新**: `KafkaProducer` 的启动与元数据拉取。
*   **04. RecordAccumulator**: 消息批处理机制，内存池 (`BufferPool`) 设计。
*   **05. Sender 线程**: 网络 I/O，`InFlightRequests`，以及幂等性发送原理。

## Phase 3: Broker 核心 (Broker Core)
*   **06. 网络层设计**: Reactor 模式在 Kafka 中的应用 (`SocketServer`, `RequestChannel`, `KafkaApis`)。
*   **07. 日志存储 (Log Storage)**: `Log`, `LogSegment`, 稀疏索引 (`OffsetIndex`, `TimeIndex`) 的实现。
*   **08. 延时操作 (Purgatory)**: `DelayedOperationPurgatory` 与时间轮 (`TimingWheel`) 源码分析。

## Phase 4: 集群控制与共识 (Controller & Consensus)
*   **09. 传统 Controller**: 基于 ZooKeeper 的集群管理，分区状态机与副本状态机。
*   **10. KRaft 共识协议**: 去 ZooKeeper 之路，基于 Raft 的元数据管理 (`QuorumController`)。

## Phase 5: 消费者 (Consumer)
*   **11. GroupCoordinator**: 消费组协调器，组成员管理。
*   **12. Rebalance 机制**: 消费者重平衡全流程 (`JoinGroup`, `SyncGroup`) 及分区分配策略。
*   **13. Fetcher**: 消息拉取流程，Zero-Copy 零拷贝技术的应用。

## Phase 6: 进阶特性 (Advanced)
*   **14. 副本同步机制**: Follower 如何从 Leader 拉取数据，HW 的更新机制与截断逻辑。
*   **15. 事务 (Transaction)**: 跨分区事务原子性，Transaction Coordinator 与 Transaction Log。

## 学习建议
Kafka 源码混合了 Scala (Broker 端核心) 和 Java (客户端及新版组件)。
1.  **语言基础**: 需要具备一定的 Scala 语法基础。
2.  **重点关注**: `Log` 存储结构和 `Network` 网络模型是 Kafka 高性能的基石。
3.  **版本差异**: 关注 KRaft 模式（3.x+）与 ZK 模式（旧版）的区别。
