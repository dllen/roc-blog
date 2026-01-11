---
title: "Spring 源码阅读：13. 异步 Web 处理"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, MVC, Async]
weight: 13
---

Servlet 3.0 引入了异步处理能力，Spring MVC 对其进行了完美的封装。

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
