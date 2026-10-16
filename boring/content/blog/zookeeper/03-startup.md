---
title: "ZooKeeper 源码阅读：03. 启动流程详解"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper Server 启动流程源码解析：配置文件解析、内存数据库初始化、选举启动、Leader/Follower 状态切换。"
taxonomies:
  tags: [ZooKeeper, Source Code, Startup]
weight: 3
tldr: "1. 入口： ZK 的启动类是 。 2. 启动步骤 1. 解析配置 : 加载 。"
keywords: ["ZooKeeper", "源码阅读", "03.", "启动流程详解", "Source Code", "Startup"]
---
## 0. 本章定位

ZooKeeper 源码阅读：03. 启动流程详解：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

ZK Server 启动涉及配置加载、内存数据库初始化、选举启动三个阶段；建议本地启动 Standalone 实例观察日志。

Standalone 与 Quorum 模式启动流程略有差异，集群模式下选举阶段更复杂，建议先熟悉单机流程。

Quorum 模式下选举阶段耗时取决于集群大小，生产环境建议 5 节点以上以容忍 2 节点故障。

本地启动建议用 docker-compose 起一个 3 节点集群，从源码 build 到 leader 选出通常在 5 分钟内完成。

生产环境启动前建议预热 JVM 并加载 ZK 的 native 库（如 Netty），可缩短冷启动时间 30% 以上。

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
