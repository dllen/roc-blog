---
title: "Redis 源码阅读：26. 完结篇 - 更多特性"
date: 2026-01-12T00:00:00+08:00
description: "HyperLogLog, Geo, Bitmap, Module System... Redis 的世界远比想象中精彩。系列总结与未来展望。"
tags: [Redis, Source Code, HyperLogLog, Geo, Bitmap, Module]
weight: 26
---

这是 Redis 源码阅读系列的最后一篇。除了前面介绍的核心模块，Redis 还有许多有趣的特性。

## 1. 特殊数据类型
*   **HyperLogLog**：用于基数统计（UV 统计）。基于概率论算法，占用极小的内存（12KB）就能统计 2^64 个元素，误差率仅 0.81%。
*   **Bitmap**：位图。本质上是 String 类型，但是可以按 Bit 操作。适合做签到、在线状态统计。
*   **Geo**：地理位置信息。底层是 **ZSet** + **GeoHash**。将二维经纬度编码为一维整数作为 Score，利用 ZSet 的范围查询实现“附近的人”。

## 2. Redis Module (模块系统)
Redis 4.0 引入了 Module 系统，允许开发者使用 C/C++/Rust 等语言编写动态链接库，扩展 Redis 的功能。
比如：
*   **RediSearch**：全文搜索引擎。
*   **RedisJSON**：原生 JSON 支持。
*   **RedisGraph**：图数据库。
这让 Redis 从一个单纯的缓存/KV数据库，进化成了一个多模数据库平台。

## 3. 总结
通过这 26 篇文章，我们从底层数据结构出发，一路探索了 Redis 的对象系统、启动流程、事件循环、网络模型、数据库实现、持久化机制、分布式架构以及各种高级特性。

Redis 的代码质量极高，简洁、优雅、高效。阅读 Redis 源码，不仅能让我们更好地使用 Redis，更能学习到优秀的 C 语言编程技巧和系统设计思想。

**Happy Hacking!**
