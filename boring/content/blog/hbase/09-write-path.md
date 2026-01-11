---
title: "HBase 源码阅读：09. 写流程详解 (Write Path)"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Write Path, WAL]
weight: 9
---

HBase 的写路径设计遵循 LSM-Tree 原则，追求极致的写入性能（转化为顺序写）。

## 1. 客户端流程

1.  **Buffer**: `Put` 对象默认会被缓冲在 Client 端（`BufferedMutator`），达到阈值或手动 flush 时才发送。
2.  **RPC**: 发送 `MutateRequest` 给 RS。

## 2. RegionServer 处理 (`HRegion.put`)

### 2.1 获取行锁 (`RowLock`)
为了保证行级别的原子性，必须先获取行锁。
*   使用 `HashedBytes` 映射到有限数量的锁对象上，减少内存开销。

### 2.2 更新 WAL (Write Ahead Log)
为了容错，数据必须先写入 WAL。
*   构建 `WALEdit` 对象。
*   调用 `FSHLog.append()` 将日志写入 RingBuffer。
*   调用 `sync()` 确保日志落盘（根据 Durability 设置）。

### 2.3 更新 MemStore
WAL 写成功后，将数据写入 MemStore。
*   MemStore 内部是一个 `ConcurrentSkipListMap` (CSLM)，支持并发写入。
*   写入内存非常快。

### 2.4 释放锁
释放行锁，请求完成。

## 3. MVCC (Multi-Version Concurrency Control)
HBase 使用 MVCC 解决读写并发问题。
*   **Write**: 写入开始申请 WriteNumber，写入完成推进 ReadPoint。
*   **Read**: 只能读取 SequenceId <= 当前 ReadPoint 的数据。
这保证了读请求不会读到写了一半的数据。

---
**Next**: [HBase 源码阅读：10. WAL 机制](../10-wal-mechanism/)
