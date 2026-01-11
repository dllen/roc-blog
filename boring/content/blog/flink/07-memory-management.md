---
title: "Flink 源码阅读：07. 内存管理机制"
date: 2026-01-12T17:00:00+08:00
description: "Flink 如何管理堆外内存？MemorySegment 与 Network Buffer 的设计。"
tags: [Flink, Source Code, Memory, Buffer]
weight: 7
---

Flink 并没有完全依赖 JVM 的垃圾回收，而是自己实现了一套内存管理机制。

## 1. 内存模型
TaskManager 的内存分为：
*   **Heap Memory**: 用户代码对象，StateBackend (Heap) 使用。
*   **Off-Heap Memory (Direct Memory)**:
    *   **Network Memory**: 用于网络传输的 Buffer。
    *   **Managed Memory**: 用于 RocksDB StateBackend, Batch 排序/Join 算法。
    *   **Framework Off-Heap**: Flink 框架自身使用。

## 2. MemorySegment
Flink 内存管理的最小单元是 `MemorySegment`。
它是一个抽象类，封装了对一段内存的访问（支持 Heap 和 Off-Heap）。
类似 Netty 的 `ByteBuf`，但更轻量。
底层使用 `Unsafe` 进行高效的内存操作。

## 3. Network Buffer Pool
网络传输需要大量的 Buffer。
Flink 预先申请一大块 Direct Memory，切分成 32KB 的片段，放入 `NetworkBufferPool`。
每个 InputGate/ResultPartition 向 Pool 申请 Buffer。
**零拷贝**: 数据从 Netty 接收 -> Network Buffer -> Operator 处理，全程使用 Direct Memory，减少了拷贝。
