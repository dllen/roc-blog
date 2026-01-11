---
title: "Redis 源码阅读：20. 主从复制 (Replication)"
date: 2026-01-11T18:00:00+08:00
description: "Redis 主从复制是如何实现的？PSYNC 命令详解，全量复制与增量复制的流程。"
tags: [Redis, Source Code, Distributed, Replication]
weight: 20
---

主从复制是 Redis 高可用的基础。
代码位于 `src/replication.c`。

## 1. 建立连接
Slave 启动时，发送 `PSYNC` 命令给 Master。

## 2. 全量复制 (Full Resync)
如果是第一次同步，或者无法进行部分同步：
1.  **Master**: 执行 BGSAVE，生成 RDB 文件。
2.  **Master**: 将 RDB 文件发送给 Slave。
3.  **Slave**: 清空旧数据，加载 RDB 文件。
4.  **Master**: 将这期间产生的写命令（记录在 `server.slaveseldb` 和 Replication Buffer 中）发送给 Slave。

## 3. 部分复制 (Partial Resync)
如果 Slave 只是短暂断线重连，全量复制太浪费。Redis 2.8 引入了 `PSYNC` 支持增量复制。
核心机制：
*   **RunID**: Master 的唯一标识。
*   **Replication Offset**: 复制偏移量。Master 和 Slave 都会维护这个 Offset。
*   **Replication Backlog**: 一个固定大小的环形缓冲区（默认 1MB）。Master 会将所有写命令都存一份在这里。

**流程**：
1.  Slave 发送 `PSYNC <runid> <offset>`。
2.  Master 检查 RunID 是否匹配，且 Offset 之后的数据是否还在 Backlog 中。
3.  如果满足，Master 直接将 Backlog 中 Offset 之后的数据发给 Slave。
4.  如果不满足（Offset 太旧，已被覆盖），触发全量复制。

## 4. 命令传播
同步完成后，Master 每次执行写命令，都会异步发送给所有 Slave，保持数据一致。
