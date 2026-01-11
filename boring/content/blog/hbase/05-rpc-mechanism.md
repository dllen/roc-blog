---
title: "HBase 源码阅读：05. RPC 通信机制"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, RPC, Netty, Protobuf]
weight: 5
---

HBase 的高性能离不开其定制的 RPC 框架。HBase 2.x 全面拥抱 Netty，实现了异步非阻塞的 IO 模型。

## 1. 架构概览

*   **序列化**: Google Protocol Buffers (Protobuf)。所有的请求和响应对象都由 `.proto` 文件定义。
*   **传输层**: Netty。支持 NIO 和 Epoll。
*   **服务模型**: Client -> Netty Channel -> RpcServer -> Scheduler -> RpcHandler -> Service Implementation。

## 2. Server 端实现 (`NettyRpcServer`)

### 2.1 Listener 与 Reader
*   **Listener**: 监听端口，接受 TCP 连接。
*   **Netty Handler**: `NettyRpcServerPreambleHandler`, `NettyRpcServerRequestDecoder`。
    *   负责处理 TCP 粘包拆包，解析 Protobuf 头部。

### 2.2 Scheduler (调度器)
解析出来的 Call 对象会被扔给 Scheduler。常见的实现是 `SimpleRpcScheduler`。
Scheduler 内部维护了多个队列，将请求分发给不同的 Handler 线程池：
*   **Priority Queue**: 高优先级请求（如 Meta 表操作）。
*   **General Queue**: 普通读写请求。
*   **Replication Queue**: 复制请求。

### 2.3 RpcHandler
工作线程，从队列中取出 Call，执行真正的业务逻辑（调用 `RSRpcServices` 的方法），然后将结果写回 Netty Channel。

## 3. Client 端实现 (`NettyRpcClient`)

客户端通过 `Connection` 复用 TCP 连接。
*   **AsyncProcess**: 客户端的批量提交逻辑。
*   **RpcChannel**: 维护与 RegionServer 的长连接。

## 4. 关键配置

*   `hbase.ipc.server.read.threadpool.size`: 读线程数。
*   `hbase.ipc.server.callqueue.handler.factor`: 队列与 Handler 的比例。
*   `hbase.ipc.server.callqueue.read.ratio`: 读写队列的比例。

---
**Next**: [HBase 源码阅读：06. ZooKeeper 协调机制](../06-zookeeper-coordination/)
