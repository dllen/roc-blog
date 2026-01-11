---
title: "HDFS 源码阅读：11. 数据传输协议 (DataTransferProtocol)"
date: 2026-01-22T10:00:00+08:00
description: "解析 HDFS 的数据高速公路：基于 TCP/Netty 的 DataTransferProtocol，以及 DataXceiver 的工作原理。"
tags: [Hadoop, HDFS, DataNode, Network]
weight: 11
---

RPC 用于传输元数据，而真正海量的数据传输走的是 **Data Transfer Protocol**。这是一个基于 TCP 的流式协议。

## 1. 协议概览

Client 或 DataNode 连接目标 DataNode 的 Data Port (9866)，发送一个 Header，包含：

*   **Version**: 协议版本。
*   **OpCode**: 操作类型。
    *   `OP_WRITE_BLOCK` (80): 写入 Block。
    *   `OP_READ_BLOCK` (81): 读取 Block。
    *   `OP_READ_METADATA` (82): 读取 Checksum 文件。
    *   `OP_REPLACE_BLOCK` (83): 副本复制/均衡。
    *   `OP_COPY_BLOCK` (84): 同上。
    *   `OP_BLOCK_CHECKSUM` (85): 获取 Block 校验和。

## 2. DataXceiverServer & DataXceiver

DataNode 启动一个 `DataXceiverServer`（通常基于 `java.nio` 或 Netty），监听端口。

每当有一个连接进来，就创建一个 `DataXceiver` (Receiver + Transceiver) 线程（或 Task）来处理。

```java
// DataXceiver.java
public void run() {
    // 读取 OpCode
    op = readOp();
    switch (op) {
        case OP_READ_BLOCK:
            readBlock();
            break;
        case OP_WRITE_BLOCK:
            writeBlock();
            break;
        // ...
    }
}
```

## 3. BlockReceiver (写入)

当处理 `OP_WRITE_BLOCK` 时，DataNode 会创建 `BlockReceiver`。

*   **Pipeline**: Client -> DN1 -> DN2 -> DN3。
*   **Packet**: 数据被切分成 Packet (默认 64KB)。
*   **流程**:
    1.  DN1 收到 Packet，写入本地磁盘。
    2.  同时将 Packet 转发给 DN2。
    3.  DN2 转发给 DN3。
    4.  DN3 写完后，发送 Ack 给 DN2。
    5.  DN2 收到 Ack 后，发送 Ack 给 DN1。
    6.  DN1 发送 Ack 给 Client。

这种流水线机制使得延时是线性的，但吞吐量是并行的（受限于最慢的节点）。

## 4. BlockSender (读取)

当处理 `OP_READ_BLOCK` 时，DataNode 会创建 `BlockSender`。

*   利用 `java.nio.channels.FileChannel.transferTo` (零拷贝) 将磁盘文件直接发送到 Socket，极大提高了读取性能。
*   同时发送数据和 Checksum，客户端边收边校验。

## 5. 短路读 (Short Circuit Read)

如果 Client 和 DataNode 在同一台机器上，通过 TCP 读数据太慢了。
HDFS 支持 **Short Circuit Read**：Client 直接通过 UNIX Domain Socket 获取文件描述符 (File Descriptor)，绕过 DataNode 进程直接读取本地文件。

## 6. 总结

DataTransferProtocol 是 HDFS 吞吐量的关键。理解 Pipeline 和 Packet 机制对于排查写入慢的问题至关重要。
