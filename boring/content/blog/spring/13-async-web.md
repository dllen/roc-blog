---
title: "Spring 源码阅读：13. 异步 Web 处理"
date: 2026-01-14T10:00:00+08:00
description: "Spring 异步 Web 源码解析：DeferredResult、Callable、Servlet 3.0 async 支持、AsyncTaskExecutor 配置。"
taxonomies:
  tags: [Spring, Source Code, MVC, Async]
weight: 13
tldr: "Servlet 3.0 引入了异步处理能力，Spring MVC 对其进行了完美的封装。"
keywords: ["Spring", "源码阅读", "13.", "异步", "Web", "处理", "Source Code", "MVC"]
---
## 0. 本章定位

Spring 源码阅读：13. 异步 Web 处理：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Servlet 3.0 引入了异步处理能力，Spring MVC 对其进行了完美的封装。

Spring 异步 Web 基于 Servlet 3.0 Async 支持，通过 TaskExecutor 释放 servlet 容器线程，提升吞吐量。

## 1. 为什么需要异步？

传统的 Servlet 是阻塞的：Tomcat 线程 -> Controller -> DB。在 DB 返回前，Tomcat 线程一直被占用。
异步处理：Tomcat 线程 -> Controller -> 开启新线程处理业务 -> Tomcat 线程释放回池。
当业务处理完后，再分配一个 Tomcat 线程将结果写回 Response。
**好处**: 提高了 Tomcat 的吞吐量（不是降低延迟）。

## 2. 核心类

*   **DeferredResult**: 泛型类，用于 Controller 返回。
*   **WebAsyncManager**: 管理异步请求的上下文。

## 3. 处理流程

1.  Controller 返回 `DeferredResult`。
2.  `DispatcherServlet` 检测到是异步结果，调用 `request.startAsync()`，并保存上下文。
3.  当前 Tomcat 线程结束，Response 保持打开状态。
4.  业务线程在后台执行，完成后调用 `deferredResult.setResult(data)`。
5.  Spring MVC 收到结果，再次分发请求 (Dispatch)，但这次会直接去渲染结果，不再执行 Controller 逻辑。

---
**End**: [回到目录](../)
