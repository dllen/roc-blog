---
title: "Redis 源码阅读：09. String 对象 (int, embstr, raw)"
date: 2026-01-10T18:00:00+08:00
description: "Redis String 只有一种吗？不，它有三种编码：int, embstr, raw。它们有何区别？Redis 何时会进行编码转换？"
tags: [Redis, Source Code, String, Encoding]
weight: 9
---

String 是 Redis 最基本的数据类型。但你知道吗？当你执行 `SET key value` 时，底层可能会生成三种完全不同的结构。

## 1. 三种编码

### 1.1 int
如果一个字符串对象保存的是**整数值**，且这个整数可以用 `long` 类型表示，Redis 会直接将这个整数保存在 `redisObject` 的 `ptr` 指针字段中（将指针强转为 long）。
*   **优点**：无需分配额外的 SDS 空间，极省内存。

### 1.2 embstr (Embedded String)
如果字符串长度小于等于 **44 字节**，Redis 会使用 embstr 编码。
*   **特点**：`redisObject` 和 `sdshdr` 是**连续内存**。
*   **优点**：
    1.  内存分配次数从 2 次降为 1 次。
    2.  内存释放也只需 1 次。
    3.  连续内存缓存命中率更高。

**为什么是 44 字节？**
`redisObject` (16 bytes) + `sdshdr8` (3 bytes) + `\0` (1 byte) = 20 bytes。
内存分配器 (jemalloc) 分配内存通常是 64 字节为一个 chunk。
64 - 20 = 44。所以 44 字节是 embstr 的极限。

### 1.3 raw
如果字符串长度大于 44 字节，或者字符串被修改过（embstr 是只读的，修改会强制转为 raw），Redis 会使用 raw 编码。
*   **特点**：`redisObject` 和 `sdshdr` 是**分开分配**的，`ptr` 指向 SDS。

## 2. 编码转换

Redis 总是尝试使用最节省内存的编码。

1.  `SET key 100` -> **int**
2.  `APPEND key "a"` -> 100a (不再是整数) -> **raw** (注意：APPEND 操作会直接导致 int 转 raw，embstr 转 raw)
3.  `SET key "hello"` -> **embstr**
4.  `SET key "a...a"` (45个a) -> **raw**
