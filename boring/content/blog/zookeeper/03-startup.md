---
title: "ZooKeeper 源码阅读：03. 启动流程详解"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Startup]
weight: 3
---

## 1. 入口：`QuorumPeerMain`

ZK 的启动类是 `org.apache.zookeeper.server.quorum.QuorumPeerMain`。

## 2. 启动步骤

1.  **解析配置**: 加载 `zoo.cfg`。
2.  **判断模式**:
    *   如果 servers 列表只有一个（或者是 Standalone 模式），启动 `ZooKeeperServerMain`。
    *   如果是集群模式，继续执行 `runFromConfig`。
3.  **注册 JMX**: 用于监控。
4.  **创建 `QuorumPeer`**: 这是核心线程。
5.  **加载数据**: `FileTxnSnapLog.restore()`，从磁盘恢复内存数据 `DataTree`，并获取最大的 `zxid`。
6.  **启动 `QuorumPeer` 线程**:
    *   进入 `super.start()`。
    *   启动 `AdminServer` (Jetty)。
    *   启动 `CnxnFactory` (监听 Client 端口)。
    *   开始选举循环 (`run()` 方法)。

## 3. `QuorumPeer.run()` 循环

这是 ZK 节点的主循环：
```java
while (running) {
    switch (getPeerState()) {
        case LOOKING:
            // 发起 Leader 选举
            makeLeader = electionAlg.lookForLeader();
            break;
        case OBSERVING:
            observer.observeLeader();
            break;
        case FOLLOWING:
            follower.followLeader();
            break;
        case LEADING:
            leader.lead();
            break;
    }
}
```

---
**Next**: [ZooKeeper 源码阅读：04. 数据模型 (DataTree)](../04-datatree/)
