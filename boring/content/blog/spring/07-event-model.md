---
title: "Spring 源码阅读：07. Event 事件驱动模型"
date: 2026-01-14T10:00:00+08:00
description: "Spring 事件模型源码解析：ApplicationEventMulticaster、@EventListener 异步监听、SmartApplicationListener 智能分发。"
taxonomies:
  tags: [Spring, Source Code, Event, Listener]
weight: 7
tldr: "Spring 的事件机制实现了观察者模式，是模块间解耦的利器。"
keywords: ["Spring", "源码阅读", "07.", "Event", "事件驱动模型", "Source Code", "Listener"]
---
## 0. 本章定位

Spring 源码阅读：07. Event 事件驱动模型：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Spring 的事件机制实现了观察者模式，是模块间解耦的利器。

ApplicationEventMulticaster 默认 SimpleApplicationEventMulticaster 同步广播，生产建议改 @Async 异步监听避免阻塞。

事件发布通常在事务提交后调用 TransactionalEventListener，避免事务回滚导致事件已发布但数据未提交的脏读。

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
