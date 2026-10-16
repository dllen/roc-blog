---
title: "HBase 源码阅读：12. Compaction 原理"
date: 2026-01-12T10:00:00+08:00
description: "HBase Compaction 机制源码解析：Minor / Major Compaction 触发策略、合并选择算法、Compactor 线程池调度。"
taxonomies:
  tags: [HBase, Source Code, Compaction, LSM]
weight: 12
tldr: "Compaction 是 LSM Tree 维护读性能的关键机制，用于减少 HFile 数量并清理过期数据。"
keywords: ["HBase", "源码阅读", "12.", "Compaction", "原理", "Source Code", "LSM"]
---
## 0. 本章定位

HBase 源码阅读：12. Compaction 原理：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Compaction 是 LSM-Tree 维护读性能的关键机制，用于减少 HFile 数量并清理过期数据。

## 1. 分类

*   **Minor Compaction**: 选取相邻的几个 HFile 合并成一个较大的 HFile。
    *   目的：减少文件数量，提升读性能。
    *   **不**清理 Delete Marker (Tombstone)。
*   **Major Compaction**: 将 Store 下**所有** HFile 合并成一个。
    *   目的：清理过期数据、删除标记。
    *   代价：消耗大量 IO 和 CPU，通常建议在业务低峰期手动触发。

## 2. 触发条件 (`CompactionChecker`)

*   **MemStore Flush**: 每次 Flush 后，检查 HFile 数量。
*   **定期检查**: 后台线程周期性检查 (`hbase.server.thread.wakefrequency`)。
*   **手动触发**: Admin API。

## 3. 核心策略 (`RatioBasedCompactionPolicy`)

决定合并哪些文件。
1.  **排除过大文件**: 超过 `hbase.hstore.compaction.max.size` 的文件不参与 Minor。
2.  **Ratio 检查**: 如果 `FileSize(i) < Ratio * Sum(FileSize(0...i-1))`，则认为文件 i 太小，应该合并。
    *   简单说，就是避免合并“一大堆小文件 + 一个大文件”的情况，尽量让合并的文件大小相近。

## 4. 执行流程 (`Compactor`)

1.  **Select**: 根据 Policy 选出文件列表。
2.  **Scan**: 创建 Scanner 扫描这些文件（多路归并）。
3.  **Writer**: 将 Scanner 读出的 KV 写入新的 HFile。
4.  **Replace**: 将新文件移动到 Store 目录，删除旧文件，更新 StoreFileManager。

---
**Next**: [HBase 源码阅读：13. HFile 格式解析](../13-hfile-format/)
