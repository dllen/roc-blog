---
title: "ZooKeeper 源码阅读：02. 核心架构与模块概览"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper 架构概览：文件系统 + 通知机制的数据模型、Leader/Follower/Observer 角色、ZXID 与 Zab 协议基础。"
taxonomies:
  tags: [ZooKeeper, Source Code, Architecture]
weight: 2
tldr: "1. 模块结构 : 核心服务端代码，包含 Leader 选举、ZAB 协议、DataTree 等。"
keywords: ["ZooKeeper", "源码阅读", "02.", "核心架构与模块概览", "Source Code", "Architecture"]
---
## 0. 本章定位

ZooKeeper 源码阅读：02. 核心架构与模块概览：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

ZooKeeper 架构核心是 Zab 协议 + 内存树 + Watcher 三件套，理解它们能解释 ZK 为何适合做分布式协调服务。

推荐阅读 Chubby 与 Paxos Made Simple 两篇论文，对理解 ZK 设计取舍非常有帮助。

## 1. 模块结构

*   `zookeeper-server`: 核心服务端代码，包含 Leader 选举、ZAB 协议、DataTree 等。
*   `zookeeper-client`: 客户端代码 (C 语言实现)。
*   `zookeeper-jute`: 序列化框架（类似于 Protobuf/Thrift，ZK 自己造的轮子）。
*   `zookeeper-recipes`: 常用场景的实现（如分布式锁、Leader 选举）。

## 2. 核心类概览

### 2.1 服务端
*   **`QuorumPeer`**: 代表一个 ZK 节点。它管理着节点的生命周期，维护着 Peer 的状态 (LOOKING, LEADING, FOLLOWING)。
*   **`ZooKeeperServer`**: 单机版 Server 实现。
*   **`LeaderZooKeeperServer` / `FollowerZooKeeperServer`**: 集群版 Server 实现。
*   **`FileTxnSnapLog`**: 负责 TxnLog 和 Snapshot 的 IO 操作。
*   **`DataTree`**: 内存数据结构，一颗 Concurrent 的 Trie 树。

### 2.2 客户端
*   **`ZooKeeper`**: 客户端入口类。
*   **`ClientCnxn`**: 负责网络通信，维护两个核心线程 `SendThread` (IO) 和 `EventThread` (回调)。

## 3. 总体架构
Client -> NIOServerCnxn -> RequestProcessor Chain -> DataTree -> TxnLog

---
**Next**: [ZooKeeper 源码阅读：03. 启动流程详解](../03-startup/)
