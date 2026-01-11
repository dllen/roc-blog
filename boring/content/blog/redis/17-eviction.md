---
title: "Redis 源码阅读：17. 内存淘汰机制 (LRU & LFU)"
date: 2026-01-11T15:00:00+08:00
description: "当内存满了，Redis 如何选择要牺牲的 Key？深入解析 LRU 近似算法与 LFU 的实现。"
tags: [Redis, Source Code, Eviction, LRU, LFU]
weight: 17
---

当 Redis 内存使用达到 `maxmemory` 限制时，需要执行 **内存淘汰 (Eviction)**。
`evict.c` 中的 `performEvictions` 函数负责此逻辑。

## 1. 淘汰策略
Redis 支持多种淘汰策略（`maxmemory-policy`）：
*   `noeviction`: 拒绝写入，直接报错 (默认)。
*   `allkeys-lru` / `volatile-lru`: 淘汰最近最少使用的 Key。
*   `allkeys-random` / `volatile-random`: 随机淘汰。
*   `allkeys-lfu` / `volatile-lfu`: 淘汰最不常使用的 Key (Redis 4.0+)。
*   `volatile-ttl`: 淘汰 TTL 最短的 Key。

## 2. 近似 LRU (Approximated LRU)
标准的 LRU 需要维护一个双向链表，每次访问都要把节点移到链表头，开销太大。
Redis 采用 **近似 LRU** 算法：
1.  **随机采样**：随机从数据库中选出 5 个 Key (可配置)。
2.  **淘汰最旧**：比较这 5 个 Key 的 `lru` 字段（最后访问时间），淘汰最旧的那个。

为了提高准确性，Redis 3.0 引入了 **Eviction Pool**（淘汰池）。它是一个大小为 16 的数组，用于暂存那些“看起来很旧”的 Key。每次采样后，将新采样的 Key 与池中的 Key 融合，始终保留最旧的 Key，从而让近似算法的效果逼近真实 LRU。

## 3. LFU (Least Frequently Used)
LRU 的缺点是：如果一个 Key 很久没用，刚才偶尔被扫了一次，LRU 就会认为它是热数据。
LFU (最不常使用) 更能反映数据的冷热。

Redis 复用了 `redisObject` 的 `lru` 字段（24 bits）：
*   **高 16 位**：最后递减时间 (Last Decrement Time)。
*   **低 8 位**：对数计数器 (Logarithmic Counter)。

**计数器逻辑**：
*   **增长**：访问时，并非每次都 +1，而是按概率增加。计数器越大，增加越难。这使得 8 bit (最大 255) 能表示很大的访问频率。
*   **衰减**：读取 Key 时，如果发现距离上次衰减已经过去很久了，就将计数器减半或减一。

LFU 算法完美解决了“缓存污染”问题。
