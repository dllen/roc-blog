---
title: "ZooKeeper 源码阅读：11. ZAB 协议：发现与同步"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, ZAB, Synchronization]
weight: 11
---

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
