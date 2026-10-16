---
title: "Redis 源码阅读：11. Server 启动流程 (main 函数)"
date: 2026-01-11T09:00:00+08:00
description: "Redis 服务器启动时都做了什么？从 main 函数开始，一步步追踪 Redis 的初始化过程。"
taxonomies:
  tags: [Redis, Source Code, Startup, Server]
weight: 11
tldr: "Redis 服务器启动时都做了什么？从 main 函数开始，一步步追踪 Redis 的初始化过程。"
keywords: ["Redis", "源码阅读", "11.", "Server", "启动流程", "main", "函数", "Source Code"]
---
## 0. 本章定位

Redis 源码阅读：11. Server 启动流程 (main 函数)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Redis 的入口位于 `src/server.c` 的 `main` 函数。整个启动过程可以概括为以下几个步骤：

Redis 启动流程涉及配置加载、数据持久化恢复、AOF / RDB 选择、AOF 重写等关键决策点；建议配合源码中的 error.h 与 redis.h 头文件理解。

启动流程还包括 serverCron 定时任务、慢查询日志、客户端连接管理等，理解它们能解释生产 Redis 的常见异常现象。

理解启动顺序有助于诊断 Redis 启动失败：先看配置加载、再看 RDB/AOF 恢复、最后才是事件循环初始化。

## 1. 初始化全局配置
`initServerConfig()`：设置 `server` 结构体的默认值。
*   默认端口 6379
*   默认 DB 数量 16
*   默认持久化策略等

## 2. 加载配置文件
如果启动时指定了配置文件（如 `./redis-server redis.conf`），Redis 会调用 `loadServerConfig()` 解析配置文件，并覆盖默认配置。

## 3. 初始化服务器
`initServer()` 是启动流程中最核心的函数：
*   **创建事件循环**：`aeCreateEventLoop()`。
*   **分配 DB 内存**：`server.db = zmalloc(sizeof(redisDb)*server.dbnum)`。
*   **监听端口**：`listenToPort()`，绑定 TCP/UDP 端口。
*   **创建时间事件**：`aeCreateTimeEvent`，注册 `serverCron`（Redis 的心跳函数）。
*   **创建文件事件**：`aeCreateFileEvent`，注册 `acceptTcpHandler`，开始接受客户端连接。

## 4. 加载数据
*   **加载 AOF/RDB**：`loadDataFromDisk()`。如果开启了 AOF，优先加载 AOF；否则加载 RDB。

## 5. 开始事件循环
`aeMain()`：进入死循环，开始处理事件。
```c
void aeMain(aeEventLoop *eventLoop) {
    eventLoop->stop = 0;
    while (!eventLoop->stop) {
        aeProcessEvents(eventLoop, AE_ALL_EVENTS);
    }
}
```
至此，Redis 启动完成，开始等待客户端的请求。
