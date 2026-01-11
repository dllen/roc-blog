---
title: "Flink 源码阅读：09. 反压机制 (Backpressure)"
date: 2026-01-12T19:00:00+08:00
description: "Credit-based Flow Control 详解。Flink 如何优雅地处理下游消费不过来的情况。"
tags: [Flink, Source Code, Backpressure, Flow Control]
weight: 9
---

反压是流处理系统的生命线。如果下游处理慢，上游必须减速，否则会 OOM。

## 1. 旧版反压 (TCP 基于)
早期 Flink 依赖 TCP 的滑动窗口机制。
下游不读 Socket -> TCP Buffer 满 -> 上游发送阻塞。
缺点：反应慢，且单个 Task 阻塞会导致整个 TaskManager 的 TCP 连接阻塞（多路复用问题）。

## 2. Credit-based Flow Control (基于信用的流量控制)
Flink 1.5 引入。参考了 ATM 网络的机制。
*   **Credit**: 下游 InputChannel 告诉上游：“我有 X 个空闲 Buffer”。
*   **Backlog**: 上游 ResultSubpartition 告诉下游：“我有 Y 个积压 Buffer”。

**机制**：
1.  上游只有在持有下游的 Credit 时，才发送数据。
2.  每发送一个 Buffer，消耗一个 Credit。
3.  下游处理完 Buffer 后，归还 Credit 给上游。

这样，反压在应用层（Netty 之上）就生效了，不再依赖 TCP 阻塞，实现了**更细粒度的流控**。
