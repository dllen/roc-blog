---
title: "HDFS 源码阅读：10. 心跳与块汇报 (Heartbeat & BlockReport)"
date: 2026-01-21T10:00:00+08:00
description: "解析 DataNode 与 NameNode 之间的生命线：心跳机制、全量块汇报与增量块汇报。"
tags: [Hadoop, HDFS, DataNode, RPC]
weight: 10
---

DataNode 是被动的，它通过 RPC 主动联系 NameNode。

## 1. 心跳 (Heartbeat)

*   **频率**: 默认 3 秒 (`dfs.heartbeat.interval`)。
*   **内容**:
    *   DataNode 标识 (StorageID)。
    *   存储容量、已用空间、剩余空间。
    *   当前正在进行的数据传输连接数 (XceiverCount)。
    *   **Failed Volumes**: 坏盘信息。
*   **作用**:
    *   告诉 NameNode "我还活着"。
    *   NameNode 通过心跳返回值下达**指令**（如：删除副本、复制副本、恢复 Lease）。

```java
// BPServiceActor.java
HeartbeatResponse resp = bpNamenode.sendHeartbeat(...);
DatanodeCommand[] cmds = resp.getCommands();
if (cmds != null) {
    processCommand(cmds);
}
```

## 2. 全量块汇报 (Full Block Report)

*   **频率**: 默认 6 小时 (`dfs.blockreport.intervalMsec`)。
*   **内容**: DataNode 上**所有** Block 的 ID、长度、GenerationStamp。
*   **过程**:
    1.  DataNode 扫描磁盘（或者内存中的副本列表）。
    2.  构造巨大的 `StorageBlockReport` 对象。
    3.  通过 RPC 发送给 NameNode。
    4.  NameNode 对比内存中的 BlockMap，修正不一致（如删除 NameNode 认为已删除但 DataNode 上还在的 Block）。
*   **性能影响**: 全量汇报非常消耗 NameNode 的 CPU 和锁资源。因此启动时或大规模重启时，可能会造成 NameNode 短暂卡顿。

## 3. 增量块汇报 (IBR - Incremental Block Report)

为了减轻全量汇报的压力，HDFS 引入了 IBR。

*   **触发时机**:
    *   新 Block 写入完成。
    *   Block 被删除。
*   **机制**: DataNode 将这些变更积攒在队列中，随下一次心跳发送（或单独发送，取决于配置 `dfs.blockreport.split.threshold`）。
*   **优势**: 实时性高，NameNode 处理开销小。

## 4. 租约汇报 (Cache Report)

如果使用了 HDFS 集中式缓存 (Centralized Cache Management)，DataNode 还需要汇报缓存块的状态。

## 5. 总结

心跳维持活性，IBR 保证实时性，全量汇报作为兜底的一致性校验。三者共同维护了 NameNode 元数据的准确性。
