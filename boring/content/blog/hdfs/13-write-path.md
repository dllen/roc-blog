---
title: "HDFS 源码阅读：13. 文件写入流程 (Write Path)"
date: 2026-01-24T10:00:00+08:00
description: "HDFS 最复杂的流程之一。解析 DFSOutputStream, DataStreamer, Packet 队列与 Pipeline 恢复机制。"
tags: [Hadoop, HDFS, Client, Write]
weight: 13
---

`FileSystem.create()` 返回的是 `FSDataOutputStream`，其底层包装了 `DFSOutputStream`。

## 1. 宏观流程

1.  **create (RPC)**: Client 向 NameNode 发送 `create` 请求。NameNode 检查权限，创建文件元数据（状态为 UNDER_CONSTRUCTION），不分配 Block。
2.  **write (Local Buffer)**: Client 写入数据，数据先被缓存在本地 Buffer 中。
3.  **Chunk -> Packet**: Buffer 满（默认 64KB）后，切分为 Packet。
4.  **addBlock (RPC)**: 当第一个 Packet 准备好发送时，Client 向 NameNode 申请一个新的 Block。NameNode 分配 Block ID 和一组 DataNodes (e.g., A, B, C)。
5.  **Pipeline Setup**: Client 连接 A，A 连接 B，B 连接 C，建立 Pipeline。
6.  **Data Streaming**: Client 将 Packet 推送到 Pipeline。
7.  **Ack**: 收到所有 DN 的 Ack 后，Packet 确认为成功。
8.  **close (RPC)**: Client 发送 `complete` 请求，NameNode 确认副本数满足最小要求，关闭文件。

## 2. 内部组件 (DFSOutputStream)

`DFSOutputStream` 内部有两个核心队列和一个线程：

*   **`dataQueue`**: 待发送的 Packet 队列。
*   **`ackQueue`**: 已发送但等待 Ack 的 Packet 队列。
*   **`DataStreamer` 线程**: 负责从 `dataQueue` 取出 Packet，发送到 Pipeline，并处理 Ack。

```java
// DataStreamer.java (简化)
public void run() {
    while (!closed) {
        // 1. Get packet from dataQueue
        Packet one = dataQueue.getFirst();
        
        // 2. Setup pipeline (if stage == PIPELINE_SETUP_CREATE)
        setupPipelineForCreate();
        
        // 3. Send packet
        blockStream.write(one.getBuffer());
        
        // 4. Move to ackQueue
        dataQueue.removeFirst();
        ackQueue.addLast(one);
    }
}
```

## 3. ResponseProcessor

`DataStreamer` 发送数据的同时，会启动一个 `ResponseProcessor` 线程来读取 Pipeline 的 Ack。

如果收到成功的 Ack，就从 `ackQueue` 中移除对应的 Packet。

## 4. 故障处理 (Pipeline Recovery)

如果 Pipeline 中某个 DataNode (比如 B) 挂了，或者网络断了，怎么办？

1.  **检测**: `ResponseProcessor` 抛出异常或超时。
2.  **关闭**: 关闭当前的 Pipeline 连接。
3.  **重构**:
    *   将 `ackQueue` 中的 Packet 放回 `dataQueue` 头部（防止数据丢失）。
    *   向 NameNode 申请更新 Block 的 GenerationStamp（区分新老数据）。
    *   **剔除坏节点**: 剩下的节点 (A, C) 组成新的 Pipeline。
    *   **恢复**: 客户端通知 A 和 C 更新 GenerationStamp，然后继续传输。
4.  **补充**: 如果剩下的节点数太少（`< dfs.namenode.replication.min`），可能会向 NameNode 申请新的节点补充进来（Replica Replacement），或者就这样写完，由 NameNode 后续做异步复制。

## 5. 总结

HDFS 的写入流程设计极其健壮，能够容忍网络抖动和节点故障，保证数据不丢。
