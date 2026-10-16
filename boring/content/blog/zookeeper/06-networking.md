---
title: "ZooKeeper 源码阅读：06. 网络通信"
date: 2026-01-13T10:00:00+08:00
description: "解析 ZooKeeper 基于 NIO 的网络通信模型：CnxnFactory 抽象、AcceptThread + SelectorThread + WorkerThread 三层 Reactor 线程组，以及 ServerCnxn 的会话管理。"
taxonomies:
  tags: [ZooKeeper, Source Code, Networking, NIO]
weight: 6
tldr: "解析 ZooKeeper 基于 NIO 的网络通信模型：CnxnFactory 抽象、AcceptThread + SelectorThread + WorkerThread 三层 Reactor 线程组，以及 ServerCnxn 的会话管理。"
keywords: ["ZooKeeper", "源码阅读", "06.", "网络通信", "Source Code", "Networking", "NIO"]
---

## 0. 本章定位

ZK 网络通信是连接客户端请求与服务端处理的咽喉：所有来自客户端的操作（创建节点、读数据、注册 Watcher）都要经过本章涉及的 `CnxnFactory` 与 `ServerCnxn` 抽象，再被切分为网络事件与业务事件两条处理链路。本章读完，你应当能画出一次完整请求从 Socket 到 Processor 链的全链路时序图，并理解为何 ZK 选择 NIO 而非 Netty 作为默认实现——答案藏在 2010 年的 Java 版本依赖与运维保守性的权衡里。

ZK 使用 NIO 进行网络通信。整体设计参考 Reactor 多线程模型，分为连接接入、IO 多路复用、业务处理三层职责清晰的线程组。本章是后续 Session、Watcher、ZAB 协议等章节的基础——所有请求包在网络层封装为 `ServerCnxn`，再投递到 Processor 链；理解线程模型就能理解为何 ZK 在高并发下能保持稳定的吞吐与较低的 P99 延迟。

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

## 4. 常见陷阱

- **Selector 线程数配置过小**：高并发下 `NIOServerCnxnFactory` 的 Selector 数量是瓶颈，3.7+ 默认值偏低，生产环境通常调到 8-16。
- **`OP_WRITE` 假死**：写入被 Selector 反复触发但实际未发送，需要在写完后立即 `cancelOP_WRITE`，否则 CPU 飙高。
- **`Session` 续期与网络线程耦合**：过期 Session 关闭走的是 IO 线程，复杂业务逻辑不要在关闭回调里跑。

---
**Next**: [ZooKeeper 源码阅读：07. Session 管理](../07-session/)
