---
title: "Flink 源码阅读：13. Window Operator"
date: 2026-01-12T23:00:00+08:00
description: "窗口分配器 (Assigner)、触发器 (Trigger) 与驱逐器 (Evictor) 的实现。"
taxonomies:
  tags: [Flink, Source Code, Window, Operator]
weight: 13
tldr: "窗口分配器 (Assigner)、触发器 (Trigger) 与驱逐器 (Evictor) 的实现。"
keywords: ["Flink", "源码阅读", "13.", "Window", "Operator", "Source Code"]
---

`WindowOperator` 是 Flink 中最复杂的算子之一。








## 实战建议

建议用自己的真实数据跑一遍不同 WindowAssigner + Trigger 组合，对比输出结果，理解四件套的组合效应。

窗口触发后 WindowState 的清理逻辑经常被忽略，理解 cleanup 是优化大状态作业的关键。

## 0. 本章定位

WindowOperator 是 Flink 最复杂的算子：WindowAssigner（决定数据分到哪个窗口：Tumbling / Sliding / Session）、Trigger（决定窗口何时触发：Watermark 到达 / Count 到达 / 自定义 EventTimeTrigger）、Evictor（触发前后剔除数据：CountEvictor / TimeEvictor）、AggregateFunction / ReduceFunction（窗口聚合逻辑）。本章把四件套的接口与实现讲透，是 Event Time + 窗口应用的必修。建议结合 Watermark 章一起读，Trigger 状态机依赖 Watermark 推进。

## 1. 组件架构
*   **WindowAssigner**: 决定数据属于哪个窗口（如 Tumbling, Sliding）。
*   **Trigger**: 决定何时触发计算（如 Watermark 到达，或 Count 达到）。
*   **Evictor**: (可选) 在触发前后剔除数据。
*   **WindowFunction**: 计算逻辑（如 Reduce, Process）。

## 2. 状态存储
窗口数据存储在 `WindowListState` 或 `WindowValueState` 中。
Key 是 `(Key, Window)`。
这意味着每个窗口都有独立的状态。

## 3. 处理流程
1.  数据到达 -> `Assigner` 分配窗口。
2.  将数据加入 Window State。
3.  调用 `Trigger.onElement()`。
4.  如果 Trigger 返回 FIRE -> 触发计算，输出结果。
5.  如果 Watermark 超过了窗口结束时间 + AllowedLateness -> 清理窗口状态。
