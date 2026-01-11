---
title: "Kafka 源码阅读：08. 延时操作 (Purgatory)"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Purgatory, TimingWheel]
weight: 8
---

Kafka 中有很多请求是不能立即返回的，比如 `acks=all` 的 Produce 请求（需要等待 ISR 同步），或者 `min.bytes` 的 Fetch 请求（需要等待足够的数据）。

Kafka 实现了一个高效的延时任务管理组件：**DelayedOperationPurgatory**。

## 1. 概念

*   **DelayedOperation**: 延时操作基类。
*   **WatcherList**: 监听某个 Key（如 TopicPartition）的操作列表。

## 2. 时间轮 (Hierarchical Timing Wheel)

为了高效管理成千上万的延时任务，Kafka 并没有使用 JDK 的 `DelayQueue` (插入删除 O(logN))，而是实现了**分层时间轮** (插入删除 O(1))。

*   **结构**: 类似于时钟，每一格代表一个时间跨度。
*   **分层**: 当任务的延迟时间超过当前时间轮的范围时，升级到上一层时间轮（类似于 秒针 -> 分针 -> 时针）。
*   **推进**: 使用 JDK 的 `DelayQueue` 仅存储**有任务的 Bucket**，而不是每个任务。这样大大减少了 DelayQueue 的元素数量。

## 3. 工作流程

1.  请求到达，条件未满足。
2.  创建 DelayedOperation，放入 Purgatory (时间轮 + WatcherList)。
3.  **触发**:
    *   **时间到**: 时间轮转动，任务超时，强制完成。
    *   **外部事件**: 如有新消息写入 (LogAppend)，触发 WatcherList 中的任务检查 (checkAndComplete)。如果条件满足，提前完成，从时间轮中移除。

---
**Next**: [Kafka 源码阅读：09. 传统 Controller](../09-controller/)
