---
title: "ZooKeeper 源码阅读：02. 核心架构与模块概览"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Architecture]
weight: 2
---

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
