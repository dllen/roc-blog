---
title: "Flink 源码阅读：15. StateBackend"
date: 2026-01-13T01:00:00+08:00
description: "HeapStateBackend 与 RocksDBStateBackend 的源码对比与选型建议。"
taxonomies:
  tags: [Flink, Source Code, StateBackend, RocksDB]
weight: 15
tldr: "HeapStateBackend 与 RocksDBStateBackend 的源码对比与选型建议。"
keywords: ["Flink", "源码阅读", "15.", "StateBackend", "Source Code", "RocksDB"]
---

StateBackend 决定了 Flink 状态数据的存储方式。






## 0. 本章定位

StateBackend 决定 Flink 状态大小上限与性能。HashMapStateBackend 走 JVM Heap + CopyOnWriteStateTable（快但 GC 压力大，受限于 Heap 大小）；RocksDBStateBackend 走堆外 + 磁盘 + LSM-Tree（支持 TB 级，慢但可扩）。生产选型：作业 State < 1GB 用 HashMap（快），> 10GB 必须 RocksDB。本章讲 Backend 接口、序列化器、增量 checkpoint 配置（state.backend.incremental），是调优 Flink 大状态作业的必修。

## 1. HashMapStateBackend (Heap)
*   **存储**: 状态存储在 JVM 堆内存的 Java 对象中（通常是 `CopyOnWriteStateTable`）。
*   **优点**: 读写速度极快（内存引用）。
*   **缺点**: 受限于 JVM Heap 大小，容易 GC，重启需要加载全部数据。
*   **Checkpoint**: 将内存中的状态序列化并写入 DFS。

## 2. EmbeddedRocksDBStateBackend
*   **存储**: 状态存储在本地的 RocksDB 数据库（磁盘/SSD）中。
*   **序列化**: 每次读写都需要序列化/反序列化（KV 结构）。
*   **优点**: 支持超大状态（TB 级），不受 JVM 限制，增量 Checkpoint 高效。
*   **缺点**: 读写需要经过 JNI 和序列化，比 Heap 慢。

## 3. ChangelogStateBackend
Flink 1.15 引入。
在 StateBackend 之上增加了一层 Changelog Log (DSTL)。
Checkpoint 时只需要上传 Changelog，大大缩短了 Checkpoint 时间，实现了秒级 Checkpoint。
