---
title: "HDFS 源码阅读：06. 块管理 (BlockManager)"
date: 2026-01-17T10:00:00+08:00
description: "BlockManager 是 NameNode 中最繁忙的组件，负责副本管理、损坏块处理与副本放置策略。"
tags: [Hadoop, HDFS, NameNode, BlockManager]
weight: 6
---

`BlockManager` 负责管理 Block 的元数据（Block -> DataNodes 的映射），并确保副本数满足要求。

## 1. 核心数据结构

*   **`BlocksMap`**: 存储 `BlockInfo` 对象。
    *   Key: `Block` (blockId)
    *   Value: `BlockInfo` (包含该 Block 所在的 DataNode 列表)
*   **`BlockInfo`**: 继承自 `Block`，增加了 `Triplets`（三元组）来存储副本位置。
    *   为了节省内存，使用 Object 数组存储 DataNode 引用和链表结构。

```java
// BlockInfo.java
private Object[] triplets; 
// triplets[3*i]: DatanodeStorageInfo (存储该副本的 DN)
// triplets[3*i+1]: Previous BlockInfo (链表前驱)
// triplets[3*i+2]: Next BlockInfo (链表后继)
```

## 2. 副本放置策略 (BlockPlacementPolicy)

当客户端写入新 Block 时，NameNode 需要选择 DataNode。默认策略 (`BlockPlacementPolicyDefault`)：

*   **第 1 副本**: 本地节点（如果是 Client 也是 DataNode），或者随机选择一个（如果 Client 在集群外）。
*   **第 2 副本**: 不同机架的节点（保证机架容错）。
*   **第 3 副本**: 与第 2 副本相同机架的另一个节点（减少跨机架网络流量）。
*   **更多副本**: 随机，但尽量不放在已有的机架。

## 3. 副本监控 (ReplicationMonitor)

`RedundancyMonitor` 线程定期检查：

1.  **Under-replicated Blocks (副本数不足)**:
    *   加入优先队列 `neededReconstruction`。
    *   优先级规则：副本数越少（如只有 1 个），优先级越高。
    *   安排 DataNode 进行复制 (Block Replication Work)。

2.  **Over-replicated Blocks (副本数过多)**:
    *   加入 `invalidateBlocks` 集合。
    *   通知 DataNode 删除多余副本。
    *   删除策略：优先删除磁盘空间不足的、负载高的节点上的副本。

## 4. 损坏块处理 (Corrupt Blocks)

当 DataNode 汇报块损坏（Checksum 错误）或长时间未汇报心跳时，Block 会被标记为 Corrupt。

NameNode 不会立即删除 Corrupt Block，而是先尝试从正常的副本恢复。只有当正常副本数达到要求后，才清理 Corrupt Block。

## 5. 安全模式中的 Block

在 SafeMode 期间，`BlockManager` 会统计所有 Block 的汇报情况。如果某个 Block 一个副本都没收到，说明数据丢失。
