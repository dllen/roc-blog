---
title: "Spring 源码阅读：11. DispatcherServlet 流程"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, MVC, DispatcherServlet]
weight: 11
---

Spring MVC 的核心是 `DispatcherServlet`，它是前端控制器 (Front Controller) 模式的实现。

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
