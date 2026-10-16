---
title: "ZooKeeper 源码阅读：05. 持久化机制"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper 持久化层源码解析：TxnLog 事务日志、Snapshot 快照、FileTxnSnapLog 协调、定时 fsync 策略。"
taxonomies:
  tags: [ZooKeeper, Source Code, Persistence, TxnLog, Snapshot]
weight: 5
tldr: "为了保证数据不丢失，内存中的 DataTree 需要持久化到磁盘。"
keywords: ["ZooKeeper", "源码阅读", "05.", "持久化机制", "Source Code", "Persistence", "TxnLog", "Snapshot"]
---
## 0. 本章定位

ZooKeeper 源码阅读：05. 持久化机制：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

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
