---
title: "HDFS 源码阅读：07. 租约管理 (LeaseManager)"
date: 2026-01-18T10:00:00+08:00
description: "HDFS 如何保证只有一个客户端能写入同一个文件？深入解析 LeaseManager 的软硬限制与恢复机制。"
tags: [Hadoop, HDFS, NameNode, Lease]
weight: 7
---

HDFS 支持 **WORM (Write-Once-Read-Many)** 模型，且同一时刻只允许一个 Client 写入同一个文件。这是通过 **Lease (租约)** 机制实现的。

## 1. Lease 结构

`Lease` 本质上是一个锁凭证。

```java
// LeaseManager.java
class Lease {
    final String holder; // 客户端名称 (ClientName)
    long lastUpdate; // 最后续约时间
    final HashSet<String> paths; // 该客户端正在写的所有文件路径
}
```

## 2. 申请与续约

1.  **申请**: 当 Client 调用 `create` 或 `append` 时，NameNode 会为该 Client 创建或更新 Lease，并将文件路径加入 Lease。
2.  **续约 (Renew)**: Client 启动 `LeaseRenewer` 线程，定期调用 RPC `renewLease`。
    *   默认周期：`dfs.client.namenode.lease.renewer.interval` (默认 1s, 但通常没那么频繁)。

## 3. 软限制与硬限制 (Soft & Hard Limit)

*   **Soft Limit (默认 1分钟)**:
    *   在此期间，NameNode 承诺该 Client 独占写权限。
    *   其他 Client 即使请求，也不能抢占。
*   **Hard Limit (默认 1小时)**:
    *   如果 Client 超过 1 小时没有续约（比如 Client 挂了），NameNode 认为该 Lease 过期。
    *   此时，如果有其他 Client 尝试写入该文件，或者 NameNode 的 `LeaseMonitor` 线程检测到，就会触发 **Lease Recovery**。

## 4. 租约恢复 (Lease Recovery)

当 Lease 过期，HDFS 需要关闭文件，确保数据一致性。

流程：
1.  **Block Recovery**: 找到该文件最后一个 Block 的所有副本。
2.  **同步长度**: 不同的 DataNode 上该 Block 长度可能不一致（因为 Client 挂的时候正在写）。
3.  **截断**: 取最小长度（或所有副本达成一致的长度），将所有副本截断到该长度。
4.  **关闭文件**: NameNode 将文件从 `UNDER_CONSTRUCTION` 状态改为 `COMPLETE`。
5.  **释放 Lease**: 允许新的写入。

这保证了即使 Client 宕机，文件也不会一直被锁死，且数据保持一致（虽然可能丢失最后一部分未确认写入的数据）。
