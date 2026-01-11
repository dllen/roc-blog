---
title: "Kafka 源码阅读：07. 日志存储 (Log Storage)"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Storage, Log]
weight: 7
---

Kafka 的磁盘存储是其高吞吐的核心。

## 1. 目录结构

每个 Partition 对应磁盘上的一个目录 (如 `topic-0`)。
目录下包含多个 LogSegment 文件。

## 2. LogSegment

为了方便管理和清理，Log 被切分为多个 Segment。每个 Segment 包含：
*   `.log`: 实际的消息数据。
*   `.index`: 位移索引 (Offset -> Position)。
*   `.timeindex`: 时间戳索引 (Timestamp -> Offset)。

## 3. 索引机制 (稀疏索引)

Kafka 不会为每条消息建立索引，而是**稀疏索引**。
*   默认每 4KB 数据建立一个索引项。
*   查找时，先二分查找找到最近的索引项，然后从该位置开始顺序扫描 `.log` 文件。
*   **好处**: 索引文件非常小，可以完全加载到内存 (mmap)。

## 4. 零拷贝 (Zero-Copy)

在消费（Fetch）时，Kafka 利用 `FileChannel.transferTo` (sendfile 系统调用)。
*   直接将内核页缓存 (Page Cache) 的数据发送到网卡。
*   避免了 User Space 和 Kernel Space 的多次拷贝。

---
**Next**: [Kafka 源码阅读：08. 延时操作 (Purgatory)](../08-purgatory/)
