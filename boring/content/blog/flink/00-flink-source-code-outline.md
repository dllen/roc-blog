---
title: "Flink 源码阅读：00. 阅读大纲与学习路线"
date: 2026-01-12T10:00:00+08:00
description: "Apache Flink 源码阅读系列大纲。从 JobGraph 到 Task 调度，从 Checkpoint 到反压机制，全链路源码解析。"
tags: [Flink, Source Code, Outline, Roadmap]
weight: 0
---

Apache Flink 是目前最流行的大数据流计算引擎。本系列将基于 Flink 1.17+ 源码，深入剖析其底层原理。

## Phase 1: 准备与核心架构 (Preparation & Core Architecture)
*   **01. 源码编译与环境搭建**: 如何构建 Flink 源码，IDEA 调试环境配置。
*   **02. 项目结构概览**: `flink-core`, `flink-runtime`, `flink-streaming-java` 等核心模块介绍。
*   **03. 启动流程详解**: 从 `StandaloneSessionClusterEntrypoint` 看 Master/Worker 启动。
*   **04. 提交流程 (JobGraph)**: Client 端如何将代码转化为 JobGraph。
*   **05. 调度中心 (ExecutionGraph)**: JobMaster 如何将 JobGraph 转化为可执行的 ExecutionGraph。

## Phase 2: 任务调度与资源管理 (Scheduling & Resource)
*   **06. Task 调度与执行**: Slot 资源分配、Task 部署与线程模型。
*   **07. 内存管理机制**: MemorySegment, Network Buffer, 堆外内存管理。
*   **08. 通信层实现**: 基于 Akka 的 RPC 与基于 Netty 的数据传输。
*   **09. 反压机制 (Backpressure)**: Credit-based Flow Control 详解。

## Phase 3: 流处理核心 (DataStream Runtime)
*   **10. StreamGraph 生成**: DataStream API 如何转化为流图。
*   **11. Operator Chain**: 算子链优化原理，如何减少序列化开销。
*   **12. Watermark 机制**: 水位线的生成、传播与乱序处理。
*   **13. Window Operator**: 窗口分配器、触发器与 Evictor 的实现。
*   **14. TimerService**: 基于时间轮 (Timing Wheel) 的定时器实现。

## Phase 4: 状态与容错 (State & Fault Tolerance)
*   **15. StateBackend**: HeapStateBackend 与 RocksDBStateBackend 源码对比。
*   **16. Checkpoint 核心流程**: Chandy-Lamport 算法在 Flink 中的实现 (Barrier 对齐)。
*   **17. Two-Phase Commit**: Sink 端的两阶段提交与 Exactly-Once 语义。
*   **18. High Availability**: 基于 ZooKeeper/K8s 的 Leader 选举与元数据存储。

## Phase 5: SQL 与进阶 (SQL & Advanced)
*   **19. Flink SQL 编译流程**: Calcite Parser, Validator, Optimizer 到 Physical Plan。
*   **20. Table Runtime**: 代码生成 (Code Generation) 技术。
*   **21. PyFlink 原理**: Java 与 Python 进程间的通信模型。

## 学习建议
Flink 源码量巨大（超过 200 万行），建议：
1.  **抓大放小**：先看主流程（提交、调度、Checkpint），再看细节。
2.  **Debug 驱动**：编写简单的 WordCount，打断点跟踪执行流程。
3.  **关注接口**：Flink 大量使用接口抽象（如 `StreamOperator`, `StateBackend`），先看接口定义。
