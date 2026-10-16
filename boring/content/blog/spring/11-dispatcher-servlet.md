---
title: "Spring 源码阅读：11. DispatcherServlet 流程"
date: 2026-01-14T10:00:00+08:00
description: "Spring DispatcherServlet 源码解析：initStrategies 初始化九大组件、doDispatch 请求处理 12 步流程。"
taxonomies:
  tags: [Spring, Source Code, MVC, DispatcherServlet]
weight: 11
tldr: "Spring MVC 的核心是 ，它是前端控制器 (Front Controller) 模式的实现。"
keywords: ["Spring", "源码阅读", "11.", "DispatcherServlet", "流程", "Source Code", "MVC"]
---
## 0. 本章定位

Spring 源码阅读：11. DispatcherServlet 流程：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Spring MVC 的核心是 `DispatcherServlet`，它是前端控制器 (Front Controller) 模式的实现。

doDispatch 12 步是 Spring MVC 请求处理核心：HandlerMapping 找处理器、HandlerAdapter 适配、Handler 执行、ViewResolver 解析视图。

## 1. 初始化 (`onRefresh`)

`DispatcherServlet` 在启动时会从 `ApplicationContext` 中加载各种策略组件：
*   `initHandlerMappings`: 初始化处理器映射器 (URL -> Handler)。
*   `initHandlerAdapters`: 初始化处理器适配器 (如何执行 Handler)。
*   `initViewResolvers`: 初始化视图解析器。

## 2. 请求处理 (`doDispatch`)

这是 MVC 的心脏，处理每一个 HTTP 请求。

1.  **Check Multipart**: 检查是否是文件上传请求。
2.  **Get Handler**: 遍历 `HandlerMappings`，找到能处理当前 URL 的 `HandlerExecutionChain` (包含 Handler 和 Interceptors)。
3.  **Get Adapter**: 遍历 `HandlerAdapters`，找到能执行该 Handler 的适配器（如 `RequestMappingHandlerAdapter`）。
4.  **PreHandle**: 执行拦截器的 `preHandle`。
5.  **Handle**: 调用 `adapter.handle()`，执行 Controller 方法，返回 `ModelAndView`。
6.  **PostHandle**: 执行拦截器的 `postHandle`。
7.  **Process Result**:
    *   如果有异常，处理异常 (`HandlerExceptionResolver`)。
    *   如果有 View，渲染视图 (`render`)。
    *   执行拦截器的 `afterCompletion`。

---
**Next**: [Spring 源码阅读：12. 参数解析与返回值处理](../12-argument-resolver/)
