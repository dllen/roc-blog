---
title: "ZooKeeper 源码阅读：12. ZAB 协议：原子广播"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper ZAB Broadcast 阶段源码解析：Proposal 提议、ACK 收集、Commit 应用、顺序保证与崩溃恢复。"
taxonomies:
  tags: [ZooKeeper, Source Code, ZAB, Broadcast]
weight: 12
tldr: "ZAB (ZooKeeper Atomic Broadcast) 的广播阶段类似于两阶段提交 (2PC)，但移除了中断逻辑（只要过半成功即提交）。"
keywords: ["ZooKeeper", "源码阅读", "12.", "ZAB", "协议", "原子广播", "Source Code", "Broadcast"]
---
## 0. 本章定位

ZooKeeper 源码阅读：12. ZAB 协议：原子广播：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

ZAB (ZooKeeper Atomic Broadcast) 的广播阶段类似于两阶段提交 (2PC)，但移除了中断逻辑（只要过半成功即提交）。

ZAB Broadcast 阶段实现强顺序保证，理解 Proposal / ACK / Commit 三阶段对一致性算法学习至关重要。

ZAB 与 Paxos 的关键差异：ZAB 保证全局顺序，Paxos 只保证选主后顺序；理解差异能避免误用场景。

## 1. 流程

1.  **Request**: Client 请求到达 Leader。
2.  **Proposal**: Leader 分配全局唯一 `zxid`，生成 `Proposal`，写入本地事务日志，并广播给所有 Followers。
3.  **Ack**: Follower 收到 Proposal，写入本地事务日志（但不更新内存 DataTree），返回 `Ack` 给 Leader。
4.  **Commit**: Leader 收到过半 `Ack`（包含自己）：
    *   发送 `Commit` 给所有 Followers。
    *   执行本地 Commit（更新 DataTree）。
5.  **Apply**: Follower 收到 `Commit`，更新内存 DataTree。

## 2. 顺序一致性
ZAB 保证了事务的全局顺序。TCP 的 FIFO 特性保证了先发的 Proposal 先到达。

---
**End**: [回到目录](../)
