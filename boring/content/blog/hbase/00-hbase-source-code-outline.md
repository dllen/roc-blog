---
title: "HBase 源码阅读：00. 阅读大纲与学习路线"
date: 2026-01-12T10:00:00+08:00
description: "Apache HBase 源码阅读系列大纲。从 Master 启动到 RegionServer 读写，从 LSM Tree 到 WAL 机制，全链路源码解析。"
tags: [HBase, Source Code, Outline, Roadmap]
weight: 0
---

Apache HBase 是基于 Hadoop 的分布式、可扩展的大数据存储系统。本系列将基于 HBase 2.x+ 源码，深入剖析其底层原理。

## Phase 1: 准备与核心架构 (Preparation & Core Architecture)
*   **01. 源码编译与环境搭建**: 如何构建 HBase 源码，IntelliJ IDEA 调试环境配置。
*   **02. 项目结构概览**: `hbase-server`, `hbase-client`, `hbase-common` 等核心模块介绍。
*   **03. Master 启动流程**: HMaster 的初始化、Active Master 选举与后台线程。
*   **04. RegionServer 启动流程**: HRegionServer 的初始化与服务注册。
*   **05. RPC 通信机制**: 基于 Protobuf 与 Netty 的 RPC 实现细节。
*   **06. ZooKeeper 协调机制**: ZK 在 HBase 中的作用 (AssignmentManager, Master 选举)。
*   **07. Meta 表管理**: `hbase:meta` 表的结构、定位与缓存机制。

## Phase 2: 读写路径 (Read & Write Path)
*   **08. 读流程详解 (Read Path)**: Client -> RegionServer -> MemStore/BlockCache/HFile 的完整链路。
*   **09. 写流程详解 (Write Path)**: Client -> RegionServer -> WAL -> MemStore 的写入过程。
*   **10. WAL 机制**: Write Ahead Log 的结构、写入与同步 (FSHLog/AsyncFSWAL)。
*   **11. Flush 机制**: MemStore 刷写到磁盘的触发条件与流程。

## Phase 3: 存储引擎与文件格式 (Storage Engine)
*   **12. Compaction 原理**: Minor 与 Major Compaction 的策略与执行流程。
*   **13. HFile 格式解析**: HFile V2/V3 的数据结构 (DataBlock, IndexBlock, BloomFilter)。
*   **14. BlockCache 缓存**: LruBlockCache 与 BucketCache 的实现与内存管理。

## Phase 4: 进阶与运维 (Advanced & Operations)
*   **15. Region 切分 (Split)**: Region 自动切分的策略与过程。
*   **16. 负载均衡 (Assignment & Balancer)**: Region 的分配与 StochasticLoadBalancer 算法。
*   **17. 复制机制 (Replication)**: 集群间数据复制的实现原理。

## 学习建议
HBase 源码庞大且复杂，建议：
1.  **理解 LSM-Tree**: HBase 是标准的 LSM-Tree 实现，理解其原理对阅读源码至关重要。
2.  **关注关键路径**: 先把读写流程（Put/Get）跑通，再看 Flush/Compaction 等后台任务。
3.  **结合 Metrics**: 观察 HBase 的 Metrics 指标，有助于理解系统运行状态。
