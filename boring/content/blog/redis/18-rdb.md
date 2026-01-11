---
title: "Redis 源码阅读：18. RDB (快照持久化)"
date: 2026-01-11T16:00:00+08:00
description: "RDB 文件是如何生成的？fork 子进程与 Copy-On-Write 技术详解。"
tags: [Redis, Source Code, Persistence, RDB]
weight: 18
---

RDB (Redis Database) 是 Redis 的默认持久化方式，它将内存中的数据以二进制格式生成快照保存到磁盘 (`dump.rdb`)。

## 1. 触发方式
*   **SAVE**：阻塞主线程，直到 RDB 完成。生产环境慎用。
*   **BGSAVE**：Fork 子进程在后台进行 RDB，主线程继续处理请求。

## 2. BGSAVE 流程详解
代码位于 `src/rdb.c`。

1.  **Fork 子进程**：
    Redis 调用 `fork()` 系统调用。
    *   **父进程**：继续处理客户端命令。
    *   **子进程**：拥有父进程 fork 瞬间的内存副本。
2.  **Copy-On-Write (COW)**：
    Linux 的 `fork()` 是高效的。它不会立刻复制物理内存，而是让父子进程共享同一份物理内存，并将页表设置为只读。
    *   当父进程**读**数据时，无事发生。
    *   当父进程**写**数据时，触发 Page Fault，操作系统将该页复制一份给父进程修改，子进程看到的依然是旧数据。
    这就是为什么 Redis 在 BGSAVE 期间依然能处理写请求，且 RDB 快照的数据是**时间点一致**的。
3.  **生成 RDB 文件**：
    子进程遍历所有数据库，将 Key-Value 序列化并写入临时文件。
4.  **替换文件**：
    写入完成后，子进程退出。父进程收到信号，用临时文件原子替换旧的 `dump.rdb`。

## 3. RDB 文件结构
RDB 文件非常紧凑：
```
"REDIS" <version> <db-selector> <key-value-pairs> <EOF> <checksum>
```
它直接存储二进制数据，因此加载速度极快，适合备份和灾难恢复。
