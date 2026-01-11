---
title: "Flink 源码阅读：12. Watermark 机制"
date: 2026-01-12T22:00:00+08:00
description: "水位线 (Watermark) 的生成、传播与处理乱序数据的原理。"
tags: [Flink, Source Code, Watermark, Time]
weight: 12
---

Watermark 是 Flink 处理 Event Time 和乱序数据的核心机制。

## 1. Watermark 生成
Watermark 是一种特殊的流元素 (`StreamElement`)。
通常在 Source 之后，通过 `assignTimestampsAndWatermarks` 生成。
`WatermarkGenerator` 接口定义了生成逻辑（Periodic 或 Punctuated）。

## 2. Watermark 传播
Watermark 随着数据流向下游传播。
*   **One-to-One**: 直接透传。
*   **Many-to-One (Shuffle)**: 下游 Task 有多个输入通道。它必须维护每个通道的 Watermark 值。
    *   Task 的当前 Watermark = `min(Channel 1 WM, Channel 2 WM, ...)`。
    *   只有当所有上游的 Watermark 都推进了，下游的 Watermark 才会推进。

## 3. 处理乱序
Watermark 本质上是一个时间戳 T，表示“T 之前的数据都已到齐”。
如果来了一个时间戳 t < T 的数据，就是迟到数据 (Late Event)。
Window Operator 会根据 Watermark 触发窗口计算。
