---
title: "Redis 源码阅读：15. DB 结构 (键空间与过期字典)"
date: 2026-01-11T13:00:00+08:00
description: "Redis 数据库的内部结构是怎样的？redisDb 结构体详解，键空间 dict 和过期字典 expires。"
tags: [Redis, Source Code, Database, Key Space]
weight: 15
---

Redis 是一个 Key-Value 数据库，每个数据库实例都由 `redisDb` 结构体表示。

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
