---
title: "HBase 源码阅读：14. BlockCache 缓存"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, BlockCache, Cache]
weight: 14
---

为了加速读取，HBase 在内存中缓存了热点 Data Block。

## 1. 缓存策略

HBase 提供了多种 BlockCache 实现，目前默认是混合使用的策略。

### 1.1 `LruBlockCache` (On-Heap)
*   **原理**: 基于 Java Heap 的 LRU 缓存。
*   **分层**:
    *   **Single**: 第一次访问的 Block（25%）。
    *   **Multi**: 被访问多次的 Block（50%）。
    *   **Memory**: 常驻内存（如 Meta 表）（25%）。
*   **缺点**: 受限于 JVM GC，堆内存太大容易导致 Full GC 时间过长。

### 1.2 `BucketCache` (Off-Heap)
*   **原理**: 使用堆外内存（Direct Memory）或文件存储。
*   **内存管理**: 自己管理内存块的分配和回收，避免 GC 影响。
*   **Bucket**: 内存被划分为不同大小的 Bucket（如 4K, 8K, 64K...），Block 放入最接近其大小的 Bucket 中。

## 2. 组合模式 (`CombinedBlockCache`)

通常配置为：
*   **L1 Cache**: `LruBlockCache` (存放 Index Block 和 Bloom Filter)。因为这些元数据较小且访问频繁。
*   **L2 Cache**: `BucketCache` (存放 Data Block)。存放实际数据，利用堆外大内存。

## 3. 缓存读取流程

1.  Client 请求读取某一行。
2.  定位到对应的 HFile。
3.  检查 BlockCache 是否有对应的 Data Block。
    *   **Hit**: 直接返回，无需 IO。
    *   **Miss**: 从 HDFS 读取 Block，解压，放入 BlockCache，返回。

---
**Next**: [HBase 源码阅读：15. Region 切分 (Split)](../15-region-split/)
