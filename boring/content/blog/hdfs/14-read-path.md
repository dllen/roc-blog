---
title: "HDFS 源码阅读：14. 文件读取流程 (Read Path)"
date: 2026-01-25T10:00:00+08:00
description: "解析 DFSInputStream 如何选择最优的 DataNode，以及 Checksum 校验机制。"
taxonomies:
  tags: [Hadoop, HDFS, Client, Read]
weight: 14
tldr: "解析 DFSInputStream 如何选择最优的 DataNode，以及 Checksum 校验机制。"
keywords: ["HDFS", "源码阅读", "14.", "文件读取流程", "Read", "Path", "Hadoop", "Client"]
---
## 0. 本章定位

HDFS 源码阅读：14. 文件读取流程 (Read Path)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

`FileSystem.open()` 返回 `FSDataInputStream`，底层是 `DFSInputStream`。

## 1. 宏观流程

1.  **getBlockLocations (RPC)**: Client 向 NameNode 查询文件的前几个 Block 的位置。
    *   NameNode 返回 `LocatedBlocks`，包含 Block ID 和每个 Block 的 DataNode 列表（按距离排序，最近的排前面）。
2.  **Read Block**: Client 选取最近的 DataNode，建立连接读取 Block。
3.  **Next Block**: 读完一个 Block 后，再读下一个。如果缓存的 `LocatedBlocks` 用完了，再次请求 NameNode。

## 2. 距离排序 (Distance Sorting)

NameNode 在返回 Block 位置时，会计算 Client 与 DataNode 的距离：

*   **本地**: 距离 0。
*   **同机架**: 距离 2。
*   **跨机架**: 距离 4。
*   **跨数据中心**: 距离 6。

Client 优先读取距离最近的节点。

## 3. DFSInputStream 实现

`DFSInputStream` 管理着读取逻辑。

*   **`BlockReader`**: 抽象了读取 Block 的接口。
    *   `BlockReaderRemote`: 通过 TCP 读取。
    *   `BlockReaderLocal`: 短路读 (Short Circuit Read)。

```java
// DFSInputStream.java
private BlockReader getBlockReader(LocatedBlock targetBlock, ...) {
    // 尝试短路读
    if (shortCircuitEnabled && isLocal(targetBlock)) {
        return new BlockReaderLocal(...);
    }
    // 否则走 TCP
    return new BlockReaderRemote(...);
}
```

## 4. 故障处理

如果在读取 Block 时，DataNode A 挂了或 Checksum 校验失败：

1.  **记录坏块**: 将 A 放入 `deadNodes` 列表，本次读取不再尝试 A。
2.  **切换节点**: 尝试该 Block 的下一个副本 B。
3.  **汇报**: 如果是 Checksum 错误，Client 会通过 RPC `reportBadBlocks` 告知 NameNode，NameNode 会安排副本修复。

## 5. 总结

读取流程相对简单，核心在于**就近读取**和**故障自动切换**。
