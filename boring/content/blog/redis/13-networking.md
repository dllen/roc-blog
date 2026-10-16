---
title: "Redis 源码阅读：13. 网络层 (连接、IO 与 RESP)"
date: 2026-01-11T11:00:00+08:00
description: "Redis 如何处理新连接？如何读取请求并解析 RESP 协议？输出缓冲区是如何工作的？"
taxonomies:
  tags: [Redis, Source Code, Networking, RESP, IO]
weight: 13
tldr: "Redis 如何处理新连接？如何读取请求并解析 RESP 协议？输出缓冲区是如何工作的？"
keywords: ["Redis", "源码阅读", "13.", "网络层", "连接、IO", "RESP", "Source Code", "Networking"]
---
## 0. 本章定位

Redis 源码阅读：13. 网络层 (连接、IO 与 RESP)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Redis 的网络层代码主要集中在 `src/networking.c` 中。

Redis 6.0 的多线程 IO 是大性能拐点，理解 epoll / io_uring 与命令执行线程池的协作对调优至关重要。

生产环境调优重点：io-threads 与 io-threads-do-reads 配置，单线程与多线程模式切换需要客户端协议支持。

## 1. 接受连接 (Accept)
当有新客户端连接时：
1.  触发 `acceptTcpHandler`。
2.  调用 `anetAccept` 接受连接，得到 fd。
3.  调用 `createClient` 创建 `client` 结构体。
4.  注册 `readQueryFromClient` 为该 fd 的读处理器。

## 2. 读取请求
当客户端发送命令时：
1.  触发 `readQueryFromClient`。
2.  调用 `read` 系统调用将数据读入 `c->querybuf` (输入缓冲区)。
3.  调用 `processInputBuffer` 解析 RESP 协议。

## 3. 协议解析 (RESP)
Redis 使用 **RESP (Redis Serialization Protocol)** 协议。
`processMultibulkBuffer` 函数负责解析协议：
*   读取 `*` 后的数字，确定参数个数 (argc)。
*   循环读取 `$` 后的数字，确定每个参数的长度。
*   读取参数内容，构建 `robj` 对象，存入 `c->argv` 数组。

## 4. 发送响应
当命令执行完后，Redis 需要将结果发回客户端：
1.  调用 `addReply` 系列函数。
2.  数据首先写入 `c->buf` (固定 16KB 缓冲区)。
3.  如果 `c->buf` 满了，写入 `c->reply` (链表缓冲区)。
4.  注册 `sendReplyToClient` 写处理器。
5.  在下一次事件循环中，将缓冲区数据 write 给客户端。
