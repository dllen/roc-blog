---
title: "HBase 源码阅读：12. Compaction 原理"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Compaction, LSM]
weight: 12
---

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
