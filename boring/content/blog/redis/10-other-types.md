---
title: "Redis 源码阅读：10. List, Hash, Set, ZSet 的编码演进"
date: 2026-01-10T19:00:00+08:00
description: "Redis 集合类型的底层编码是如何动态切换的？一文看懂 List, Hash, Set, ZSet 的编码策略。"
tags: [Redis, Source Code, List, Hash, Set, ZSet, Encoding]
weight: 10
---

Redis 的集合类型（List, Hash, Set, ZSet）都有两种编码：一种用于**少量数据**（省内存），一种用于**大量数据**（高性能）。

## 1. List
*   **编码**：`quicklist` (Redis 3.2+)
*   **说明**：List 现在只有一种编码 `quicklist`，它是 ZipList 和 LinkedList 的混合体。

## 2. Hash
*   **编码 1：listpack** (旧版本为 ziplist)
    *   **条件**：
        *   所有键值对的键和值的字符串长度都 < `hash-max-listpack-value` (默认 64)。
        *   键值对数量 < `hash-max-listpack-entries` (默认 512)。
    *   **特点**：O(N) 查找，省内存。
*   **编码 2：hashtable** (即 dict)
    *   **条件**：超过上述任一阈值。
    *   **特点**：O(1) 查找，内存占用较高。

## 3. Set
*   **编码 1：intset**
    *   **条件**：
        *   所有元素都是**整数**。
        *   元素数量 < `set-max-intset-entries` (默认 512)。
    *   **特点**：O(log N) 查找，极省内存。
*   **编码 2：hashtable** (即 dict)
    *   **条件**：不满足上述条件。
    *   **特点**：Value 全部为 NULL 的 Dict。

## 4. ZSet (Sorted Set)
*   **编码 1：listpack** (旧版本为 ziplist)
    *   **条件**：
        *   元素长度 < `zset-max-listpack-value` (默认 64)。
        *   元素数量 < `zset-max-listpack-entries` (默认 128)。
    *   **结构**：元素和 Score 紧挨着存储。
*   **编码 2：skiplist**
    *   **结构**：同时包含一个 `dict` (用于 O(1) 查 Score) 和一个 `zskiplist` (用于范围查找)。
    *   **注意**：虽然名字叫 skiplist 编码，但实际上它是 dict + skiplist 的组合体。

## 5. 总结

Redis 的这种动态编码策略，体现了它对**内存效率**的极致追求。在阅读源码时，你会发现大量的代码都在处理这些编码转换（`convertAndCreate` 等函数）。
