---
title: "ZooKeeper 源码阅读：00. 阅读大纲与学习路线"
date: 2026-01-13T10:00:00+08:00
description: "Apache ZooKeeper 源码阅读系列大纲。从 ZAB 协议到 DataTree，从 Leader 选举到 Watcher 机制，全链路源码解析。"
tags: [ZooKeeper, Source Code, Outline, Roadmap]
weight: 0
---

Apache ZooKeeper 是 Hadoop 生态系统中至关重要的分布式协调服务。本系列将基于 ZooKeeper 3.7+ 源码，深入剖析其底层原理。

## Phase 1: 基础与架构 (Basics & Architecture)
*   **01. 源码编译与环境搭建**: 如何构建 ZooKeeper 源码，IntelliJ IDEA 调试环境配置。
*   **02. 核心架构与模块概览**: Client-Server 架构，核心类 (`QuorumPeer`, `ZooKeeperServer`) 介绍。
*   **03. 启动流程详解**: `QuorumPeerMain` 启动流程，单机与集群模式的初始化差异。

## Phase 2: 存储与通信 (Storage & Networking)
*   **04. 数据模型 (DataTree)**: 内存数据库 `DataTree` 与 `ZKDatabase` 的结构。
*   **05. 持久化机制**: Transaction Log (WAL) 与 Snapshot 的写入与恢复 (`FileTxnSnapLog`)。
*   **06. 网络通信**: 基于 NIO 的 `NIOServerCnxnFactory` 与 Client/Server 通信协议。

## Phase 3: 核心机制 (Core Mechanisms)
*   **07. Session 管理**: Session 的创建、心跳保活、超时检测与分桶策略。
*   **08. Watcher 监听机制**: 客户端注册、服务端触发与通知回调流程。
*   **09. 请求处理链 (RequestProcessor)**: 责任链模式在 ZK 中的应用 (Prep -> Proposal -> Commit -> Final)。

## Phase 4: 一致性与共识 (Consistency & ZAB)
*   **10. Leader 选举 (FastLeaderElection)**: 选举算法详解，服务器状态转换 (LOOKING -> LEADING/FOLLOWING)。
*   **11. ZAB 协议：发现与同步**: Leader 选举后的数据同步流程 (Diff, Trunc, Snap)。
*   **12. ZAB 协议：原子广播**: 两阶段提交 (Proposal -> Commit) 实现强一致性。

## 学习建议
ZooKeeper 代码量相对较少（相比 Hadoop/HBase），是学习分布式一致性协议（Paxos/Raft 变种）的绝佳样本。
1.  **抓住 ZAB**: ZAB 协议是 ZK 的灵魂，理解了 ZAB 就理解了 ZK 的 80%。
2.  **关注状态机**: ZK 本质上是一个复制状态机，关注 `TxnHeader` 和 `zxid` 的流转。
3.  **调试选举**: 启动 3 个 ZK 实例，断点调试 Leader 选举过程，非常有趣。
