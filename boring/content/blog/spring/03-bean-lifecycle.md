---
title: "Spring 源码阅读：03. Bean 的生命周期"
date: 2026-01-14T10:00:00+08:00
description: "Spring Bean 生命周期源码解析：实例化、属性注入、初始化回调、@PostConstruct / InitializingBean / init-method 顺序。"
taxonomies:
  tags: [Spring, Source Code, Bean Lifecycle]
weight: 3
tldr: "在《J2EE without EJB》中，Rod 强调了 Bean Factory 应该管理对象的生命周期，而不只是简单的 。"
keywords: ["Spring", "源码阅读", "03.", "Bean", "的生命周期", "Source Code", "Bean Lifecycle"]
---
## 0. 本章定位

Spring 源码阅读：03. Bean 的生命周期：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

在《J2EE without EJB》中，Rod 强调了 Bean Factory 应该管理对象的生命周期，而不只是简单的 `new`。

## 1. 宏观流程

Spring Bean 的生命周期可以概括为：
**实例化 (Instantiation) -> 属性赋值 (Population) -> 初始化 (Initialization) -> 销毁 (Destruction)**

所有逻辑都在 `AbstractAutowireCapableBeanFactory.doCreateBean()` 中。

## 2. 详细步骤

1.  **Instantiation**: 调用构造函数（或工厂方法）创建对象实例。
    *   扩展点: `InstantiationAwareBeanPostProcessor.postProcessBeforeInstantiation` (AOP 可能在这里直接返回代理对象，短路后续流程)。
2.  **Population**: 依赖注入，填充属性。
    *   处理 `@Autowired`, `@Value` (`AutowiredAnnotationBeanPostProcessor`)。
    *   扩展点: `InstantiationAwareBeanPostProcessor.postProcessAfterInstantiation`。
3.  **Aware 接口回调**:
    *   `BeanNameAware`, `BeanClassLoaderAware`, `BeanFactoryAware`。
4.  **Initialization**:
    *   **Before**: `BeanPostProcessor.postProcessBeforeInitialization`。
        *   `ApplicationContextAwareProcessor` 处理 `ApplicationContextAware`。
        *   `InitDestroyAnnotationBeanPostProcessor` 处理 `@PostConstruct`。
    *   **Invoke Init Method**:
        *   `InitializingBean.afterPropertiesSet()`。
        *   `init-method` (XML 定义) 或 `@Bean(initMethod=...)`。
    *   **After**: `BeanPostProcessor.postProcessAfterInitialization`。
        *   **AOP 代理**: `AbstractAutoProxyCreator` 在这里将 Bean 包装为 Proxy。
5.  **Destruction**:
    *   `@PreDestroy`。
    *   `DisposableBean.destroy()`。
    *   `destroy-method`。

## 3. 记忆技巧 (BPP 的位置)

`BeanPostProcessor` (BPP) 是 Spring 扩展的核心。
*   **Instantiation**
*   **Population**
*   **BPP Before** (处理 `@PostConstruct`)
*   **Init Method**
*   **BPP After** (处理 AOP 代理)

---
**Next**: [Spring 源码阅读：04. 依赖注入 (DI) 的实现](../04-dependency-injection/)
