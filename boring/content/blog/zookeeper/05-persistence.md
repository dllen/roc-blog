---
title: "ZooKeeper 源码阅读：05. 持久化机制"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Persistence, TxnLog, Snapshot]
weight: 5
---

为了保证数据不丢失，内存中的 DataTree 需要持久化到磁盘。

## 1. Transaction Log (TxnLog)
所有写请求（Create, SetData, Delete）都会被转换为 Transaction，并追加写入 TxnLog。
*   **文件格式**: `log.<zxid>`。文件名后缀是该文件第一条事务的 ZXID。
*   **预分配**: ZK 会预先分配 64MB 的空文件，避免每次写入都修改文件元数据，提高性能。
*   **Group Commit**: 并不是每条日志都刷盘，而是积攒一批或定时刷盘（`fsync`）。

## 2. Snapshot (快照)
TxnLog 记录的是增量变化，Snapshot 则是某一时刻 DataTree 的全量 Dump。
*   **文件格式**: `snapshot.<zxid>`。
*   **Fuzzy Snapshot (模糊快照)**: ZK 在 Dump 快照时**不阻塞**写请求。这意味着快照文件中的数据可能不一致（部分节点是旧的，部分是新的）。
    *   **恢复**: ZK 在恢复时，先加载 Snapshot，然后重放该 Snapshot 之后的所有 TxnLog。由于操作是幂等的，这保证了最终一致性。

## 3. 触发机制
当 TxnLog 记录次数达到阈值（`snapCount`，默认 100,000）时，触发 Snapshot。
*   为了避免集群中所有节点同时 Snapshot 导致 IO 风暴，实际阈值是一个随机数：`snapCount / 2 + rand(snapCount / 2)`。

---
**Next**: [ZooKeeper 源码阅读：06. 网络通信](../06-networking/)
