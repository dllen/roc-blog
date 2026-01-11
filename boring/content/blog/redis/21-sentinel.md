---
title: "Redis 源码阅读：21. Sentinel (哨兵模式)"
date: 2026-01-11T19:00:00+08:00
description: "Sentinel 如何实现自动故障转移？主观下线与客观下线的区别，Raft 算法在 Leader 选举中的应用。"
tags: [Redis, Source Code, Distributed, Sentinel, HA]
weight: 21
---

Sentinel 是 Redis 的高可用解决方案。它本质上是一个运行在特殊模式下的 Redis 服务器。
代码位于 `src/sentinel.c`。

## 1. 监控 (Monitoring)
Sentinel 默认每秒向 Master, Slave 和其他 Sentinel 发送 `PING`。
*   **主观下线 (SDOWN)**：如果实例在 `down-after-milliseconds` 时间内未回复，当前 Sentinel 认为它下线了。
*   **客观下线 (ODOWN)**：如果 Sentinel 认为 Master SDOWN 了，它会向其他 Sentinel 询问。如果超过 `quorum` 个 Sentinel 都认为 Master 下线了，那么 Master 就被判定为客观下线。

## 2. Leader 选举
当 Master 被判定 ODOWN 后，需要选出一个 Sentinel Leader 来执行故障转移。
选举算法基于 **Raft** 协议。
简单来说，想当 Leader 的 Sentinel 会先发起投票，如果获得超过半数 Sentinel 的支持，就成为 Leader。

## 3. 故障转移 (Failover)
Leader Sentinel 负责执行 Failover：
1.  **选新主**：从所有 Slave 中选出一个状态最好、数据最新的 Slave。
2.  **升级**：向该 Slave 发送 `SLAVEOF NO ONE`，让它成为新 Master。
3.  **通知**：通过 Pub/Sub 通知客户端新 Master 的地址。
4.  **重配置**：向其他 Slave 发送 `SLAVEOF new_master_ip`，让它们复制新 Master。
5.  **老主归队**：当旧 Master 恢复上线时，让它成为新 Master 的 Slave。
