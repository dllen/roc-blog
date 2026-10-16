---
title: "ZooKeeper 源码阅读：09. 请求处理链 (RequestProcessor)"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper RequestProcessor 链路源码解析：PrepRequestProcessor → ProposalRequestProcessor → CommitProcessor 顺序。"
taxonomies:
  tags: [ZooKeeper, Source Code, RequestProcessor]
weight: 9
tldr: "ZK 使用责任链模式处理请求。Leader, Follower, Observer 的链条不同。"
keywords: ["ZooKeeper", "源码阅读", "09.", "请求处理链", "RequestProcessor", "Source Code"]
---
## 0. 本章定位

ZooKeeper 源码阅读：09. 请求处理链 (RequestProcessor)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

ZK 使用责任链模式处理请求。Leader, Follower, Observer 的链条不同。

RequestProcessor 链路是 ZK 处理客户端请求的核心，理解 Prep → Proposal → Commit → Final 四阶段对优化集群至关重要。

RequestProcessor 链路是 SyncProcessor / AckProcessor 等的组合，理解后能优化 ZK 的请求处理延迟。

PrepRequestProcessor 是事务性请求的检查站，理解它能避免 ZK 集群写入不一致问题。

## 1. Leader 链
`PrepRequestProcessor` -> `ProposalRequestProcessor` -> `CommitProcessor` -> `ToBeAppliedRequestProcessor` -> `FinalRequestProcessor`

*   **Prep**: 预处理。鉴权，生成 ZXID，创建事务 Header。
*   **Proposal**: 发起 ZAB 提议。将请求发送给所有 Followers。
*   **Commit**: 等待集群过半 Ack。
*   **Final**: 更新内存 DataTree，返回 Response。

## 2. Follower 链
`FollowerRequestProcessor` -> `CommitProcessor` -> `FinalRequestProcessor`

*   **FollowerRequestProcessor**: 
    *   如果是读请求，直接向后传递。
    *   如果是写请求，转发给 Leader。

## 3. Observer 链
`ObserverRequestProcessor` -> `CommitProcessor` -> `FinalRequestProcessor`
*   类似于 Follower，但不参与投票（Ack）。

---
**Next**: [ZooKeeper 源码阅读：10. Leader 选举 (FastLeaderElection)](../10-leader-election/)
