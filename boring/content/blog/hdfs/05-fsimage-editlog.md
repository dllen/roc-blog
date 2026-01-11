---
title: "HDFS 源码阅读：05. 持久化机制 (FsImage & EditLog)"
date: 2026-01-16T10:00:00+08:00
description: "解析 FSEditLog 的双缓冲机制与 Checkpoint 流程。"
tags: [Hadoop, HDFS, NameNode, Persistence]
weight: 5
---

为了保证数据不丢失，NameNode 必须将内存中的元数据持久化到磁盘。

## 1. 核心概念

*   **FSImage**: 某一时刻文件系统元数据的**完整快照**。
*   **EditLog**: 记录自上一次 FSImage 以来所有的**写操作**（事务日志）。

**当前状态 = FSImage + EditLog**

## 2. FSEditLog 双缓冲机制 (Double Buffer)

如果每来一个写请求都强制刷盘 (fsync)，性能会非常差。HDFS 采用了双缓冲机制来批量刷盘。

```java
// FSEditLog.java 核心逻辑
class FSEditLog {
    // 两个 Buffer
    private EditsDoubleBuffer txBuffer;
    
    // bufCurrent: 当前正在写入的 Buffer
    // bufReady: 准备刷盘的 Buffer
}
```

流程 (`logSync`):

1.  **写入**: 多个线程同时往 `bufCurrent` 写入操作记录。
2.  **交换**: 当需要刷盘时，抢占锁，交换 `bufCurrent` 和 `bufReady`。后续线程写入新的 `bufCurrent`。
3.  **刷盘**: 将 `bufReady` 中的数据一次性写入磁盘（JournalSet）。
4.  **完成**: 清空 `bufReady`。

这种机制实现了**并发写入内存，串行刷盘**，极大提高了吞吐量。

## 3. JournalSet 与 QJM

EditLog 不仅仅写本地磁盘，为了 HA，通常写到 **JournalNodes (JN)**。

`JournalSet` 抽象了输出流。在 HA 模式下，使用 `QuorumJournalManager`，遵循 Paxos 思想，只要写入大多数（N/2+1）JN 成功即认为成功。

## 4. Checkpoint 流程

随着时间推移，EditLog 会越来越大，重启 NameNode 需要回放大量日志，非常慢。因此需要定期 Checkpoint（合并 Image 和 EditLog）。

在非 HA 模式下，由 **SecondaryNameNode** 完成。
在 HA 模式下，由 **Standby NameNode** 完成。

**Standby Checkpoint 步骤**:

1.  **Roll EditLog**: Active NN 切割日志，生成新的 EditLog segment。
2.  **Download**: Standby NN 从 JN 拉取最新的 EditLog。
3.  **Load & Merge**: Standby NN 将 EditLog 回放到自己的内存目录树中（Standby 一直在做这个事以保持同步）。
4.  **Save FSImage**: Standby NN 将内存状态 dump 成新的 FSImage 文件。
5.  **Upload**: Standby NN 将新的 FSImage 上传回 Active NN。

这样，Active NN 甚至不需要暂停服务，也不消耗 CPU 做合并，就得到了最新的 Image。
