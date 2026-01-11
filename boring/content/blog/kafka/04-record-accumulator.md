---
title: "Kafka 源码阅读：04. RecordAccumulator"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Producer, Memory Management]
weight: 4
---

`RecordAccumulator` 是 Producer 高吞吐的关键。它将多条消息合并成一个 `ProducerBatch`，从而减少网络请求次数。

## 1. 数据结构

内部维护了一个 `ConcurrentMap<TopicPartition, Deque<ProducerBatch>> batches`。
每个 Partition 对应一个双端队列。
*   **Append**: 新消息追加到队列尾部的 Batch 中。
*   **Send**: Sender 线程从队列头部取出 Batch 进行发送。

## 2. 内存池设计 (`BufferPool`)

为了避免频繁 GC，Kafka 设计了 `BufferPool` 来复用 `ByteBuffer`。
*   **Chunk**: 固定大小的内存块 (`batch.size`)。
*   **Free List**: 空闲的 Chunk 列表。
*   **申请逻辑**:
    *   如果 Free List 有空闲，直接拿。
    *   如果没有，且总内存未超限，申请新的 ByteBuffer。
    *   如果内存耗尽，阻塞等待其他 Batch 释放内存。

## 3. Batch 触发条件

什么时候 Batch 会被发送？
1.  **Batch Full**: Batch 写满了 (`batch.size`)。
2.  **Linger Expires**: Batch 没满，但等待时间超过了 `linger.ms`。
3.  **Memory Pressure**: 内存池满了，强制发送以释放内存。
4.  **Close/Flush**: 用户手动调用。

---
**Next**: [Kafka 源码阅读：05. Sender 线程](../05-sender-thread/)
