---
title: "Redis 源码阅读：06. SkipList (跳表)"
date: 2026-01-10T15:00:00+08:00
description: "为什么 Redis 的 ZSet 选择跳表而不是红黑树？深入理解跳表的概率平衡机制与实现细节。"
tags: [Redis, Source Code, Data Structure, SkipList, ZSet]
weight: 6
---

ZSet (Sorted Set) 是 Redis 最强大的数据结构之一，支持范围查询、排名等操作。它的底层主要由两个结构组成：**Dict (字典)** 和 **SkipList (跳表)**。

*   Dict 负责 O(1) 查分 (Score)。
*   SkipList 负责排序和范围查找 (Range Query)。

## 1. 为什么选跳表，不选红黑树？

这是一个经典面试题。Redis 作者 Antirez 曾亲自回答过：

1.  **实现简单**：跳表的代码比红黑树简单太多了，容易调试和维护。
2.  **范围查找高效**：在红黑树上做范围查找（如 `ZRANGE`），需要复杂的中序遍历回溯。而在跳表上，找到起点后，直接顺着底层链表遍历即可，缓存局部性更好。
3.  **内存占用**：跳表平均每个节点只有 1.33 个指针（取决于概率参数），而红黑树每个节点固定 2 个指针（左右子树）+ 1 个颜色位。

## 2. 结构设计

Redis 的跳表结构定义在 `server.h` 中：

```c
typedef struct zskiplistNode {
    sds ele;             // 元素 (Member)
    double score;        // 分数
    struct zskiplistNode *backward; // 后退指针 (用于 ZREVRANGE)
    struct zskiplistLevel {
        struct zskiplistNode *forward; // 前进指针
        unsigned long span;            // 跨度 (用于计算 Rank)
    } level[];
} zskiplistNode;

typedef struct zskiplist {
    struct zskiplistNode *header, *tail;
    unsigned long length; // 节点总数
    int level;            // 当前最大层数
} zskiplist;
```

### 关键点：
1.  **Level 数组**：每个节点包含多层索引。
2.  **Span (跨度)**：这是 Redis 对标准跳表的改进。记录了当前指针跨过了多少个节点。通过累加 Span，Redis 可以在 O(log N) 时间内算出任意元素的 **Rank (排名)**。
3.  **Backward 指针**：标准跳表是单向的，Redis 增加了后退指针，支持从后向前遍历 (`ZREVRANGE`)。

## 3. 概率平衡

跳表不强制平衡（像 AVL 树那样旋转），而是靠**概率**维持平衡。

插入新节点时，Redis 使用 `zslRandomLevel` 函数决定它的层数：

*   1/4 的概率增加一层。
*   最大层数限制为 32。

这意味着：
*   100% 的节点有 Level 1。
*   25% 的节点有 Level 2。
*   6.25% 的节点有 Level 3。
*   ...

这种随机机制保证了跳表的层数大致呈金字塔形状，从而保证查询效率稳定在 O(log N)。
