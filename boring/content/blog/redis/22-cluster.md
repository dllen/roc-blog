---
title: "Redis 源码阅读：22. Cluster (集群模式)"
date: 2026-01-11T20:00:00+08:00
description: "Redis Cluster 是如何实现数据分片的？Hash Slot、Gossip 协议、MOVED 重定向原理详解。"
tags: [Redis, Source Code, Distributed, Cluster, Sharding]
weight: 22
---

Redis Cluster 是 Redis 官方提供的分布式解决方案，支持数据自动分片和去中心化管理。
代码位于 `src/cluster.c`。

## 1. 数据分片 (Sharding)
Redis Cluster 没有使用一致性哈希，而是引入了 **Hash Slot (哈希槽)** 的概念。
*   整个集群共有 **16384** 个槽。
*   Key 落入哪个槽：`CRC16(key) % 16384`。
*   集群中的每个节点负责维护一部分槽。

## 2. 节点通信 (Gossip)
Redis Cluster 是去中心化的（无 Master 节点），节点之间通过 **Gossip 协议** 交换信息。
每个节点都维护一份集群的全局视图（Cluster State），包含所有节点的状态和槽位分布信息。
节点间每秒随机握手（PING/PONG），传播集群状态。

## 3. 请求重定向 (MOVED & ASK)
当客户端向某个节点发送命令时：
1.  节点计算 Key 属于哪个槽。
2.  **如果槽归自己管**：直接执行命令。
3.  **如果槽归别的节点管**：返回 `MOVED <slot> <target_ip:port>` 错误。
    *   客户端收到 MOVED 后，应更新本地的槽位映射表，并重发命令给目标节点。
4.  **ASK 重定向**：
    *   发生在**在线迁移 (Resharding)** 过程中。
    *   如果槽正在从 A 迁移到 B，且 Key 还没迁移过去（在 A），A 处理。
    *   如果 Key 已经迁移到 B 了，A 返回 `ASK <slot> <target_ip:port>`。
    *   客户端收到 ASK，先向 B 发送 `ASKING` 命令，再发送原命令。注意：ASK 是临时的，客户端不应更新本地映射表。

## 4. 故障转移
Cluster 的故障转移机制与 Sentinel 类似，也是基于投票。
当一个 Master 挂了，它的 Slave 们会发起选举，获得集群中大多数 Master 投票的 Slave 将升级为新 Master，接管旧 Master 的槽位。
