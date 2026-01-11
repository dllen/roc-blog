---
title: "HBase 源码阅读：08. 读流程详解 (Read Path)"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Read Path, Scanner]
weight: 8
---

HBase 的读路径比写路径复杂得多，因为需要合并内存（MemStore）和磁盘（HFile）中的数据，并处理删除标记（Tombstone）。

## 1. 客户端流程

1.  **Locate**: 查询 Meta Cache 找到目标 RegionServer。
2.  **RPC**: 发送 `GetRequest` 或 `ScanRequest` 给 RS。

## 2. RegionServer 处理 (`HRegion.get`)

### 2.1 检查与准备
*   检查 Region 是否在线。
*   获取读锁（Shared Lock），防止读的过程中 MemStore 被 Flush 或 StoreFile 被 Compaction 删除。

### 2.2 构建 Scanner (`RegionScanner`)
这是读操作的核心。`RegionScanner` 由多个 `StoreScanner` 组成（每个 Column Family 一个）。
而 `StoreScanner` 又由多个 `KeyValueScanner` 组成：
*   **MemStoreScanner**: 扫描 Active 和 Snapshot MemStore。
*   **StoreFileScanner**: 扫描 HFile（可能经过 BlockCache）。

### 2.3 `KeyValueScanner` 堆排序
这是一个多路归并排序的过程。所有 Scanner 被放入一个最小堆（PriorityQueue）中，按照 KeyValue 的排序规则（RowKey -> CF -> Col -> Timestamp -> Type）排列。
每次 `next()` 取出堆顶元素（最小的 KV），这就是当前 RowKey 的最新版本数据。

## 3. Scan 与 Get 的区别
其实 `Get` 在内核中就是 `Scan` 的特例（Scan 一行）。

## 4. 读优化
*   **Bloom Filter**: 快速判断 RowKey 是否在 HFile 中，避免无效 IO。
*   **BlockCache**: 缓存热点 Data Block。

---
**Next**: [HBase 源码阅读：09. 写流程详解 (Write Path)](../09-write-path/)
