---
title: "Redis 源码阅读：25. Stream (流数据)"
date: 2026-01-11T23:00:00+08:00
description: "Redis 5.0 引入的 Stream 是什么？Radix Tree (基数树) 在其中的应用，Consumer Group 消费模型详解。"
tags: [Redis, Source Code, Stream, Radix Tree]
weight: 25
---

Redis Stream 是 Redis 5.0 引入的一种新的数据类型，专门用于实现高性能的消息队列。
代码位于 `src/t_stream.c` 和 `src/rax.c`。

## 1. 数据结构 (Radix Tree + ListPack)
Stream 的底层实现非常复杂，主要依赖于 **Radix Tree (基数树)**，Redis 中称为 **Rax**。
*   **Rax**：一种压缩的前缀树。Key 是消息 ID（时间戳+序号），Value 是 ListPack。
*   **ListPack**：为了节省内存，Stream 将多条消息打包存储在一个 ListPack 中，挂在 Rax 的叶子节点上。

这种结构既保证了 ID 的有序性（支持范围查询），又极大节省了内存空间。

## 2. 消息 ID
消息 ID 形式为 `<millisecondsTime>-<sequenceNumber>`。
Redis 保证 ID 是严格单调递增的。

## 3. 消费模型
Stream 支持两种消费模式：
*   **独立消费 (XREAD)**：简单的轮询或阻塞读取，不维护消费进度。
*   **消费者组 (Consumer Group)**：
    *   每个组维护一个 `Last_delivered_id`，记录组内消费到了哪条消息。
    *   组内的消费者竞争消费消息。
    *   **PEL (Pending Entries List)**：记录了“已发送给消费者但尚未确认 (ACK)”的消息。这保证了消息至少被消费一次（Reliable Delivery）。

## 4. 相比 List 和 Pub/Sub
*   **List**：只能实现简单的 FIFO 队列，无法支持多播，无法确保持久化（如果消费者拿走数据后崩了，数据就丢了）。
*   **Pub/Sub**：完全不持久化，发后即焚。
*   **Stream**：支持持久化、支持多播（多消费组）、支持 ACK 确认机制、支持消息回溯。
