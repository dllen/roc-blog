---
title: "HBase 源码阅读：16. 负载均衡 (Assignment & Balancer)"
date: 2026-01-12T10:00:00+08:00
description: "HBase Region 分配机制源码解析：AssignmentManager 状态机、RegionTransition 事件、批量 assign/unassign 流程。"
taxonomies:
  tags: [HBase, Source Code, Balancer, Assignment]
weight: 16
tldr: "AssignmentManager (AM) 负责 Region 的分配，Balancer 负责 Region 的再平衡。"
keywords: ["HBase", "源码阅读", "16.", "负载均衡", "Assignment", "Balancer", "Source Code"]
---
## 0. 本章定位

HBase 源码阅读：16. 负载均衡 (Assignment & Balancer)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

AssignmentManager (AM) 负责 Region 的分配，Balancer 负责 Region 的再平衡。

## 1. Assignment Manager V2 (HBase 2.x)

HBase 2.0 重写了 AM，引入了 Procedure V2 框架（基于状态机），彻底解决了 Region 状态不一致（RIT, Region-In-Transition）的问题。

### 1.1 核心状态转换
*   `OFFLINE` -> `OPENING` -> `OPEN`
*   `OPEN` -> `CLOSING` -> `CLOSED`
*   所有状态变更都持久化在 Master 的 Procedure WAL 中。

## 2. Load Balancer

Master 有一个后台线程，定期检查集群负载。默认实现是 `StochasticLoadBalancer`。

### 2.1 随机模拟算法
它不只是看 Region 数量，而是综合考虑多种 Cost Function（代价函数）：
*   **RegionCountSkew**: Region 数量是否均匀。
*   **ReadRequestCost**: 读请求负载。
*   **WriteRequestCost**: 写请求负载。
*   **LocalityCost**: 数据本地化率（HDFS Block 是否在本地）。
*   **MemStoreSizeCost**: 内存占用。

算法会随机尝试交换两个 Server 的 Region，计算总 Cost 是否降低。如果降低，就生成 Balance Plan。

## 3. 执行 Balance
Master 根据 Plan，生成 `UnassignProcedure` 和 `AssignProcedure`，通知 RS 移动 Region。

---
**Next**: [HBase 源码阅读：17. 复制机制 (Replication)](../17-replication/)
