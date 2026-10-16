---
title: "Kafka 源码阅读：05. Sender 线程"
date: 2026-01-15T10:00:00+08:00
description: "Kafka Sender 线程源码解析：drain 提取批次、按 Node 分组、createClientRequests 构建 ProduceRequest、NetworkClient 发送全流程。"
taxonomies:
  tags: [Kafka, Source Code, Producer, Networking]
weight: 5
tldr: "是一个 Runnable，运行在单独的线程中 ( )。 1. 核心循环 ( ) 1."
keywords: ["Kafka", "源码阅读", "05.", "Sender", "线程", "Source Code", "Producer", "Networking"]
---
## 0. 本章定位

Kafka 源码阅读：05. Sender 线程：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

`Sender` 是一个 Runnable，运行在单独的线程中 (`ioThread`)。

## 1. 核心循环 (`runOnce`)

1.  **drain**: 从 `RecordAccumulator` 中提取可以发送的 Batch。
    *   这里会根据 Node (Broker) 进行分组，将发往同一个 Broker 的多个 Partition 的 Batch 合并到一个 Request 中。
2.  **createClientRequests**: 构建网络请求 (`ProduceRequest`)。
3.  **send**: 将请求交给 `NetworkClient`（放入发送缓冲区，并未真正 syscall）。
4.  **poll**: 调用 `NetworkClient.poll()`，执行真正的 NIO `selector.select()` 和读写操作。
5.  **handleResponse**: 处理 Broker 的响应。

## 2. InFlightRequests

为了保证顺序性和流控，`NetworkClient` 维护了 `InFlightRequests`。
*   记录了当前已发送但未收到响应的请求。
*   `max.in.flight.requests.per.connection`: 限制每个连接的并发请求数。
    *   设置为 1 时，绝对保证顺序（但影响吞吐）。
    *   开启幂等性时，允许为 5。

## 3. 幂等性发送 (Idempotent Producer)

为了防止网络重试导致的消息重复。
*   **PID (Producer ID)**: 每次 Producer 启动分配一个。
*   **Sequence Number**: 每个 (PID, Partition) 维护一个单调递增的 Seq。
*   **Broker 端检查**: Broker 只有当 `Req.Seq == LastSeq + 1` 时才接受，否则丢弃（重复）或报错（乱序）。

---
**Next**: [Kafka 源码阅读：06. 网络层设计](../06-network-layer/)
