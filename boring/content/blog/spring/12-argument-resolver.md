---
title: "Spring 源码阅读：12. 参数解析与返回值处理"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, MVC, ArgumentResolver]
weight: 12
---

Controller 的方法签名千变万化（`HttpServletRequest`, `@RequestParam`, `@RequestBody`, `User`...），Spring 是如何把 HTTP 请求参数绑定到这些方法参数上的？

## 1. `HandlerMethodArgumentResolver`

`RequestMappingHandlerAdapter` 维护了一个 `ArgumentResolver` 列表。
对于每一个参数，Spring 会遍历列表，调用 `supportsParameter()` 检查是否支持。

### 1.1 常见实现
*   `RequestParamMethodArgumentResolver`: 处理 `@RequestParam` 和简单类型。
*   `RequestResponseBodyMethodProcessor`: 处理 `@RequestBody`。内部使用 `HttpMessageConverter` (如 Jackson) 进行 JSON 反序列化。
*   `ServletRequestMethodArgumentResolver`: 处理 `HttpServletRequest`, `HttpSession`。

## 2. `HandlerMethodReturnValueHandler`

处理 Controller 方法的返回值。

### 2.1 常见实现
*   `ViewNameMethodReturnValueHandler`: 返回 String (视图名称)。
*   `RequestResponseBodyMethodProcessor`: 处理 `@ResponseBody`。内部使用 `HttpMessageConverter` 进行 JSON 序列化，并写入 Response。

## 3. 设计哲学
这种基于接口的策略模式，使得 Spring MVC 具有极强的扩展性。你可以轻松自定义一个 `@CurrentUser` 注解，并写一个 Resolver 自动注入当前登录用户。

---
**Next**: [Spring 源码阅读：13. 异步 Web 处理](../13-async-web/)
