---
title: "Redis 源码阅读：13. 网络层 (连接、IO 与 RESP)"
date: 2026-01-11T11:00:00+08:00
description: "Redis 如何处理新连接？如何读取请求并解析 RESP 协议？输出缓冲区是如何工作的？"
tags: [Redis, Source Code, Networking, RESP, IO]
weight: 13
---

Redis 的网络层代码主要集中在 `src/networking.c` 中。

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
