---
title: "Redis 源码阅读：16. 过期策略 (Lazy & Active)"
date: 2026-01-11T14:00:00+08:00
description: "Redis 是如何删除过期 Key 的？惰性删除与定期删除的实现细节，以及它们是如何配合工作的。"
tags: [Redis, Source Code, Expiration, Strategy]
weight: 16
---

Redis 中有大量的 Key 设置了过期时间。如果每个 Key 到期时都立即删除，需要给每个 Key 创建一个定时器，这对 CPU 是极大的浪费。

Redis 采用 **惰性删除 (Lazy Expiration)** + **定期删除 (Active Expiration)** 相结合的策略。

## 1. 惰性删除 (Lazy Expiration)
**策略**：Key 到期了先不管它，等下次有命令访问这个 Key 时，再检查它是否过期。如果过期了，就删除它，并返回 Key 不存在。

**实现**：
在执行任何读写命令（如 `GET`, `SET`）之前，Redis 都会调用 `expireIfNeeded(db, key)` 函数。
*   如果 Key 过期：删除 Key，同步到 AOF/Slave，返回 1。
*   如果未过期：返回 0。

**缺点**：如果一个冷 Key 过期了但永远不再被访问，它就会一直占用内存。

## 2. 定期删除 (Active Expiration)
**策略**：每隔一段时间（默认 100ms），随机抽取一些 Key 进行检查，删除过期的 Key。

**实现**：
在 `serverCron` 中调用 `activeExpireCycle` 函数。
1.  遍历每个数据库 (默认 16 个)。
2.  从 `expires` 字典中**随机抽取** 20 个 Key。
3.  检查并删除过期的 Key。
4.  如果过期的 Key 超过 5 个 (25%)，说明过期 Key 比例很高，**重复步骤 2**。
5.  为了防止循环时间过长卡死主线程，函数有一个**时间限制** (默认 25ms)。如果执行时间超限，立即停止。

## 3. 总结
*   **惰性删除**保证了过期 Key 不会被错误访问。
*   **定期删除**保证了冷 Key 最终会被清理，防止内存泄漏。
两者配合，在 CPU 负载和内存占用之间取得了平衡。
