---
title: "Redis 源码阅读：23. 事务 (Transaction)"
date: 2026-01-11T21:00:00+08:00
description: "Redis 事务支持 ACID 吗？为什么 Redis 不支持回滚？MULTI, EXEC, WATCH 原理详解。"
tags: [Redis, Source Code, Transaction, ACID]
weight: 23
---

Redis 的事务由 `MULTI`, `EXEC`, `DISCARD`, `WATCH` 命令组成。
代码主要在 `src/multi.c`。

## 1. 事务执行流程
1.  **MULTI**：开启事务。客户端状态 `c->flags` 加上 `CLIENT_MULTI`。
2.  **命令入队**：后续发送的命令（除了 EXEC/DISCARD/WATCH）不会立即执行，而是被放入一个队列 (`c->mstate.commands`) 中，并返回 `QUEUED`。
3.  **EXEC**：执行事务。Redis 遍历队列，依次执行所有命令，并将所有结果一次性返回。

## 2. WATCH 机制 (乐观锁)
`WATCH key` 用于监视一个或多个 Key。
如果在事务执行（EXEC）之前，被监视的 Key 被其他客户端修改了，那么整个事务将**中断执行**，返回 `(nil)`。

**实现**：
Redis 维护一个 `watched_keys` 字典。
当执行写命令时，会检查修改的 Key 是否在 `watched_keys` 中。如果是，则将监视该 Key 的所有客户端标记为 `CLIENT_DIRTY_CAS`。
当客户端执行 `EXEC` 时，如果检测到自己被标记为 `CLIENT_DIRTY_CAS`，则拒绝执行事务。

## 3. ACID 特性分析
*   **原子性 (Atomicity)**：Redis 事务**不完全满足**原子性。
    *   如果命令入队时就报错（如语法错误），整个事务不执行（原子性）。
    *   如果入队成功，但执行时报错（如对 String 用了 List 命令），**该条命令失败，但其他命令继续执行**。Redis **不支持回滚 (Rollback)**。
*   **一致性 (Consistency)**：满足。
*   **隔离性 (Isolation)**：满足。Redis 单线程执行命令，事务期间不会被插入其他命令。
*   **持久性 (Durability)**：取决于 AOF/RDB 配置。
