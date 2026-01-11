---
title: "Spring 源码阅读：00. 阅读大纲与学习路线"
date: 2026-01-14T10:00:00+08:00
description: "结合《Expert One-on-One J2EE Development without EJB》，规划 Spring 源码阅读路线。从 POJO 编程模型到 Spring Boot 自动装配。"
tags: [Spring, Source Code, Outline, Rod Johnson]
weight: 0
---

Spring Framework 的诞生源于 Rod Johnson 在 2002 年出版的经典著作 **《Expert One-on-One J2EE Development without EJB》**。这本书不仅批判了当时 EJB 的臃肿与复杂，更提出了一套基于 **POJO (Plain Old Java Object)** 的轻量级开发理念，这正是 Spring 框架的雏形。

本系列将尝试“回到未来”，结合书中的原始设计思想，深入剖析 Spring 5.x/6.x 的源码实现，看看当年的愿景是如何一步步演化为今天的 Java 事实标准的。

## Phase 1: 起源与核心容器 (Origins & Core Container)
*《J2EE without EJB》核心思想：Inversion of Control (IoC) 是解耦的关键。*

*   **01. 历史的回响：从 `interface21` 到 Spring**: 回顾书中提出的框架原型，对比现代 Spring 的模块结构。
*   **02. IoC 容器启动流程**: `ApplicationContext` 的 `refresh()` 方法全解析 (BeanDefinition 加载、后置处理器)。
*   **03. Bean 的生命周期**: 也就是书中提到的 "Bean Factory" 模式的极致扩展 (Instantiation, Population, Initialization, Destruction)。
*   **04. 依赖注入 (DI) 的实现**: 循环依赖是如何解决的？三级缓存 (`singletonFactories`) 详解。

## Phase 2: AOP 与基础设施 (AOP & Infrastructure)
*《J2EE without EJB》核心思想：将非业务逻辑（Cross-cutting concerns）剥离。*

*   **05. AOP 代理机制**: JDK Dynamic Proxy vs CGLIB。Spring 如何自动选择？
*   **06. Pointcut 与 Advisor**: 切点表达式解析与拦截器链 (Interceptor Chain) 的构造。
*   **07. Event 事件驱动模型**: `ApplicationEvent` 与 `ApplicationListener` 的同步/异步实现。

## Phase 3: 数据访问与事务 (Data Access & Transaction)
*《J2EE without EJB》核心思想：Checked Exception 是邪恶的，统一异常体系；Template 模式简化资源管理。*

*   **08. 统一异常体系**: `DataAccessException` 层次结构与 SQLException 转换策略。
*   **09. JdbcTemplate 设计模式**: 经典的 Template-Callback 模式源码分析。
*   **10. 声明式事务管理**: `@Transactional` 的背后。事务传播机制 (Propagation) 与隔离级别 (Isolation) 的实现。

## Phase 4: Web MVC (Web MVC)
*《J2EE without EJB》核心思想：Web 层应该是薄薄的一层，业务逻辑下沉。*

*   **11. DispatcherServlet 流程**: `doDispatch` 方法详解。HandlerMapping, HandlerAdapter, ViewResolver。
*   **12. 参数解析与返回值处理**: `HandlerMethodArgumentResolver` 与 `ReturnValueHandler`。
*   **13. 异步 Web 处理**: Servlet 3.0 异步支持与 `DeferredResult`。

## 学习建议
1.  **对照阅读**: 强烈建议在阅读源码的同时，翻阅《J2EE without EJB》的第 4 章 (J2EE Design Solutions) 和第 11 章 (Infrastructure and Application Implementation)。
2.  **关注接口**: Spring 的美在于接口设计。关注 `BeanPostProcessor`, `BeanFactoryPostProcessor` 等扩展点。
3.  **调试**: 跟着 `AbstractApplicationContext.refresh()` 跑一遍是必修课。
