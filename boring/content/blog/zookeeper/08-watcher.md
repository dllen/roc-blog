---
title: "ZooKeeper 源码阅读：08. Watcher 监听机制"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Watcher]
weight: 8
---

Watcher 是 ZK 的核心特性，用于实现发布-订阅模式。

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
