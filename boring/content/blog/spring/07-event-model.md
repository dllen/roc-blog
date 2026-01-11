---
title: "Spring 源码阅读：07. Event 事件驱动模型"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, Event, Listener]
weight: 7
---

Spring 的事件机制实现了观察者模式，是模块间解耦的利器。

## 1. 核心组件

*   **ApplicationEvent**: 事件基类。
*   **ApplicationListener**: 监听器接口。
*   **ApplicationEventMulticaster**: 广播器，负责将事件发送给所有匹配的监听器。

## 2. 广播流程

当调用 `applicationContext.publishEvent(event)` 时：

1.  **获取广播器**: `getApplicationEventMulticaster()`。
2.  **查找监听器**: `retrieveApplicationListeners(event)`。
    *   Spring 会根据 Event 的类型，智能匹配泛型监听器 (`@EventListener` 或实现接口)。
3.  **执行**:
    *   默认情况下，`SimpleApplicationEventMulticaster` 是**同步**执行的。也就是说，发布事件的线程会逐个调用监听器的方法。如果监听器抛出异常，会阻断后续流程（除非配置了 `ErrorHandler`）。
    *   可以通过配置 `TaskExecutor` 实现**异步**广播。

## 3. `@EventListener` 的实现

Spring 4.2 引入了注解式监听。
原理是 `EventListenerMethodProcessor` (一个 `SmartInitializingSingleton`)。
它会扫描所有 Bean 的方法，如果标了 `@EventListener`，就动态生成一个 `ApplicationListener` 适配器，并注册到 Multicaster 中。

---
**Next**: [Spring 源码阅读：08. 统一异常体系](../08-exception-hierarchy/)
