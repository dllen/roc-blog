---
title: "ZooKeeper 源码阅读：09. 请求处理链 (RequestProcessor)"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, RequestProcessor]
weight: 9
---

ZK 使用责任链模式处理请求。Leader, Follower, Observer 的链条不同。

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
