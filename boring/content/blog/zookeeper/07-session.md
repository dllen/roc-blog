---
title: "ZooKeeper 源码阅读：07. Session 管理"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Session]
weight: 7
---

Session 是 ZK 中临时节点 (Ephemeral Node) 的基础。

## 1. Session 创建
Client 发送 `ConnectRequest`，Server 生成全局唯一的 SessionId。
*   **SessionId 生成算法**: 基于时间戳 + ServerId，保证全局唯一。

## 2. Session Tracker (`SessionTrackerImpl`)
Server 端负责管理所有 Session 的生命周期。

### 2.1 分桶策略 (Bucket)
为了高效检测过期，ZK 将 Session 按照过期时间点 (ExpirationTime) 分桶。
*   `Map<Long, SessionSet> expiryMap`: Key 是过期时间戳（TickTime 的整数倍）。
*   **Touch Session**: 当 Client 发送心跳或请求时，Server 更新该 Session 的 ExpirationTime，将其移动到下一个 Bucket 中。

### 2.2 过期检测线程
Server 只需要检查当前时间点之前的 Bucket，如果有 Session，直接关闭（expire）。这比遍历所有 Session 效率高得多。

## 3. Session 激活
客户端的 `SendThread` 会定期发送 Ping 请求（如果空闲）。
*   `LearnerHandler` (Follower 端) 收到 Ping，会转发给 Leader（只有 Leader 能更新 Session 过期时间）。

---
**Next**: [ZooKeeper 源码阅读：08. Watcher 监听机制](../08-watcher/)
