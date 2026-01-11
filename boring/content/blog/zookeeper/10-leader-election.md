---
title: "ZooKeeper 源码阅读：10. Leader 选举 (FastLeaderElection)"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Leader Election, ZAB]
weight: 10
---

FastLeaderElection (FLE) 是 ZK 默认的选举算法。

## 1. 核心概念
*   **myid**: 服务器 ID。
*   **zxid**: 事务 ID (Epoch + Counter)。
*   **LogicalClock**: 选举轮次。
*   **State**: LOOKING, FOLLOWING, LEADING, OBSERVING。

## 2. 票据结构 (`Vote`)
每个节点广播自己的选票：`(sid, zxid, electionEpoch)`。
*   **优先规则**:
    1.  `electionEpoch` 大的优先。
    2.  `zxid` 大的优先（数据越新越好）。
    3.  `sid` 大的优先（ID 大者胜出）。

## 3. 选举流程 (`lookForLeader`)
1.  **自荐**: 刚开始，每个节点都投自己，并广播给所有人。
2.  **接收投票**: 从 `WorkerReceiver` 队列读取其他人的投票。
3.  **PK**: 比较对方的票和自己的票（根据优先规则）。
    *   如果对方更优，更新自己的选票为对方，并再次广播。
    *   如果自己更优，忽略对方。
4.  **统计**: 检查收到的选票中，是否有一个候选人获得了“过半” (Quorum) 支持。
5.  **确认**: 如果过半，且等待一段时间无更优票，则选举结束，更新状态。

---
**Next**: [ZooKeeper 源码阅读：11. ZAB 协议：发现与同步](../11-zab-discovery-sync/)
