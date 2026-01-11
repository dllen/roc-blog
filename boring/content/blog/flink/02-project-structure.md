---
title: "Flink 源码阅读：02. 项目结构与核心模块"
date: 2026-01-12T12:00:00+08:00
description: "Flink 源码目录结构详解。flink-runtime, flink-streaming-java, flink-core 等模块的功能定位。"
tags: [Flink, Source Code, Architecture]
weight: 2
---

Flink 源码工程庞大，模块众多。初读源码容易迷失在目录中。本篇梳理 Flink 的核心模块结构。

## 1. 顶层目录结构
*   `flink-annotations`: 包含 `@Public`, `@Internal` 等注解，定义 API 稳定性。
*   `flink-core`: 基础模块，定义了 Flink 最底层的抽象，如 `TypeInformation`, `Configuration`, `IOReadableWritable`。
*   `flink-java` / `flink-scala`: DataSet API (批处理，已过时)。
*   **`flink-streaming-java`**: **核心**。DataStream API 的实现，包含 `StreamGraph`, `StreamOperator` 等。
*   **`flink-runtime`**: **最核心**。分布式运行时的实现，包括 JobMaster, TaskManager, RPC, Checkpoint, Shuffle 等。
*   `flink-clients`: 客户端提交逻辑，CLI 工具。
*   `flink-connectors`: 连接器，如 Kafka, JDBC, Hive。
*   `flink-table`: SQL 和 Table API 引擎 (Blink Planner)。
*   `flink-state-backends`: 状态后端实现 (RocksDB, Changelog)。

## 2. 关键模块详解

### 2.1 flink-core
这是 Flink 的地基。
*   **Types**: Flink 独特的类型系统 (`TypeInformation`, `TypeSerializer`)，比 Java Serialization 高效得多。
*   **Memory**: `MemorySegment`，Flink 内存管理的最小单元（类似 Netty ByteBuf，但操作堆内/堆外内存统一）。

### 2.2 flink-streaming-java
这是开发 Flink 作业直接打交道的层。
*   **API**: `DataStream`, `KeyedStream`, `WindowedStream`。
*   **Graph**: `StreamGraphGenerator` 将用户 API 调用转换为 `StreamGraph`。
*   **Operators**: `MapOperator`, `WindowOperator` 等算子的实现。

### 2.3 flink-runtime
这是 Flink 运行起来后的“心脏”。
*   **Dispatcher**: 接收作业提交，启动 JobMaster。
*   **JobMaster**: 单个作业的主控节点，负责 Scheduler (调度) 和 CheckpointCoordinator (容错)。
*   **TaskExecutor (TaskManager)**: 执行具体的 Task。
*   **RPC**: 基于 Akka (新版迁移中) 的 Actor 模型通信。
*   **IO**: `NetworkEnvironment`, `ResultPartition`, `InputGate`，负责 Task 间的数据传输 (Shuffle)。

## 3. 源码阅读建议路径
1.  **API 层**: 从 `flink-streaming-java` 入手，看 `StreamExecutionEnvironment.execute()` 如何生成 `StreamGraph`。
2.  **调度层**: 看 `flink-runtime` 中的 `JobMaster` 如何将 `JobGraph` 变成 `ExecutionGraph` 并部署。
3.  **执行层**: 看 `Task` 如何启动，数据如何在 `InputGate` 和 `ResultPartition` 间流动。
