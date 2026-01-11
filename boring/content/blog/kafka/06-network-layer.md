---
title: "Kafka 源码阅读：06. 网络层设计"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Networking, Reactor]
weight: 6
---

Broker 的网络层基于 Java NIO，采用了经典的 **Reactor 多线程模型**。

## 1. 核心组件 (`SocketServer`)

*   **Acceptor**: 单个线程，负责 `OP_ACCEPT`，建立连接。
    *   新连接建立后，Round-Robin 分配给 Processor 线程。
*   **Processor**: 多个线程 (`num.network.threads`)，每个维护自己的 Selector。
    *   负责 `OP_READ` 和 `OP_WRITE`。
    *   读取到的 Request 放入 `RequestChannel` 的 RequestQueue。
*   **RequestChannel**: 核心缓冲队列。
    *   `requestQueue`: 存放待处理请求。
    *   `responseQueues`: 每个 Processor 一个响应队列。
*   **RequestHandlerPool**: 业务线程池 (`num.io.threads`)。
    *   从 `RequestChannel` 取出请求，调用 `KafkaApis` 处理。

## 2. 数据流向

1.  Client -> Acceptor (Connect)
2.  Acceptor -> Processor (Register OP_READ)
3.  Processor -> Read Bytes -> RequestChannel (Queue)
4.  RequestHandler -> KafkaApis (Process) -> Response -> RequestChannel (ResponseQueue)
5.  Processor -> OP_WRITE -> Client

## 3. KafkaApis

这是业务逻辑的入口，类似于 Spring MVC 的 DispatcherServlet。
它根据 Request 的 API Key (如 PRODUCE, FETCH, METADATA) 分发到具体的处理方法 (如 `handleProduceRequest`)。

---
**Next**: [Kafka 源码阅读：07. 日志存储 (Log Storage)](../07-log-storage/)
