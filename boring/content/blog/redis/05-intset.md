---
title: "Redis 源码阅读：05. IntSet (整数集合)"
date: 2026-01-10T14:00:00+08:00
description: "Redis Set 类型的底层优化。当集合中只有整数时，Redis 如何用 IntSet 节省内存？什么是编码升级？"
tags: [Redis, Source Code, Data Structure, IntSet]
weight: 5
---

当我们在 Redis 中创建一个 Set，并且只往里面塞整数（例如 `SADD myset 1 2 3`），Redis 底层并不会立刻创建一个庞大的 HashTable，而是使用一种名为 **IntSet (整数集合)** 的特殊结构。

## 1. 结构定义

IntSet 的定义非常简单 (`intset.h`)：

```c
typedef struct intset {
    uint32_t encoding; // 编码方式: INTSET_ENC_INT16, INTSET_ENC_INT32, INTSET_ENC_INT64
    uint32_t length;   // 元素数量
    int8_t contents[]; // 柔性数组，实际存储整数
} intset;
```

虽然 `contents` 声明为 `int8_t`，但实际上它并不保存 8 位整数。它保存的是 `int16_t`, `int32_t` 或 `int64_t` 类型的整数，具体取决于 `encoding` 字段的值。

## 2. 核心特性：有序与二分查找

IntSet 中的元素是 **从小到大有序排列** 的，且 **不包含重复元素**。

正因为有序，IntSet 在查找元素（`intsetFind`）时，使用的是 **二分查找 (Binary Search)**，时间复杂度为 O(log N)。这比 HashTable 的 O(1) 慢，但考虑到 IntSet 只在元素较少（默认 < 512）时使用，log(512) 只有 9，性能完全足够，且极其节省内存。

## 3. 编码升级 (Upgrade)

这是 IntSet 最有趣的设计。

一开始，如果你的集合里只有小整数（如 1, 10, 100），`encoding` 可能是 `INTSET_ENC_INT16`（每个元素占 2 字节）。

当你突然插入一个大整数（如 65536，超出了 int16 范围），IntSet 必须进行 **升级**：

1.  **扩展内存**：根据新元素的类型（如 int32），计算所有元素转换后所需的总空间，重新 `realloc`。
2.  **数据迁移**：从后往前，将旧元素搬运到新位置，并扩展为新类型（如从 2 字节扩展为 4 字节）。
3.  **插入新元素**。
4.  **更新 encoding**：将 `encoding` 修改为 `INTSET_ENC_INT32`。

**注意：** IntSet **只支持升级，不支持降级**。一旦升级到 int64，即使你删除了所有大整数，它依然保持 int64 编码。这是为了减少内存重分配的开销。

## 4. 总结

IntSet 是 Redis "时间换空间" 策略的典型体现。对于小规模整数集合，它用 O(log N) 的查找时间换取了极高的内存利用率。
