---
title: "ZooKeeper 源码阅读：07. Session 管理"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper Session 管理源码解析：SessionTracker、SessionID 生成、过期检查（1/3 timeout）、临时节点清理。"
taxonomies:
  tags: [ZooKeeper, Source Code, Session]
weight: 7
tldr: "Session 是 ZK 中临时节点 (Ephemeral Node) 的基础。"
keywords: ["ZooKeeper", "源码阅读", "07.", "Session", "管理", "Source Code"]
---
## 0. 本章定位

ZooKeeper 源码阅读：07. Session 管理：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

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
