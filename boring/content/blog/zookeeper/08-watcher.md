---
title: "ZooKeeper 源码阅读：08. Watcher 监听机制"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper Watcher 机制源码解析：一次性触发、WatcherManager 维护、客户端 WatcherSet 路径匹配与回调派发。"
taxonomies:
  tags: [ZooKeeper, Source Code, Watcher]
weight: 8
tldr: "Watcher 是 ZK 的核心特性，用于实现发布 订阅模式。"
keywords: ["ZooKeeper", "源码阅读", "08.", "Watcher", "监听机制", "Source Code"]
---
## 0. 本章定位

ZooKeeper 源码阅读：08. Watcher 监听机制：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Watcher 是 ZK 的核心特性，用于实现发布-订阅模式。

Watcher 是 ZK 一次性触发机制，理解 WatcherManager 与客户端 WatcherSet 的协作对开发分布式应用至关重要。

生产建议避免在 Watcher 回调中做耗时操作，否则会影响 ZK 集群的整体性能。

## 1. 客户端注册
Client 在调用 `getData("/path", true)` 时，将 Watcher 注册到本地的 `ZKWatchManager`，并向 Server 发送 `WatcherRegistration`。

## 2. 服务端存储 (`WatchManager`)
Server 收到请求后，将 ServerCnxn (代表该客户端连接) 保存到 `DataTree` 的 `WatchManager` 中。
*   `watchTable`: Path -> Set<Watcher> (触发时用)
*   `watch2Paths`: Watcher -> Set<Path> (连接断开清理时用)

## 3. 触发与通知
1.  **触发**: 当节点数据变更（如 `setData`），`DataTree` 查找 `watchTable`，取出所有 Watcher。
2.  **发送**: Server 通过 `ServerCnxn` 发送 `WatcherEvent` (只有 Header，不含数据) 给 Client。
3.  **回调**: Client 收到 Event，从本地 `ZKWatchManager` 找到对应的回调对象 (`Watcher.process()`) 并执行。
4.  **一次性**: 服务端触发后立即删除该 Watcher。如果需要继续监听，Client 必须再次注册。

---
**Next**: [ZooKeeper 源码阅读：09. 请求处理链 (RequestProcessor)](../09-request-processor/)
