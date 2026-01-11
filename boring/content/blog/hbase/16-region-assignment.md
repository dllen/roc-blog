---
title: "HBase 源码阅读：16. 负载均衡 (Assignment & Balancer)"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Balancer, Assignment]
weight: 16
---

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
