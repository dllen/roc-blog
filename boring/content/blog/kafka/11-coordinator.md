---
title: "Kafka 源码阅读：11. GroupCoordinator"
date: 2026-01-15T10:00:00+08:00
description: "Kafka GroupCoordinator 源码解析：消费者组协调者的定位算法、状态机（Empty / PreparingRebalance / Stable）与心跳管理。"
taxonomies:
  tags: [Kafka, Source Code, Consumer, Coordinator]
weight: 11
tldr: "Kafka 消费者组 (Consumer Group) 的管理依赖于服务端的一个组件： GroupCoordinator 。"
keywords: ["Kafka", "源码阅读", "11.", "GroupCoordinator", "Source Code", "Consumer", "Coordinator"]
---
## 0. 本章定位

Kafka 源码阅读：11. GroupCoordinator：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Kafka 消费者组 (Consumer Group) 的管理依赖于服务端的一个组件：**GroupCoordinator**。

GroupCoordinator 与 Consumer Group 状态机强相关，理解它能解释消费者组的 Rebalance 与 offset 提交语义。

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
