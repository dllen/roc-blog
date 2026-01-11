---
title: "ZooKeeper 源码阅读：12. ZAB 协议：原子广播"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, ZAB, Broadcast]
weight: 12
---

ZAB (ZooKeeper Atomic Broadcast) 的广播阶段类似于两阶段提交 (2PC)，但移除了中断逻辑（只要过半成功即提交）。

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
