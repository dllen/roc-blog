---
title: "ZooKeeper 源码阅读：11. ZAB 协议：发现与同步"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper ZAB Discovery 与 Sync 阶段源码解析：epoch 提议、TRX 差异比对、内存状态同步至 Follower。"
taxonomies:
  tags: [ZooKeeper, Source Code, ZAB, Synchronization]
weight: 11
tldr: "选举结束后，Follower 需要连接 Leader 并同步数据，以保证一致性。"
keywords: ["ZooKeeper", "源码阅读", "11.", "ZAB", "协议", "发现与同步", "Source Code", "Synchronization"]
---
## 0. 本章定位

ZooKeeper 源码阅读：11. ZAB 协议：发现与同步：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

选举结束后，Follower 需要连接 Leader 并同步数据，以保证一致性。

## 1. 发现 (Discovery)
Follower 连接 Leader，发送自己最新的 `lastZxid`。
Leader 根据 Follower 的 `lastZxid` 计算同步策略。

## 2. 同步策略 (Synchronization)

Leader 会根据 Follower 落后的程度，选择不同的同步方式：

### 2.1 DIFF (差异同步)
Follower 落后不多，Leader 的 `committedLog` 缓存中包含 Follower 缺失的 Proposal。
*   Leader 发送 `DIFF` 指令，然后逐条发送缺失的 Proposal 和 Commit。

### 2.2 TRUNC (回滚同步)
Follower 的 zxid 比 Leader 还大（可能是旧 Leader 未提交的数据）。
*   Leader 发送 `TRUNC` 指令，让 Follower 回滚到指定 zxid。

### 2.3 SNAP (全量同步)
Follower 落后太多，缓存中找不到。
*   Leader 发送 `SNAP` 指令，直接传输整个 Snapshot 文件。这是最耗时的。

## 3. 完成同步
同步完成后，Leader 发送 `NEWLEADER`，Follower 回复 `ACK`。
当 Leader 收到过半 Ack 后，发送 `UPTODATE`，集群正式对外服务。

---
**Next**: [ZooKeeper 源码阅读：12. ZAB 协议：原子广播](../12-zab-broadcast/)
