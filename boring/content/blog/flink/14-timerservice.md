---
title: "Flink 源码阅读：14. TimerService (时间轮)"
date: 2026-01-13T00:00:00+08:00
description: "Flink 如何高效管理数百万个定时器？基于时间轮 (Timing Wheel) 还是优先队列？"
tags: [Flink, Source Code, Timer, Timing Wheel]
weight: 14
---

Flink 允许用户注册 ProcessingTime 和 EventTime 定时器。

## 1. 优先队列
在 HeapStateBackend 中，Timer 存储在 Java 的 `PriorityQueue` 中。
按照触发时间排序。
每次处理数据或 Watermark 时，检查队头 Timer 是否过期。

## 2. RocksDB 实现
在 RocksDBStateBackend 中，Timer 存储在 RocksDB 的一个 ColumnFamily 中。
Key 是 `(Timestamp, Key)`。
这利用了 RocksDB 的 Key 有序性，实现了持久化的优先队列。
这使得 Flink 可以支持海量（十亿级）的 Timer，而不受内存限制。

## 3. 触发逻辑
*   **ProcessingTime**: 依赖 `System.currentTimeMillis()` 和 `ScheduledThreadPoolExecutor`。
*   **EventTime**: 依赖 Watermark 的推进。当 Watermark >= Timer Timestamp 时触发。
