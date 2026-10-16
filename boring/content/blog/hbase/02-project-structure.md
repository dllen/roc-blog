---
title: "HBase 源码阅读：02. 项目结构概览"
date: 2026-01-12T10:00:00+08:00
description: "梳理 HBase 多模块 Maven 项目结构，逐个解读 hbase-common、hbase-server、hbase-client 等核心模块的职责、关键类与依赖关系。"
taxonomies:
  tags: [HBase, Source Code, Architecture]
weight: 2
tldr: "梳理 HBase 多模块 Maven 项目结构，逐个解读 hbase-common、hbase-server、hbase-client 等核心模块的职责、关键类与依赖关系。"
keywords: ["HBase", "源码阅读", "02.", "项目结构概览", "Source Code", "Architecture"]
---

HBase 采用多模块 Maven 项目结构。熟悉各个模块的职责有助于快速定位代码。后续源码阅读章节都基于本文的模块划分展开，建议先建立全局认知再深入具体路径。理解模块边界比记住类名更重要：客户端走 hbase-client，服务端走 hbase-server，跨语言接口走 hbase-protocol-shaded，三者之间的依赖方向在编译期就已经定死。

## 1. 核心模块

### 1.1 `hbase-common`
*   **职责**: 包含 HBase 的基础工具类、通用接口和配置解析。
*   **核心类**: `HBaseConfiguration`, `Cell`, `KeyValue`, `Bytes`。
*   **说明**: 被所有其他模块依赖，改动需谨慎。

### 1.2 `hbase-client`
*   **职责**: 客户端 API 实现，应用层通过此模块与 HBase 交互。
*   **核心类**: `Connection`, `Table`, `Put`, `Get`, `Scan`, `Admin`。
*   **说明**: 包含 RPC 客户端实现，负责寻找 Region 位置（Meta Cache）。

### 1.3 `hbase-server`
*   **职责**: 服务端核心实现，包含 Master 和 RegionServer 的逻辑。
*   **核心类**: `HMaster`, `HRegionServer`, `HRegion`, `HStore`, `MemStore`。
*   **说明**: 源码阅读的重中之重，90% 的核心逻辑都在这里。

### 1.4 `hbase-protocol` / `hbase-protocol-shaded`
*   **职责**: 定义 RPC 接口（Protobuf 文件）。
*   **说明**: `hbase-protocol` 是旧版，`hbase-protocol-shaded` 是为了解决依赖冲突引入的 shaded 版本。所有 `.proto` 文件定义了 Client 与 Server、Server 与 Server 之间的通信协议。

## 2. 辅助模块

### 2.1 `hbase-hadoop-compat`
*   **职责**: 兼容不同版本的 Hadoop。

### 2.2 `hbase-procedure`
*   **职责**: Procedure V2 框架实现。
*   **说明**: 用于实现分布式状态机，管理 Master 端的复杂操作（如建表、Region 迁移），保证原子性。

### 2.3 `hbase-zookeeper`
*   **职责**: 封装 ZooKeeper 操作。
*   **说明**: 包含 `ZKWatcher` 等监听机制。

## 3. 源码阅读建议路径

1.  **从 Client 入手**: 看 `Put` 操作是如何被 `Connection` 发送出去的。
2.  **转战 Server**: 跟踪 RPC 请求如何在 `HRegionServer` 中被处理。
3.  **深入 Store**: 看数据如何写入 `MemStore` 和 `HFile`。

---
**Next**: [HBase 源码阅读：03. Master 启动流程](../03-master-startup/)
