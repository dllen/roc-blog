---
title: "Redis 源码阅读：04. ZipList & ListPack (内存紧凑之道)"
date: 2026-01-10T13:00:00+08:00
description: "解析 Redis 为了省内存而设计的压缩列表。ZipList 的连锁更新灾难是什么？新一代 ListPack 又是如何完美解决这个问题的？"
tags: [Redis, Source Code, Data Structure, ZipList, ListPack]
weight: 4
---

Redis 是一个**内存**数据库，内存就是成本。为了在存储小量数据时节省内存，Redis 设计了 ZipList（压缩列表）。但 ZipList 存在设计缺陷，因此 Redis 5.0 引入了 ListPack（紧凑列表）作为替代品，并将在 Redis 7.0+ 中逐步全面接管 ZipList 的职责。

## 1. ZipList：极致的压缩，致命的缺陷

ZipList 不是双向链表，而是一块**连续的内存块**。

### 1.1 结构设计

一个 ZipList 的内存布局如下：

```
<zlbytes> <zltail> <zllen> <entry> <entry> ... <entry> <zlend>
```

*   `zlbytes` (4字节): 总字节数。
*   `zltail` (4字节): 尾节点偏移量（方便快速定位尾部，实现从尾向头遍历）。
*   `zllen` (2字节): 节点数量。
*   `zlend` (1字节): 结束标记 (0xFF)。

**Entry (节点) 的结构：**

```
<prevlen> <encoding> <entry-data>
```

*   `prevlen`: **前一个节点的长度**。这是实现从后向前遍历的关键。
*   `encoding`: 编码类型（是整数还是字符串，长度是多少）。
*   `entry-data`: 实际数据。

### 1.2 连锁更新 (Cascading Update) —— ZipList 的阿喀琉斯之踵

问题出在 `prevlen` 字段上。
*   如果前一个节点长度 < 254 字节，`prevlen` 占用 **1 字节**。
*   如果前一个节点长度 >= 254 字节，`prevlen` 占用 **5 字节**。

**场景模拟：**
假设有一个 ZipList，包含多个长度为 253 字节的节点（E1, E2, E3...）。此时它们的 `prevlen` 都是 1 字节。
现在，我们将 E1 的数据更新为 254 字节。
1.  E2 的 `prevlen` 需要记录 E1 的长度，发现 E1 变大了，`prevlen` 必须从 1 字节扩展到 5 字节。
2.  E2 整体长度增加了 4 字节，变成了 253 + 4 = 257 字节。
3.  E3 的 `prevlen` 需要记录 E2 的长度，发现 E2 也变大了...
4.  多米诺骨牌效应触发，后面所有的节点都需要重新分配内存并移动数据。

这就是**连锁更新**，最坏情况下时间复杂度为 O(N^2)。这也是为什么 Redis 限制 ZipList 只能存少量数据的原因。

## 2. ListPack：完美的继任者

ListPack (紧凑列表) 的设计目标就是：保持 ZipList 紧凑内存布局的同时，彻底解决连锁更新问题。

### 2.1 结构设计

ListPack 的整体结构与 ZipList 类似，但更简单：

```
<totbytes> <num-elements> <element> <element> ... <end-byte>
```

**Element (节点) 的结构变了：**

```
<encoding-type> <element-data> <element-tot-len>
```

*   `encoding-type`: 编码类型。
*   `element-data`: 数据。
*   `element-tot-len`: **当前节点的总长度** (包含 encoding 和 data)。

### 2.2 为什么 ListPack 没有连锁更新？

关键在于：ListPack 的节点**不再保存前一个节点的长度**，只保存**当前节点的长度**。

*   **正向遍历**：根据 `encoding` 解析出数据长度，跳到下一个节点。
*   **反向遍历**：读取当前节点末尾的 `element-tot-len`，回退相应的字节数，找到前一个节点的末尾。

因为每个节点的长度只与自己有关，修改一个节点永远不会影响下一个节点的长度字段。**彻底根除了连锁更新**。

## 3. 总结

*   **ZipList**: 为了省内存而生，但 `prevlen` 的变长设计导致了潜在的性能风险。
*   **ListPack**: 站在巨人的肩膀上，保留了紧凑布局的优点，通过改变长度记录方式（存自身长度而非前驱长度），完美解决了连锁更新问题。

在 Redis 7.0 中，ListPack 已经替代 ZipList 用于实现 Hash (当元素少时) 和 ZSet (当元素少时)。ZipList 正在逐渐退出历史舞台。
