---
title: "Flink 源码阅读：13. Window Operator"
date: 2026-01-12T23:00:00+08:00
description: "窗口分配器 (Assigner)、触发器 (Trigger) 与驱逐器 (Evictor) 的实现。"
tags: [Flink, Source Code, Window, Operator]
weight: 13
---

`WindowOperator` 是 Flink 中最复杂的算子之一。

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
