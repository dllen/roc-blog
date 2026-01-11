---
title: "HDFS 源码阅读：02. 核心架构设计"
date: 2026-01-13T10:00:00+08:00
description: "HDFS 架构深度解析。Master/Slave 模式的优劣、Block 设计哲学以及 RPC 通信协议概览。"
tags: [Hadoop, HDFS, Architecture, Design]
weight: 2
---

在深入每一行代码之前，我们需要站在高处俯瞰 HDFS 的设计哲学。HDFS 是 Google File System (GFS) 的开源实现，其核心设计目标是：**在廉价硬件上提供高吞吐量的数据访问，并具备高容错性。**

## 1. Master/Slave 架构

HDFS 采用经典的 Master/Slave 架构：

*   **NameNode (Master)**: 中心管理者。
    *   **职责**: 管理文件系统命名空间 (Namespace)，维护文件到 Block 的映射，处理客户端请求。
    *   **特点**: 单点（HA 方案解决单点故障），内存受限（所有元数据在内存）。
*   **DataNode (Slave)**: 工作节点。
    *   **职责**: 存储实际的数据块 (Block)，执行数据块的读写操作，定期向 NameNode 汇报块信息。
    *   **特点**: 数量众多，易故障。

### 为什么是单 Master？

GFS 论文中提到：
> "Having a single master vastly simplifies our design and enables the master to make sophisticated chunk placement and replication decisions using global knowledge."

单 Master 极大简化了元数据一致性问题，避免了分布式锁和复杂的共识算法（在元数据层面）。当然，这也带来了扩展性瓶颈（内存限制），后来 HDFS Federation 解决了这个问题。

## 2. Block 的设计哲学

文件被切割成固定大小的 Block（默认 128MB）。

### 为什么 Block 这么大？

*   **减少元数据开销**: NameNode 内存有限，Block 越大，同样大小的文件产生的元数据越少。
*   **最小化寻址开销**: 如果 Block 太小，读取大文件时需要频繁 seek 磁盘。128MB 使得传输时间远大于寻址时间，从而获得接近磁盘顺序读写的吞吐量。

## 3. 核心通信协议 (RPC)

HDFS 内部各组件通过 RPC (Remote Procedure Call) 交互。Hadoop 有一套自己的 RPC 框架（基于 Protobuf）。

主要的 Protocol 接口定义在 `hadoop-hdfs-client` 和 `hadoop-hdfs` 模块中：

1.  **ClientProtocol**: Client <-> NameNode。
    *   方法: `create`, `open`, `mkdir`, `getBlockLocations`, `renewLease` 等。
2.  **ClientDatanodeProtocol**: Client <-> DataNode。
    *   方法: `recoverBlock`, `getReplicaVisibleLength`。
    *   *注意*: 真正的数据读写不走 RPC，而是流式接口 (Data Transfer Protocol)。
3.  **DatanodeProtocol**: DataNode <-> NameNode。
    *   方法: `registerDatanode`, `sendHeartbeat`, `blockReport`。
4.  **InterDatanodeProtocol**: DataNode <-> DataNode。
    *   用于数据块恢复 (Block Recovery) 和更新副本。

## 4. 数据流 vs 控制流

*   **控制流 (Control Flow)**: 走 RPC。如 Client 问 NameNode "文件 A 的 Block 在哪？"。
*   **数据流 (Data Flow)**: 走 TCP 流 (Netty)。如 Client 直接连接 DataNode 写入数据。

这种分离设计保证了 NameNode 不会成为数据传输的瓶颈。

## 5. 下一步

了解了架构图后，我们将从 NameNode 的启动流程开始，看看这个庞大的 Master 是如何被唤醒的。
