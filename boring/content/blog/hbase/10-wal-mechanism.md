---
title: "HBase 源码阅读：10. WAL 机制"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, WAL, FSHLog]
weight: 10
---

WAL (Write Ahead Log) 是 HBase 数据安全性的保障。

## 1. 架构演进

*   **旧版**: `FSHLog`。基于 LMAX Disruptor RingBuffer 的生产者-消费者模型。
*   **新版**: `AsyncFSWAL` (HBase 2.0+)。基于 Netty 的异步 IO，性能更好，延迟更低。

## 2. WAL 文件结构
WAL 文件本质上是 HDFS 上的 SequenceFile。
*   **Header**: 版本、加密信息等。
*   **Entry**: 包含 `HLogKey` (SequenceId, WriteTime, RegionName) 和 `WALEdit` (KeyValue 列表)。
*   **Trailer**: 文件尾。

## 3. 写入流程 (`FSHLog`)

1.  **Append**: 多个 Handler 线程并发将 Edit 放入 RingBuffer。
2.  **SyncRunner**: 消费者线程从 RingBuffer 取出 Edit，通过 `DFSClient` 写入 HDFS。
    *   调用 `FSDataOutputStream.write()`。
    *   调用 `hflush()` / `hsync()` 确保数据持久化。

## 4. Log Rolling (日志滚动)
当 WAL 文件过大或过旧时，会触发 Rolling，生成新的 WAL 文件。
*   这也可能触发 Flush（如果 WAL 数量过多）。

## 5. Log Splitting (日志切分)
当 RS 宕机，Master 启动 SCP 流程时，需要将该 RS 的 WAL 切分并回放给接管的 RS。
*   **Distributed Log Splitting (DLS)**: 由 Master 协调，多个 RS 共同参与切分。

---
**Next**: [HBase 源码阅读：11. Flush 机制](../11-flush-mechanism/)
