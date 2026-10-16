---
title: "Flink 源码阅读：14. TimerService (时间轮)"
date: 2026-01-13T00:00:00+08:00
description: "Flink 如何高效管理数百万个定时器？基于时间轮 (Timing Wheel) 还是优先队列？"
taxonomies:
  tags: [Flink, Source Code, Timer, Timing Wheel]
weight: 14
tldr: "Flink 如何高效管理数百万个定时器？基于时间轮 (Timing Wheel) 还是优先队列？"
keywords: ["Flink", "源码阅读", "14.", "TimerService", "时间轮", "Source Code", "Timer", "Timing Wheel"]
---

Flink 允许用户注册 ProcessingTime 和 EventTime 定时器。








## 实战建议

Timer 数量爆炸是隐形性能陷阱：监控 registeredTimers 指标，超过千万级立即清理或拆分作业。

建议结合 ProcessFunction 的 onTimer 回调阅读，看 TimerService 在用户代码中的使用模式。

## 0. 本章定位

TimerService 支持 ProcessingTime 与 EventTime 定时器（基于 Keyed State）。HeapStateBackend 用 PriorityQueue 实现，按触发时间排序；RocksDBStateBackend 用 RocksDB 内置 Timer 实现，避免堆内堆外两套存储。理解 Timer 是理解 CEP（Pattern 内部靠 Timer）、ProcessFunction 自定义业务逻辑（含 onTimer 回调）的关键。Timer 数量爆炸（百万级）是常见性能陷阱——需配合 State 清理策略与 TTL 配置。

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
