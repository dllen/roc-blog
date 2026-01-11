---
title: "Redis 源码阅读：08. redisObject (对象系统核心)"
date: 2026-01-10T17:00:00+08:00
description: "Redis 如何在底层数据结构之上构建出 String, List, Hash 等对象？redisObject 结构体详解，类型、编码与 LRU。"
tags: [Redis, Source Code, Object System, Type, Encoding]
weight: 8
---

我们之前学习了 SDS, Dict, ZipList 等底层数据结构。但在 Redis 中，我们并不直接操作这些结构，而是操作 **对象 (Object)**。

每当我们创建一个键值对时，Redis 至少会创建两个对象：
1.  **键对象**：总是 String 类型。
2.  **值对象**：可以是 String, List, Hash, Set, ZSet 等。

这一切的基石就是 `redisObject` 结构体。

## 1. 结构定义

在 `server.h` 中：

```c
typedef struct redisObject {
    unsigned type:4;       // 类型
    unsigned encoding:4;   // 编码
    unsigned lru:LRU_BITS; // LRU/LFU 记录 (24 bits)
    int refcount;          // 引用计数
    void *ptr;             // 指向底层数据结构的指针
} robj;
```

### 1.1 Type (类型)
对应 Redis 的对外数据类型：
*   `OBJ_STRING`
*   `OBJ_LIST`
*   `OBJ_SET`
*   `OBJ_ZSET`
*   `OBJ_HASH`
*   ...

### 1.2 Encoding (编码)
这是 Redis 对象系统的精髓。同一个 Type，底层可以使用不同的 Encoding。
例如 `OBJ_LIST` 类型，底层可以是 `OBJ_ENCODING_QUICKLIST`，也可以是 `OBJ_ENCODING_ZIPLIST` (旧版本)。

这种设计让 Redis 非常灵活：**在数据量少时使用省内存的编码，数据量大时切换为高性能的编码**。

### 1.3 LRU/LFU
这 24 位用于实现内存淘汰策略。
*   如果策略是 LRU，记录最后一次访问时间的秒级时间戳。
*   如果策略是 LFU，记录访问频率和最后访问时间。

### 1.4 Refcount (引用计数)
C 语言没有 GC，Redis 使用引用计数来管理内存。
*   创建对象时 `refcount = 1`。
*   对象被共享时 `incrRefCount`。
*   不再使用时 `decrRefCount`，减为 0 时释放内存。

Redis 启动时会预先创建 0-9999 这 10000 个整数对象（共享整数），用于节省内存。
