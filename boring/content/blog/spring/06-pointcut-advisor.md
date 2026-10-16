---
title: "Spring 源码阅读：06. Pointcut 与 Advisor"
date: 2026-01-14T10:00:00+08:00
description: "Spring Pointcut 与 Advisor 源码解析：AspectJ 表达式解析、IntroductionAdvisor、@DeclareParents 引入。"
taxonomies:
  tags: [Spring, Source Code, AOP, Pointcut, Advisor]
weight: 6
tldr: "AOP 的三个核心概念：Where (Pointcut), What (Advice), When (Interceptor)。"
keywords: ["Spring", "源码阅读", "06.", "Pointcut", "Advisor", "Source Code", "AOP"]
---
## 0. 本章定位

Spring 源码阅读：06. Pointcut 与 Advisor：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

AOP 的三个核心概念：Where (Pointcut), What (Advice), When (Interceptor)。

## 1. Advisor = Pointcut + Advice

在 Spring AOP 内部，我们常说的 Aspect（切面）会被解析为多个 `Advisor` 对象。
一个 `Advisor` 包含：
*   **Pointcut**: 切点。定义了“在哪些类、哪些方法”上应用增强。
*   **Advice**: 通知。定义了“做什么”（Before, After, Around）。

## 2. 拦截器链 (`ReflectiveMethodInvocation`)

当代理对象的方法被调用时，Spring 会构造一个拦截器链 (Interceptor Chain)。

1.  **获取 Advisor**: 从 `ProxyFactory` 中获取所有适用于当前 Bean 的 Advisor。
2.  **筛选**: 遍历 Advisor，使用 `Pointcut` 匹配当前调用的方法。
3.  **适配**: 将 Advice 适配为 `MethodInterceptor` (Spring AOP 基于 AOP Alliance 标准接口)。
    *   `MethodBeforeAdvice` -> `MethodBeforeAdviceInterceptor`
    *   `AfterReturningAdvice` -> `AfterReturningAdviceInterceptor`
4.  **执行**: 创建 `ReflectiveMethodInvocation` 对象，递归调用 `proceed()` 方法。
    *   这是一个典型的**责任链模式**。

## 3. `Pointcut` 解析

Spring 使用 AspectJ 的表达式解析器 (`AspectJExpressionPointcut`) 来解析 `@Pointcut("execution(* com.example..*.*(..))")`。
虽然解析用了 AspectJ 的 jar 包，但执行期依然是 Spring 的动态代理，而非 AspectJ 的编译期织入。

---
**Next**: [Spring 源码阅读：07. Event 事件驱动模型](../07-event-model/)
