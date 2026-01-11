---
title: "Redis 源码阅读：07. QuickList (快速列表)"
date: 2026-01-10T16:00:00+08:00
description: "Redis List 类型的底层实现。QuickList 是如何结合双向链表和压缩列表的优点，既省内存又高性能？"
tags: [Redis, Source Code, Data Structure, QuickList, List]
weight: 7
---

在 Redis 3.2 之前，List 对象的底层实现是：当数据少时用 ZipList，数据多时用 LinkedList (标准双向链表)。

但标准双向链表有两个问题：
1.  **内存开销大**：每个节点除了存数据，还需要存 prev/next 指针 (16 字节)。
2.  **内存碎片**：每个节点都是独立分配的，容易产生碎片，缓存命中率低。

为了解决这个问题，Redis 3.2 引入了 **QuickList (快速列表)**，统一了 List 的底层实现。

## 1. 结构设计

QuickList 是 **LinkedList + ZipList** 的混合体。

宏观上看，它是一个双向链表。
微观上看，链表中的**每个节点 (Node) 都是一个 ZipList**。

```c
typedef struct quicklist {
    quicklistNode *head;
    quicklistNode *tail;
    unsigned long count;        // 所有元素总数
    unsigned long len;          // 链表节点 (ZipList) 数量
    int fill : QL_FILL_BITS;    // 单个节点的填充因子
    unsigned int compress : QL_COMP_BITS; // 压缩深度
    // ...
} quicklist;

typedef struct quicklistNode {
    struct quicklistNode *prev;
    struct quicklistNode *next;
    unsigned char *zl;           // 指向 ZipList 的指针
    unsigned int sz;             // ZipList 的字节大小
    unsigned int count : 16;     // ZipList 中的元素数量
    unsigned int encoding : 2;   // 编码方式 (RAW 或 LZF 压缩)
    // ...
} quicklistNode;
```

## 2. 权衡的艺术

QuickList 的设计核心在于平衡 **内存** 与 **CPU**。

*   **如果一个节点存太多元素**：它就退化成了一个大 ZipList，虽然极省内存，但更新性能差（连锁更新）。
*   **如果一个节点存太少元素**：它就退化成了标准 LinkedList，内存开销大。

Redis 通过 `list-max-ziplist-size` 参数（对应 `fill` 字段）来控制每个 ZipList 节点的大小，寻找最佳平衡点。

## 3. 两端压缩

List 通常用于队列或栈，操作主要集中在头尾。中间的数据很少被访问。
因此，QuickList 支持 **LZF 压缩**。除了头尾两端的 N 个节点外，中间的节点可以被压缩存储，进一步节省内存。由 `list-compress-depth` 参数控制。
