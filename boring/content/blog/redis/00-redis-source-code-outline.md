---
title: "Redis 源码阅读：系列大纲与学习路径"
date: 2026-01-10T09:00:00+08:00
description: "Redis 源码阅读系列博客的完整大纲。规划了从底层数据结构、对象系统、核心架构、数据库实现、持久化到分布式特性的七大阶段阅读路线。"
tags: [Redis, Source Code, Roadmap, Learning]
weight: -1
---

> **千里之行，始于足下。** 
> 
> Redis 源码博大精深，为了避免在浩如烟海的代码中迷失方向，制定一个清晰的阅读大纲至关重要。本文作为本系列的“第 0 篇”，旨在规划一条从底层到上层、从单机到集群的学习路径。

本系列将基于 **Redis 7.2** 版本源码进行解读。

## 🗺️ 整体蓝图

我们将 Redis 源码阅读分为七个阶段：

1.  **基础篇**：万丈高楼平地起，搞懂 Redis 独特的底层数据结构。
2.  **对象篇**：理解 Redis 如何在底层结构之上构建出 String, List, Hash 等对外类型。
3.  **核心篇**：深入 Redis 的心脏 —— 事件循环与网络模型。
4.  **数据库篇**：探索键值对存储、过期策略与内存淘汰。
5.  **持久化篇**：RDB 与 AOF 如何保障数据安全。
6.  **分布式篇**：主从复制、哨兵与集群的实现原理。
7.  **进阶篇**：事务、Lua 脚本、Stream 等高级特性。

---

## 📚 详细大纲 (持续更新)

### Phase 1: 底层数据结构 (The Foundation)
Redis 为了追求极致性能，造了许多“轮子”。这些数据结构是理解 Redis 的基石。

*   **[01. 源码地图与环境搭建]({{< ref "01-redis-source-code-map.md" >}})**
    *   源码目录概览
    *   开发环境配置 (VS Code/CLion)
    *   调试技巧
*   **02. SDS (Simple Dynamic String)**
    *   C 字符串的痛点
    *   SDS 结构设计与二进制安全
    *   预分配与惰性释放
*   **03. Dict (Dictionary)**
    *   哈希表实现
    *   哈希冲突解决 (链地址法)
    *   **核心：渐进式 Rehash (Progressive Rehash)** 详解
*   **04. ZipList & ListPack**
    *   内存紧凑型结构的设计哲学
    *   ZipList 的连锁更新问题
    *   ListPack 如何解决连锁更新
*   **05. IntSet (Integer Set)**
    *   整数集合的编码升级
*   **06. SkipList (跳表)**
    *   为什么 ZSet 用跳表而不用红黑树？
    *   跳表的概率平衡机制
*   **07. QuickList**
    *   双向链表与压缩列表的混合体

### Phase 2: 对象系统 (Object System)
连接底层结构与用户命令的桥梁。

*   **08. redisObject 详解**
    *   类型 (type) 与 编码 (encoding)
    *   LRU/LFU 字段与内存淘汰的关联
*   **09. String 对象**
    *   int, embstr, raw 三种编码的区别与转换
*   **10. List, Hash, Set, ZSet 对象**
    *   不同场景下的编码选择与转换策略

### Phase 3: 核心架构 (The Engine)
Redis 为什么单线程还能这么快？

*   **11. 启动流程**
    *   `server.c` 的 main 函数全解析
    *   配置加载与初始化
*   **12. AE 事件库 (Async Event)**
    *   Reactor 模式
    *   IO 多路复用 (epoll/kqueue/select) 封装
    *   文件事件与时间事件
*   **13. 网络层 (Networking)**
    *   连接建立 (Accept)
    *   请求读取与协议解析 (RESP)
    *   命令回复缓冲区 (Client Output Buffer)
*   **14. 命令执行模型**
    *   `processCommand` 流程
    *   命令表查找与校验

### Phase 4: 数据库实现 (Database)
作为数据库的核心职能。

*   **15. DB 结构**
    *   `redisDb` 结构体
    *   键空间 (Key Space) 与过期字典
*   **16. 过期策略 (Expiration)**
    *   惰性删除 (Lazy Expire)
    *   定期删除 (Active Expire) 的实现细节
*   **17. 内存淘汰机制 (Eviction)**
    *   maxmemory 处理流程
    *   LRU 与 LFU 的近似实现算法

### Phase 5: 持久化 (Persistence)
*   **18. RDB (Redis Database)**
    *   快照原理
    *   `fork` 与 Copy-On-Write (COW)
    *   rdbSave 与 rdbLoad
*   **19. AOF (Append Only File)**
    *   命令追加与磁盘同步策略 (fsync)
    *   AOF 重写 (Rewrite) 原理与管道通信

### Phase 6: 分布式 (Distributed)
*   **20. 主从复制 (Replication)**
    *   全量复制与部分复制 (PSYNC)
    *   复制积压缓冲区 (Replication Backlog)
*   **21. Sentinel (哨兵)**
    *   监控与主观/客观下线
    *   Leader 选举与故障转移
*   **22. Cluster (集群)**
    *   Hash Slot (槽) 分配
    *   MOVED 与 ASK 重定向
    *   Gossip 协议

### Phase 7: 进阶与彩蛋 (Advanced)
*   **23. 事务 (Transaction)**
    *   MULTI, EXEC, WATCH 实现
    *   为什么 Redis 事务不支持回滚？
*   **24. Lua 脚本**
    *   Lua 环境初始化与调用
*   **25. Stream**
    *   Radix Tree (基数树) 实现
*   **26. 其它**
    *   HyperLogLog
    *   Geo
    *   Bloom Filter (Module)

---

## 🎯 阅读建议

1.  **不要死磕每一行代码**：Redis 源码注释非常详细，但代码量依然很大。初读时建议关注核心逻辑，忽略边界检查和异常处理。
2.  **多动手调试**：使用 IDE (如 CLion/VS Code) 打断点，观察变量变化，比单纯看代码效率高十倍。
3.  **画图**：对于复杂的数据结构（如 Dict, SkipList），画图能极大帮助理解。

让我们开始这段奇妙的源码之旅吧！
