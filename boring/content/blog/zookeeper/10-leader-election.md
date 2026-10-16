---
title: "ZooKeeper 源码阅读：10. Leader 选举 (FastLeaderElection)"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper Leader 选举源码解析：FastLeaderElection 投票轮次、ZXID 与 myid 比较、QuorumServer 状态切换。"
taxonomies:
  tags: [ZooKeeper, Source Code, Leader Election, ZAB]
weight: 10
tldr: "FastLeaderElection (FLE) 是 ZK 默认的选举算法。"
keywords: ["ZooKeeper", "源码阅读", "10.", "Leader", "选举", "FastLeaderElection", "Source Code", "Leader Election"]
---
## 0. 本章定位

ZooKeeper 源码阅读：10. Leader 选举 (FastLeaderElection)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

FastLeaderElection (FLE) 是 ZK 默认的选举算法。

FastLeaderElection 是 ZK 选举核心算法，投票轮次 + ZXID + myid 三者决定选举结果；建议对照源码中的 Vote 类。

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
