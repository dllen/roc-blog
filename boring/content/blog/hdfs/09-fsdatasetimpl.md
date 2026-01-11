---
title: "HDFS 源码阅读：09. 存储管理 (FsDatasetImpl)"
date: 2026-01-20T10:00:00+08:00
description: "深入 DataNode 内部的 FsDatasetImpl，解析 HDFS 如何在本地文件系统上组织 Block。"
tags: [Hadoop, HDFS, DataNode, Storage]
weight: 9
---

`FsDatasetImpl` 是 DataNode 端管理磁盘数据的核心类，实现了 `FsDatasetSpi` 接口。

## 1. 目录结构

在 DataNode 的配置目录 (`dfs.datanode.data.dir`) 下，Block 是怎么存放的？

```text
/data/current/BP-xx-xx/current/finalized/
    subdir0/
        subdir0/
            blk_1001
            blk_1001_1001.meta
            ...
        subdir1/
    subdir1/
```

*   **Block File (`blk_id`)**: 存储实际数据。
*   **Meta File (`blk_id_genstamp.meta`)**: 存储 Checksum 数据（默认 CRC32C）和 Block 生成时间戳。
*   **Subdirs**: 为了避免单目录下文件过多导致文件系统性能下降，HDFS 使用两级子目录 (`subdir0/subdir0`) 分散存储。

## 2. FsVolumeImpl 与 磁盘管理

DataNode 可以配置多个磁盘目录。每个目录对应一个 `FsVolumeImpl` 对象。所有的 Volume 由 `FsVolumeList` 管理。

*   **Round-Robin 策略**: 写入新 Block 时，默认采用轮询策略选择 Volume（也可以配置为基于剩余空间选择）。
*   **Failure Handling**: 如果某块磁盘坏了，DataNode 会将其从 VolumeList 中移除，但进程通常不会挂，继续用剩下的磁盘服务。

## 3. 副本状态 (ReplicaState)

在内存中，每个 Block 对应一个 `ReplicaInfo` 对象。

*   **FINALIZED**: 只有写完并关闭的 Block 才是 Finalized。
*   **RBW (Replica Being Written)**: 正在写入，且对 Client 可见（可读取）。
*   **RWR (Replica Waiting to be Recovered)**: DataNode 重启或崩溃后，未完成的 Block。
*   **RUR (Replica Under Recovery)**: 正在进行 Lease Recovery 的 Block。
*   **TEMPORARY**: 比如做 Rebalance 复制过来的临时块，还没写完。

## 4. 懒加载 (Lazy Persist)

HDFS 支持将数据写入内存 (RAM Disk)，然后异步持久化到磁盘。这由 `FsDatasetImpl` 中的 `RamDiskAsyncLazyPersistService` 处理。

这对 Spark 等需要快速 Shuffle 的场景很有用，但会增加数据丢失风险（如果断电）。

## 5. 总结

`FsDatasetImpl` 屏蔽了底层文件系统的差异，向 DataNode 上层提供了一个统一的 Block 视图。
