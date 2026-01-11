---
title: "Kafka 源码阅读：12. Rebalance 机制"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Consumer, Rebalance]
weight: 12
---

Rebalance 是消费者组最重要也最容易出问题的机制。

## 1. 触发条件

*   新成员加入 (Join)。
*   成员主动离开 (Leave)。
*   成员崩溃 (Heartbeat Timeout)。
*   订阅的 Topic Partition 数量变化。

## 2. 流程 (两阶段)

### Phase 1: JoinGroup
*   所有成员发送 `JoinGroupRequest` 给 Coordinator。
*   Coordinator 选出一个 Leader（通常是第一个加入的）。
*   Coordinator 将所有成员的 Metadata 发送给 Leader。

### Phase 2: SyncGroup
*   Leader 在本地计算分区分配方案（如 Range, RoundRobin）。
*   Leader 发送 `SyncGroupRequest` 给 Coordinator（包含分配方案）。
*   其他成员也发送 `SyncGroupRequest`（不含方案，仅获取结果）。
*   Coordinator 将方案下发给所有成员。

## 3. 优化 (Static Membership)

为了避免临时网络抖动导致的 Rebalance，Kafka 引入了 **Static Membership** (`group.instance.id`)。
设置了 ID 的消费者重启后，只要在 Session Timeout 内回来，就不会触发 Rebalance。

---
**Next**: [Kafka 源码阅读：13. Fetcher](../13-fetcher/)
