---
title: "Kafka 源码阅读：07. 日志存储 (Log Storage)"
date: 2026-01-15T10:00:00+08:00
description: "Kafka 日志存储源码解析：LogSegment 切分、稀疏索引、磁盘顺序写、零拷贝 sendfile 与 MMAP 的高吞吐实现。"
taxonomies:
  tags: [Kafka, Source Code, Storage, Log]
weight: 7
tldr: "Kafka 的磁盘存储是其高吞吐的核心。 1. 目录结构 每个 Partition 对应磁盘上的一个目录 (如 )。"
keywords: ["Kafka", "源码阅读", "07.", "日志存储", "Log", "Storage", "Source Code"]
---
## 0. 本章定位

Kafka 源码阅读：07. 日志存储 (Log Storage)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Kafka 的磁盘存储是其高吞吐的核心。

建议关注 LogSegment 的 Roll 策略与 Index 文件的稀疏索引设计，对生产环境磁盘 IO 调优至关重要。

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
