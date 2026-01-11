---
title: "Redis 源码阅读：19. AOF (日志持久化)"
date: 2026-01-11T17:00:00+08:00
description: "AOF 如何保证数据不丢失？三种刷盘策略的实现原理，以及 AOF 重写 (Rewrite) 机制。"
tags: [Redis, Source Code, Persistence, AOF]
weight: 19
---

AOF (Append Only File) 通过记录 Redis 执行的每一条**写命令**来实现持久化。
代码位于 `src/aof.c`。

## 1. 命令追加 (Append)
当 Redis 执行完一个写命令后，会将该命令以 RESP 协议格式追加到 `server.aof_buf` 缓冲区。

## 2. 文件写入与同步 (Write & Fsync)
Redis 主循环每次结束前，都会调用 `flushAppendOnlyFile` 函数，决定是否将缓冲区写入磁盘。
策略由 `appendfsync` 参数控制：
*   **always**：每次写命令都立即调用 `fsync`。最安全，但最慢。
*   **everysec**：每秒调用一次 `fsync` (默认)。折中方案，最多丢失 1 秒数据。
*   **no**：只调用 `write`，不调用 `fsync`，由操作系统决定何时回写磁盘。

## 3. AOF 重写 (Rewrite)
随着时间推移，AOF 文件会越来越大。比如我对一个 Key `INCR` 了 100 次，AOF 记录了 100 条命令，但实际上只需要一条 `SET key 100` 就能恢复。
AOF 重写就是为了解决这个问题。

**流程**：
1.  **Fork 子进程**。
2.  **子进程**遍历内存数据，生成新的 AOF 文件 (类似于 RDB 快照，但是是 RESP 格式)。
3.  **父进程**继续处理请求，并将这期间产生的新写命令积累到 **AOF 重写缓冲区 (AOF Rewrite Buffer)**。
4.  子进程写完退出。
5.  父进程将重写缓冲区的内容追加到新 AOF 文件末尾。
6.  原子替换旧 AOF 文件。

## 4. Redis 7.0 Multi-Part AOF
Redis 7.0 对 AOF 进行了重大重构，引入了 **Multi-Part AOF (MP-AOF)**。
AOF 不再是一个单文件，而是由三部分组成：
1.  **Base AOF** (RDB 格式或 AOF 格式)：重写后的基础数据。
2.  **Incr AOF**：增量数据。
3.  **Manifest**：清单文件，管理上述文件的版本。

这使得 AOF 重写不再需要浪费 CPU 去合并历史数据，只需要将当前的 Incr AOF 变为 Base AOF 即可，极大优化了重写性能。
