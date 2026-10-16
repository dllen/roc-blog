---
title: "HBase 源码阅读：17. 复制机制 (Replication)"
date: 2026-01-12T10:00:00+08:00
description: "HBase Replication 源码解析：跨集群异步复制、ReplicationSource 读取 WAL、ReplicationSink 应用与冲突解决。"
taxonomies:
  tags: [HBase, Source Code, Replication, DR]
weight: 17
tldr: "HBase Replication 主要用于主备容灾（Disaster Recovery）。"
keywords: ["HBase", "源码阅读", "17.", "复制机制", "Replication", "Source Code", "DR"]
---
## 0. 本章定位

HBase 源码阅读：17. 复制机制 (Replication)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

HBase Replication 主要用于主备容灾（Disaster Recovery）。它是基于 WAL 的异步复制。

## 1. 架构模式

*   **Master-Slave**: 主推备。
*   **Master-Master**: 双向复制（需处理冲突）。
*   **Cyclic**: 环形复制。

## 2. 核心组件

### 2.1 ReplicationSource (Producer)
运行在主集群的 RegionServer 上。
*   **Log Queue**: 监听 WAL 的生成。
*   **Shipper Thread**: 读取 WAL Entry，过滤掉不需要复制的数据（如只复制某些表），发送给备集群。
*   **Checkpoint**: 记录复制进度（ZK 中）。

### 2.2 ReplicationSink (Consumer)
运行在备集群的 RegionServer 上。
*   接收来自 Source 的 Edit。
*   使用 `HConnection` 将 Edit 写入本地 HBase（就像普通的 Client 写入一样）。

## 3. 关键特性

*   **异步**: 也就是最终一致性。主集群写入成功即返回，不等待复制。
*   **串行性**: 同一个 Region 的 WAL Edit 必须按顺序复制，保证顺序一致性。
*   **容错**: 如果 Source RS 挂了，Master 会将其 Replication Queue 转移给其他 RS 接管。

---
**End**: [回到目录](../)
