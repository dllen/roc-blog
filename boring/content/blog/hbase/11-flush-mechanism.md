---
title: "HBase 源码阅读：11. Flush 机制"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Flush, MemStore]
weight: 11
---

在 HBase 的 LSM-Tree 架构中，数据首先写入内存中的 MemStore。当 MemStore 达到一定大小时，需要将数据刷写（Flush）到磁盘生成 HFile。Flush 机制是连接内存与磁盘的关键桥梁，它直接影响写入性能、内存使用率以及后续的 Compaction 压力。

本文将基于 HBase 2.x 源码，深入分析 Flush 的触发时机、核心流程以及相关策略。

## 1. Flush 的触发时机 (Trigger)

HBase 中触发 Flush 的条件非常多样，不仅限于 MemStore 大小，还涉及 RegionServer 的内存压力、WAL 文件数量等。

### 1.1 MemStore 级别限制 (Region Level)
这是最常见的触发方式。当一个 Region 中所有 MemStore 的大小总和超过阈值时，会触发 Flush。
*   **参数**: `hbase.hregion.memstore.flush.size` (默认 128MB)
*   **行为**: 这是一个 Soft Limit。当达到此值时，RegionServer 会请求 Flush 该 Region，但**不会阻塞写请求**。

### 1.2 RegionServer 全局内存限制 (Global Level)
为了防止 RegionServer OOM，HBase 有全局的内存限制。
*   **低水位 (Low Watermark)**: `hbase.regionserver.global.memstore.size.lower.limit` (默认堆内存 * 0.4 * 0.95)
    *   当 RS 上所有 MemStore 总大小超过此值，会强制 Flush 占用内存最大的 Region，直到总大小降到低水位以下。**此时不会阻塞写**，但在日志中会有警告。
*   **高水位 (High Watermark)**: `hbase.regionserver.global.memstore.size` (默认堆内存 * 0.4)
    *   当 RS 上所有 MemStore 总大小超过此值，**会阻塞该 RS 上的所有写请求**，并强制 Flush，直到内存回落到低水位。这是非常严重的性能卡顿点。

### 1.3 Region 级别阻塞限制 (Blocking)
如果某个 Region 的 MemStore 持续增长（写入速度 > Flush 速度），达到了 Flush Size 的倍数，为了保护 RS，会阻塞该 Region 的写请求。
*   **参数**: `hbase.hregion.memstore.block.multiplier` (默认 4)
*   **阈值**: `flush.size` * `block.multiplier` (默认 128MB * 4 = 512MB)
*   **行为**: 阻塞写请求，直到 Flush 完成。

### 1.4 WAL 数量限制
为了限制故障恢复（Replay WAL）的时间，HBase 不允许保留过多的 WAL 文件。
*   **参数**: `hbase.regionserver.maxlogs` (默认 32)
*   **行为**: 当 WAL 文件数量超过阈值，会找到最老的 WAL 对应的 Region 进行 Flush，以便可以归档旧的 WAL 文件。

### 1.5 定期 Flush
即使没有写请求，为了数据安全，HBase 也会定期 Flush。
*   **参数**: `hbase.regionserver.optionalcacheflushinterval` (默认 3600000ms = 1小时)
*   **行为**: 只有当 MemStore 大小大于 0 且上次 Flush 距离现在超过间隔时触发。

### 1.6 手动 Flush
用户可以通过 Shell (`flush 'tableName'`) 或 Admin API 手动触发。

## 2. 核心类概览

在深入流程之前，先认识几个关键类：

*   **`HRegion`**: Region 的核心实现，负责处理 Put/Get 请求，也是 Flush 的发起者。
*   **`MemStoreFlusher`**: RegionServer 内部的后台线程（Chore），维护一个 Flush 队列 (`FlushQueue`)，负责异步执行 Flush 任务。
*   **`HStore`**: 对应一个 Column Family，包含 MemStore 和 StoreFiles。
*   **`DefaultStoreFlusher`**: 具体的 Flush 逻辑实现者，负责将内存数据写成 HFile。

## 3. Flush 核心流程 (Process)

Flush 的执行过程大致可以分为三个阶段：**Prepare (准备)**、**Flush (刷写)**、**Commit (提交)**。

### 3.1 阶段一：Prepare (准备阶段)
此阶段在 `HRegion.internalFlushcache` 中进行。目标是创建 MemStore 的快照 (Snapshot)。

1.  **加写锁 / 更新锁**: 阻塞对该 Region 的更新操作（或者更细粒度的锁），确保内存状态一致性。
2.  **创建快照**: 遍历 Region 下的所有 Store，调用 `Store.snapshot()`。
    *   这步操作非常快，只是将当前的 `Active MemStore` 切换为 `Snapshot MemStore`，并创建一个新的空 `Active MemStore` 接收新写入。
3.  **释放锁**: 快照创建完成后，立即释放锁。
    *   **关键点**: 这里实现了 **Non-Blocking Flush**。只有在创建快照的短暂时间内会阻塞写，后续的磁盘 IO 过程不会阻塞写请求。

### 3.2 阶段二：Flush (刷写阶段)
此阶段比较耗时，主要是磁盘 IO 操作。

1.  **选择 Store**: 根据 Flush 策略（如 `FlushAllLargeStoresPolicy`），决定哪些 Store 需要刷写。
2.  **执行刷写**: 对每个需要刷写的 Store，调用 `StoreFlusher.flushSnapshot()`。
    *   遍历 Snapshot 中的 KeyValue。
    *   通过 `StoreFileWriter` 将 KeyValue 写入临时目录下的 HFile 文件。
    *   **追加 MemStore 扫描**: 如果在刷写过程中有新的数据写入（因为锁已释放），这些新数据在新的 Active MemStore 中，不会包含在本次 Flush 中。

### 3.3 阶段三：Commit (提交阶段)
IO 完成后，需要更新元数据并清理快照。

1.  **移动文件**: 将 HFile 从临时目录移动到正式的 Region 目录下。
2.  **加载 Reader**: 创建 `StoreFile` 对象并加载 Reader，将其加入到 `StoreFileManager` 中，此时新生成的 HFile 对读请求可见。
3.  **清理快照**: 清空 `Snapshot MemStore`，释放内存。
4.  **更新 WAL**: 记录 Flush Marker 到 WAL 中，表示该 SequenceId 之前的数据已持久化，对应的旧 WAL 可以被清理了。

## 4. 源码调用链分析

```java
// 1. 触发入口 (例如 MemStoreFlusher 线程)
MemStoreFlusher.flushRegion(FlushRegionEntry)
  -> HRegion.flushcache() // 发起 Flush

// 2. HRegion 内部逻辑
HRegion.internalFlushcache() {
  // --- Phase 1: Prepare ---
  // 获取写锁 (updatesLock.writeLock())
  // 遍历 Stores，创建快照
  for (HStore s : stores) {
    s.snapshot(); // Active -> Snapshot
  }
  // 释放写锁，允许新的写入
  
  // --- Phase 2: Flush ---
  // 具体的 IO 操作，耗时最长
  for (HStore s : specificStoresToFlush) {
    HStore.flushCache();
      -> StoreFlusher.flushSnapshot()
        -> 创建 HFile Writer
        -> 遍历 MemStoreScanner 写入磁盘
  }
  
  // --- Phase 3: Commit ---
  // 移动文件，更新 StoreFileManager
  HStore.commitFile();
  // 清理 Snapshot
  HRegion.clearSnapshots();
}
```

## 5. 关键问题与调优

### 5.1 为什么会产生小文件？
如果 Flush 过于频繁（例如 `flush.size` 设置过小，或者因为全局内存压力导致强制 Flush），会生成大量小的 HFile。
*   **后果**: 增加 Compaction 压力，影响读取性能。
*   **解决**: 调大 `hbase.hregion.memstore.flush.size`，合理设置全局内存水位。

### 5.2 Flush 对读写的影响
*   **对写**: 正常情况下影响微乎其微（毫秒级锁）。但如果触发 Blocking 机制（MemStore 积压），写请求会被严重阻塞。
*   **对读**: Flush 完成后，新的 HFile 加入，可能会触发 Minor Compaction，短时间内增加 IO 压力，但长期看有助于减少 MemStore 扫描开销。

### 5.3 调优建议
1.  **增加 Flush Size**: 在内存允许的情况下，尽量调大 `hbase.hregion.memstore.flush.size` (如 256MB)，减少 Flush 频率和 HFile 数量。
2.  **调整 Blocking 倍数**: 如果写入突发流量大，可以适当调大 `hbase.hregion.memstore.block.multiplier`，给系统更多缓冲时间。
3.  **关注日志**: 监控日志中出现的 `Too many store files` 或 `Blocking updates` 警告。

## 6. 总结
HBase 的 Flush 机制是 LSM-Tree 实现的核心环节。它巧妙地通过“快照+异步IO”实现了高吞吐的写入，同时通过多级触发策略保证了内存的安全。理解 Flush 流程对于排查写入性能抖动（Write Stalls）至关重要。

---
**Next**: [HBase 源码阅读：12. Compaction 原理](../12-compaction/)
