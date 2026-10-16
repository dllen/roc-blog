---
title: "Kafka 源码阅读：04. RecordAccumulator"
date: 2026-01-15T10:00:00+08:00
description: "Kafka RecordAccumulator 源码解析：ProducerBatch 合并、BufferPool 内存池复用、双端队列与 CopyOnWriteMap 的高吞吐设计。"
taxonomies:
  tags: [Kafka, Source Code, Producer, Memory Management]
weight: 4
tldr: "是 Producer 高吞吐的关键。它将多条消息合并成一个 ，从而减少网络请求次数。"
keywords: ["Kafka", "源码阅读", "04.", "RecordAccumulator", "Source Code", "Producer", "Memory Management"]
---
## 0. 本章定位

Kafka 源码阅读：04. RecordAccumulator：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

`RecordAccumulator` 是 Producer 高吞吐的关键。它将多条消息合并成一个 `ProducerBatch`，从而减少网络请求次数。

BufferPool 与 CopyOnWriteMap 是 Kafka 高吞吐的关键，理解它们能解释 Producer 在大消息场景下的性能拐点。

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
