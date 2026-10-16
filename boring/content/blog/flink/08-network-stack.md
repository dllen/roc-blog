---
title: "Flink 源码阅读：08. 通信层实现 (RPC & Data)"
date: 2026-01-12T18:00:00+08:00
description: "基于 Akka 的控制流 RPC 与基于 Netty 的数据流传输。"
taxonomies:
  tags: [Flink, Source Code, RPC, Netty, Akka]
weight: 8
tldr: "基于 Akka 的控制流 RPC 与基于 Netty 的数据流传输。"
keywords: ["Flink", "源码阅读", "08.", "通信层实现", "RPC", "Data", "Source Code", "Netty"]
---

Flink 的通信分为两类：控制流 (Control Plane) 和 数据流 (Data Plane)。






## 0. 本章定位

Flink 网络层是其高吞吐的核心：控制面 Akka/Pekko RPC + 数据面 Netty + 内存队列（NetworkBufferPool / Input Queue / Output Queue）+ Credit-Based 反压。本章是后续背压和 Barrier 对齐的基础。控制面用 RPC 调度作业，数据面用 Netty 单连接多通道跑数据流，避免 TCP 频繁握手。每个 Netty 连接配 NetworkBufferPool 池化缓冲区，跨 Task 共享。生产调优 taskmanager.network.memory.* 系列参数必读本章。

## 1. 控制流 (RPC)
Flink 的组件通信（如 JM 与 TM）基于 **Akka** (正在迁移到 RpcEndpoint 抽象)。
*   **RpcEndpoint**: 类似于 Actor。
*   **Gateway**: RpcEndpoint 的代理/存根。
例如 `ResourceManager` 是一个 `RpcEndpoint`，它实现了 `ResourceManagerGateway` 接口。
调用 Gateway 的方法，会被自动封装成 Akka Message 发送出去。

## 2. 数据流 (Netty)
Task 之间的数据传输基于 **Netty**。
*   **ResultPartition**: 生产数据的组件。
*   **InputGate**: 消费数据的组件。
*   **NettyProtocol**: 定义了数据传输协议。

## 3. Shuffle 过程
1.  Upstream Task 将数据写入 `ResultSubpartition` (Buffer)。
2.  Netty Server 读取 Buffer，发送给 Downstream Task 的 Netty Client。
3.  Netty Client 收到数据，写入 `InputChannel`。
4.  Downstream Task 从 `InputGate` 读取 Buffer。
