---
title: "Spring 源码阅读：03. Bean 的生命周期"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, Bean Lifecycle]
weight: 3
---

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
