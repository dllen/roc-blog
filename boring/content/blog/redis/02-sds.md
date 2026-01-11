---
title: "Redis 源码阅读：02. SDS (Simple Dynamic String)"
date: 2026-01-10T11:00:00+08:00
description: "深入解析 Redis 的 SDS 字符串结构。为什么 Redis 不直接使用 C 语言字符串？SDS 如何实现二进制安全、内存预分配与惰性释放？"
tags: [Redis, Source Code, C, Data Structure, SDS]
weight: 2
---

在 Redis 中，字符串是最基础的数据类型。但 Redis 并没有直接使用 C 语言传统的字符串（以 `\0` 结尾的字符数组），而是自己构建了一种名为 **SDS (Simple Dynamic String，简单动态字符串)** 的抽象类型。

为什么 Redis 要重新造轮子？SDS 到底长什么样？本文将带你深入 `sds.h` 和 `sds.c` 一探究竟。

## 1. C 字符串的痛点

要理解 SDS 的设计，首先得知道 C 语言字符串（C-String）有哪些缺陷：

1.  **获取长度 O(N)**：C 字符串不记录长度，必须遍历整个数组找到 `\0` 才能计算出长度。这对于高频操作 `STRLEN` 来说是无法接受的。
2.  **二进制不安全**：C 字符串以 `\0` 作为结束符，这意味着字符串中间不能包含空字符。这限制了它只能存储文本，无法存储图片、音频、压缩包等二进制数据。
3.  **缓冲区溢出风险**：C 字符串拼接（`strcat`）时，如果程序员忘记分配足够的空间，就会导致缓冲区溢出，覆盖相邻内存的数据，造成程序崩溃或安全漏洞。
4.  **内存管理效率低**：每次修改字符串长度（增长或缩短），都需要重新进行内存分配（`realloc`），开销巨大。

## 2. SDS 的结构设计

Redis 在 `sds.h` 中定义了 SDS 的头部结构。为了节省内存，Redis 设计了 5 种不同类型的 Header (`sdshdr5`, `sdshdr8`, `sdshdr16`, `sdshdr32`, `sdshdr64`)，根据字符串长度选择最小的头部。

以最常用的 `sdshdr8` 为例：

```c
struct __attribute__ ((__packed__)) sdshdr8 {
    uint8_t len;         /* 已使用长度 (buf 中实际保存的字符串长度) */
    uint8_t alloc;       /* 分配的总长度 (不包括 header 和 null 结束符) */
    unsigned char flags; /* 标志位 (低3位表示类型，高5位未使用) */
    char buf[];          /* 柔性数组，存放实际内容 */
};
```

### 关键设计点：

1.  **O(1) 获取长度**：`len` 字段直接记录了字符串长度，`STRLEN` 命令瞬间完成。
2.  **二进制安全**：SDS 虽然也保留了末尾的 `\0`（为了兼容 C 标准库函数如 `printf`），但它不以 `\0` 判断结束，而是严格依赖 `len` 属性。因此，`buf` 中间可以安全地包含 `\0`。
3.  **紧凑内存布局**：`__attribute__ ((__packed__))` 告诉编译器取消字节对齐，强制结构体紧凑排列。这不仅节省内存，还让 SDS 指针（指向 `buf` 的指针）可以通过 `sds[-1]` 快速访问到 `flags`，进而确定 Header 类型。

## 3. 内存管理策略

SDS 通过 **空间预分配** 和 **惰性空间释放** 两种策略，解决了 C 字符串内存分配频繁的问题。

### 3.1 空间预分配 (Space Pre-allocation)

当 SDS 需要进行扩展（如 `sdscat`）时，Redis 不仅会分配所需的空间，还会多分配一部分作为缓冲（Free Space）。

逻辑在 `sds.c/sdsMakeRoomFor` 函数中：

*   **如果修改后长度 < 1MB**：分配 `new_len * 2` 的空间。例如，增长后需要 100 字节，实际分配 200 字节。
*   **如果修改后长度 >= 1MB**：分配 `new_len + 1MB` 的空间。避免分配过大的内存造成浪费。

这种策略将连续 N 次字符串追加操作的内存重分配次数，从 N 次降低为 **最多 N 次**（通常远小于 N）。

### 3.2 惰性空间释放 (Lazy Freeing)

当 SDS 缩短（如 `sdstrim`）时，Redis **不会立即回收** 多余的内存，而是更新 `len`，保持 `alloc` 不变。

这就为将来可能的增长操作预留了空间。当然，如果你真的需要释放内存，可以使用 `sdsRemoveFreeSpace` 函数来真正释放未使用的空间。

## 4. 源码精读：sdsMakeRoomFor

让我们看一眼 `sds.c` 中最核心的扩容逻辑（简化版）：

```c
sds sdsMakeRoomFor(sds s, size_t addlen) {
    void *sh, *newsh;
    size_t avail = sdsavail(s); // 计算剩余空间: alloc - len
    size_t len, newlen;
    char type, oldtype = s[-1] & SDS_TYPE_MASK; // 获取当前 header 类型

    // 1. 如果剩余空间足够，直接返回
    if (avail >= addlen) return s;

    len = sdslen(s);
    sh = (char*)s - sdsHdrSize(oldtype);
    newlen = (len+addlen);

    // 2. 预分配策略
    if (newlen < SDS_MAX_PREALLOC) // SDS_MAX_PREALLOC = 1MB
        newlen *= 2;
    else
        newlen += SDS_MAX_PREALLOC;

    // 3. 重新计算 Header 类型 (因为长度变了，可能需要升级 Header，如 sdshdr8 -> sdshdr16)
    type = sdsReqType(newlen);
    
    // ... (省略 Header 类型处理逻辑)

    // 4. 执行 realloc
    newsh = s_realloc(sh, hdrlen+newlen+1);
    if (newsh == NULL) return NULL;
    
    // ... (更新 Header 字段)
    
    return (char*)newsh + hdrlen;
}
```

## 5. 总结

SDS 是 Redis 源码中最简单但也最精妙的设计之一。它通过简单的结构体封装，完美解决了 C 字符串的诸多痛点，实现了：
*   **高性能**：O(1) 长度获取，减少内存分配。
*   **安全性**：杜绝缓冲区溢出，支持二进制数据。
*   **兼容性**：保留 `\0` 结尾，兼容部分 C 字符串函数。

理解了 SDS，你就迈出了阅读 Redis 源码的坚实第一步。下一篇，我们将挑战 Redis 中最为核心的数据结构 —— **Dict (字典)**，看看 Redis 是如何实现高效的 Hash 表及渐进式 Rehash 的。
