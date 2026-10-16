---
title: "HDFS 源码阅读：16. Federation (联邦)"
date: 2026-01-27T10:00:00+08:00
description: "当单 NameNode 内存成为瓶颈时，Federation 允许水平扩展 Namespace。"
taxonomies:
  tags: [Hadoop, HDFS, Federation, Scalability]
weight: 16
tldr: "当单 NameNode 内存成为瓶颈时，Federation 允许水平扩展 Namespace。"
keywords: ["HDFS", "源码阅读", "16.", "Federation", "联邦", "Hadoop", "Scalability"]
---
## 0. 本章定位

HDFS 源码阅读：16. Federation (联邦)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

NameNode 的内存限制了集群的文件总数（通常几亿个文件就是上限）。HDFS Federation 通过支持多个 NameNode (Nameservice) 来解决这个问题。

## 1. 架构

*   **多个 Nameservice**: NS1 (`/user`), NS2 (`/data`), ...
*   **Block Pool**: 每个 NS 对应一个 Block Pool。
*   **DataNode**: 所有的 DataNode 为所有的 Block Pool 服务。
    *   DataNode 上存储的 Block 会按照 Block Pool ID 物理隔离。
    *   DataNode 需要向所有的 NameNode 发送心跳和块汇报。

## 2. 客户端访问 (ViewFileSystem)

客户端如何知道 `/user` 在 NS1，`/data` 在 NS2？

HDFS 提供了 `ViewFileSystem`，类似于 Linux 的挂载点 (Mount Point)。

**Client 端配置**:
*   `/user` -> `hdfs://ns1/user`
*   `/data` -> `hdfs://ns2/data`

这种方式是在 Client 端做路由，缺点是配置变更需要分发到所有 Client。

## 3. Router-Based Federation (RBF)

Hadoop 3.x 引入了 RBF。

*   **Router**: 一个新的服务端组件，作为统一入口。
*   **State Store**: 存储挂载表 (Mount Table)，通常用 ZooKeeper 实现。

Client 连接 Router，Router 根据 Mount Table 将请求转发给后端的具体 NameNode。这使得 Federation 对 Client 完全透明。

## 4. 总结

Federation 解决了元数据扩展性问题，但并未改变 Block 存储层的逻辑。DataNode 依然是共享的。
