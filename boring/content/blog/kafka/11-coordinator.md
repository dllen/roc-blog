---
title: "Kafka 源码阅读：11. GroupCoordinator"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Consumer, Coordinator]
weight: 11
---

Kafka 消费者组 (Consumer Group) 的管理依赖于服务端的一个组件：**GroupCoordinator**。

## 1. 协调者定位

消费者如何知道自己的 Coordinator 在哪个 Broker？
1.  计算 GroupID 的哈希值。
2.  对 `__consumer_offsets` Topic 的 Partition 数 (默认 50) 取模。
3.  该 Partition 的 Leader 所在的 Broker 就是 Coordinator。

## 2. 状态管理

Coordinator 维护了每个 Group 的状态机：
*   **Empty**: 组内无成员。
*   **PreparingRebalance**: 准备重平衡，等待成员加入。
*   **CompletingRebalance**: 成员加入完毕，等待 Leader 分配方案。
*   **Stable**: 正常消费中。
*   **Dead**: 组被废弃。

## 3. Offset 管理

消费者提交的 Offset 也由 Coordinator 负责写入 `__consumer_offsets` Topic。
Coordinator 在内存中维护了 Offset Cache，以加速 Commit 请求。

---
**Next**: [Kafka 源码阅读：12. Rebalance 机制](../12-consumer-rebalance/)
