---
title: "Redis 源码阅读：03. Dict (字典与渐进式 Rehash)"
date: 2026-01-10T12:00:00+08:00
description: "深度剖析 Redis 核心数据结构 Dict。双哈希表设计、哈希冲突解决、以及最精彩的渐进式 Rehash 机制详解。"
tags: [Redis, Source Code, C, Data Structure, Dict, Hash]
weight: 3
---

如果说 SDS 是 Redis 的肌肉，那么 **Dict (字典/哈希表)** 就是 Redis 的骨架。

Redis 本身就是一个巨大的 KV 数据库，这个 "KV" 的底层实现就是 Dict。此外，Redis 的 Hash 类型、Set 类型（当元素多时）、ZSet 的一部分（查找成员 Score）都严重依赖 Dict。

本文将带你深入 `dict.h` 和 `dict.c`，理解 Redis 字典的设计哲学，重点解析它是如何通过 **渐进式 Rehash** 解决大规模数据扩容时的卡顿问题的。

## 1. 核心结构体

Redis 的字典实现非常经典，采用了 **开链法 (Chaining)** 来解决哈希冲突。

### 1.1 dictEntry (节点)
这是哈希表中的最小单位，保存了具体的键值对。

```c
typedef struct dictEntry {
    void *key;              // 键
    union {
        void *val;
        uint64_t u64;
        int64_t s64;
        double d;
    } v;                    // 值 (使用 union 节省内存)
    struct dictEntry *next; // 下一个节点指针 (解决哈希冲突)
} dictEntry;
```

### 1.2 dictht (哈希表)
这是一个标准的哈希表结构。

```c
typedef struct dictht {
    dictEntry **table;      // 哈希表数组 (bucket 数组)
    unsigned long size;     // 哈希表大小 (总是 2 的幂)
    unsigned long sizemask; // 掩码 (size - 1)，用于计算索引
    unsigned long used;     // 该表中已有的节点数量
} dictht;
```

### 1.3 dict (字典)
这是最外层的包装。**注意：这里有两个 dictht**。

```c
typedef struct dict {
    dictType *type; // 类型特定函数 (支持多态，如 key 的复制、析构、哈希计算等)
    void *privdata; // 私有数据
    dictht ht[2];   // 两个哈希表！ht[0] 平时用，ht[1] 扩容/缩容时用
    long rehashidx; // Rehash 索引。-1 表示未进行 Rehash
    int16_t pauserehash; // 是否暂停 Rehash (>0 表示暂停)
} dict;
```

## 2. 为什么要两个哈希表？(ht[0] & ht[1])

大多数语言（如 Java HashMap, C++ std::unordered_map）内部只有一个哈希表。扩容时，它们会创建一个更大的新数组，然后**一次性**将所有数据迁移过去。

对于 Redis 这种**单线程**内存数据库，一次性迁移几百万甚至上亿个 Key 是灾难性的。这会导致服务器在几百毫秒甚至几秒内无法响应任何请求（Stop-The-World）。

为了解决这个问题，Redis 引入了 **渐进式 Rehash (Progressive Rehash)**。

## 3. 渐进式 Rehash 详解

渐进式 Rehash 的核心思想是：**分而治之**。将庞大的迁移工作分摊到后续的每一次增删改查操作中，以及后台的定时任务中。

### 3.1 触发条件
当以下条件满足时，Redis 会开始扩容：
1.  服务器没有执行 `BGSAVE` (RDB) 或 `BGREWRITEAOF` (AOF 重写)，且负载因子 (`used / size`) >= 1。
2.  服务器正在执行 `BGSAVE` 等子进程，但负载因子 >= 5 (强制扩容)。

此时，`dict` 的 `rehashidx` 从 -1 变为 0，标志着 Rehash 开始。`ht[1]` 被分配空间（大小通常是 `ht[0]` 的 2 倍）。

### 3.2 迁移过程
Rehash 开始后，并没有立即迁移数据。迁移发生在以下两个时间点：

1.  **被动迁移 (Lazy)**：
    每次对字典执行添加、删除、查找或更新操作时（`dictAdd`, `dictFind` 等），程序除了执行指定操作外，还会顺带将 `ht[0]` 中 `rehashidx` 索引位置上的**所有**键值对迁移到 `ht[1]`，然后将 `rehashidx` 加 1。
    
2.  **主动迁移 (Active)**：
    Redis 的 `serverCron` 定时任务中，会花费 1 毫秒的时间来进行 Rehash（`dictRehashMilliseconds`），防止长期没有读写导致 Rehash 停滞。

### 3.3 Rehash 期间的读写
在 Rehash 进行期间，字典同时使用 `ht[0]` 和 `ht[1]`：
*   **添加 (Add)**：新数据一律添加到 `ht[1]`。保证 `ht[0]` 只减不增，最终变为空。
*   **查找/删除 (Find/Delete)**：先在 `ht[0]` 找，找不到再去 `ht[1]` 找。

### 3.4 结束
当 `ht[0]` 中所有节点都被迁移到 `ht[1]` 后，Rehash 结束：
1.  释放 `ht[0]`。
2.  将 `ht[1]` 设置为 `ht[0]`。
3.  重置 `ht[1]` 为空。
4.  `rehashidx` 设为 -1。

## 4. 源码精读：dictRehash

这是渐进式 Rehash 的核心函数 `dict.c/dictRehash`：

```c
int dictRehash(dict *d, int n) {
    int empty_visits = n * 10; // 最大空桶访问次数，防止在空桶多的哈希表上卡太久
    if (!dictIsRehashing(d)) return 0;

    while(n-- && d->ht[0].used != 0) {
        dictEntry *de, *nextde;

        // 找到下一个非空的 bucket
        while(d->ht[0].table[d->rehashidx] == NULL) {
            d->rehashidx++;
            if (--empty_visits == 0) return 1; // 还没搬完，但本次配额用光了
        }
        
        // 搬迁该 bucket 上的整条链表
        de = d->ht[0].table[d->rehashidx];
        while(de) {
            uint64_t h;

            nextde = de->next;
            // 计算在 ht[1] 的新下标
            h = dictHashKey(d, de->key) & d->ht[1].sizemask;
            
            // 头插法插入到 ht[1]
            de->next = d->ht[1].table[h];
            d->ht[1].table[h] = de;
            
            d->ht[0].used--;
            d->ht[1].used++;
            de = nextde;
        }
        d->ht[0].table[d->rehashidx] = NULL; // 原位置置空
        d->rehashidx++;
    }

    // 检查是否全部搬完
    if (d->ht[0].used == 0) {
        zfree(d->ht[0].table); // 释放 ht[0] 内存
        d->ht[0] = d->ht[1];   // ht[1] 上位
        _dictReset(&d->ht[1]); // 重置 ht[1]
        d->rehashidx = -1;     // 标记结束
        return 0;
    }

    return 1; // 还没搬完
}
```

## 5. 总结

Redis 的 Dict 实现充分体现了工程设计的权衡：
*   使用 **链地址法** 解决冲突，简单且内存利用率高。
*   通过 **双哈希表 + 渐进式 Rehash**，完美解决了单线程模型下的大规模扩容卡顿问题。这是 Redis 能够保持极低延迟的关键技术之一。

下一篇，我们将研究 Redis 中那些为了省内存而“丧心病狂”设计的数据结构 —— **ZipList (压缩列表) 与 ListPack**。
