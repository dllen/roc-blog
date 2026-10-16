---
title: "Redis 源码阅读：15. DB 结构 (键空间与过期字典)"
date: 2026-01-11T13:00:00+08:00
description: "Redis 数据库的内部结构是怎样的？redisDb 结构体详解，键空间 dict 和过期字典 expires。"
taxonomies:
  tags: [Redis, Source Code, Database, Key Space]
weight: 15
tldr: "Redis 数据库的内部结构是怎样的？redisDb 结构体详解，键空间 dict 和过期字典 expires。"
keywords: ["Redis", "源码阅读", "15.", "DB", "结构", "键空间与过期字典", "Source Code", "Database"]
---
## 0. 本章定位

Redis 源码阅读：15. DB 结构 (键空间与过期字典)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Redis 是一个 Key-Value 数据库，每个数据库实例都由 `redisDb` 结构体表示。

Redis 数据库结构 dict + expires 双 hashtable 实现是 O(1) 性能基础，理解它能解释为何 Redis 适合计数 / 缓存场景。

理解 dict 与 expires 双 hashtable 是学习 Redis 过期策略（惰性删除 + 定期删除）的基础。

dbAdd / dbOverwrite / dbExists 等数据库操作的源码入口是理解 Redis 键空间的关键。

## 1. redisDb 结构体
在 `server.h` 中：

```c
typedef struct redisDb {
    dict *dict;                 // 键空间 (Key Space)，保存所有的键值对
    dict *expires;              // 过期字典，保存所有设置了过期时间的 Key
    dict *blocking_keys;        // 处于阻塞状态的 Key (如 BLPOP)
    dict *ready_keys;           // 解除阻塞的 Key
    dict *watched_keys;         // 被 WATCH 命令监控的 Key (用于事务)
    int id;                     // 数据库 ID (0-15)
    long long avg_ttl;          // 平均 TTL (用于统计)
    // ...
} redisDb;
```

## 2. 键空间 (Key Space)
`dict *dict` 是数据库的核心。
*   Key: 总是 String 对象。
*   Value: 可以是 String, List, Hash 等任何 Redis 对象。

当我们执行 `GET key` 时，Redis 实际上就是在这个 `dict` 中查找 Key。
当我们执行 `FLUSHDB` 时，就是清空这个 `dict` 和 `expires`。

## 3. 过期字典 (Expires)
`dict *expires` 专门用于存储 Key 的过期时间。
*   Key: 指向键空间中的同一个 String 对象 (复用指针，不浪费内存)。
*   Value: `long long` 类型的 UNIX 时间戳 (毫秒精度)。

当我们执行 `TTL key` 时，Redis 会去 `expires` 字典中查找并计算剩余时间。
如果一个 Key 没有设置过期时间，它就不会出现在 `expires` 字典中。
