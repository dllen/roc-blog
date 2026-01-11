---
title: "ZooKeeper 源码阅读：06. 网络通信"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Networking, NIO]
weight: 6
---

ZK 使用 NIO 进行网络通信。

## 1. `CnxnFactory`
这是服务端连接工厂的抽象，默认实现是 `NIOServerCnxnFactory` (还有 Netty 实现，但不是默认)。

## 2. 线程模型 (`NIOServerCnxnFactory`)
类似于 Reactor 模型：
1.  **AcceptThread**: 监听端口，接受连接 (`SocketChannel`)，轮询分配给 SelectorThread。
2.  **SelectorThread**: 多个 IO 线程。
    *   将 SocketChannel 注册到自己的 Selector 上。
    *   监听 OP_READ / OP_WRITE 事件。
    *   读取数据，封装成 `Request`，放入 `workerPool`。
3.  **WorkerThread**: 业务处理线程池。
    *   执行 RequestProcessor Chain。

## 3. `ServerCnxn`
代表一个客户端连接。实现类 `NIOServerCnxn`。
*   管理 SessionId。
*   维护 Watcher 列表。
*   发送 Response。

---
**Next**: [ZooKeeper 源码阅读：07. Session 管理](../07-session/)
