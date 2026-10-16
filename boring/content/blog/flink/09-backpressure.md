---
title: "Flink 源码阅读：09. 反压机制 (Backpressure)"
date: 2026-01-12T19:00:00+08:00
description: "Credit-based Flow Control 详解。Flink 如何优雅地处理下游消费不过来的情况。"
taxonomies:
  tags: [Flink, Source Code, Backpressure, Flow Control]
weight: 9
tldr: "Credit-based Flow Control 详解。Flink 如何优雅地处理下游消费不过来的情况。"
keywords: ["Flink", "源码阅读", "09.", "反压机制", "Backpressure", "Source Code", "Flow Control"]
---

反压是流处理系统的生命线。如果下游处理慢，上游必须减速，否则会 OOM。








## 实战建议

建议配合 Flink Web UI 的 Backpressure 面板使用：在出现反压时先看 Subtask 级别定位瓶颈算子，再回到本章机制调参。

## 0. 本章定位

背压是流处理系统的生命线：下游处理慢时上游必须减速，否则 OOM。本章对比旧版 TCP 滑动窗口反压（已弃用，多路复用会导致整个 TM 阻塞）与新版 Credit-Based 反压（精细到 Task 级别）。新版机制：下游根据自身缓冲余量发 Credit 给上游，上游按 Credit 数量发数据。生产环境调优 web.backpressure.delay-between-samples（背压检测间隔）、taskmanager.network.memory.buffer-per-channel（每通道缓冲数）必读本章。

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
