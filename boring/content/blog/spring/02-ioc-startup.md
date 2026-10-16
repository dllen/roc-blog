---
title: "Spring 源码阅读：02. IoC 容器启动流程"
date: 2026-01-14T10:00:00+08:00
description: "Spring IoC 容器启动流程源码解析：ClassPathXmlApplicationContext / AnnotationConfigApplicationContext、refresh() 12 步。"
taxonomies:
  tags: [Spring, Source Code, IoC, ApplicationContext]
weight: 2
tldr: "Spring 的核心就是 IoC 容器。了解 是如何启动的，是阅读源码的第一步。"
keywords: ["Spring", "源码阅读", "02.", "IoC", "容器启动流程", "Source Code", "ApplicationContext"]
---
## 0. 本章定位

Spring 源码阅读：02. IoC 容器启动流程：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

Spring 的核心就是 IoC 容器。了解 `ApplicationContext` 是如何启动的，是阅读源码的第一步。

ApplicationContext refresh 12 步是 Spring 源码学习的核心路径，建议对照 AbstractApplicationContext 单步调试。

refresh 12 步对应 BeanFactory 创建、BeanDefinition 加载、BeanFactoryPostProcessor、BeanPostProcessor 等关键扩展点。

refresh 完成后 BeanFactory 才真正可用，生产环境启动慢多半卡在 BeanPostProcessor 链或循环依赖。

## 1. 核心方法：`refresh()`

所有 ApplicationContext 的启动逻辑都封装在 `AbstractApplicationContext.refresh()` 方法中。这是一个典型的**模板方法模式**。

```java
public void refresh() throws BeansException, IllegalStateException {
    synchronized (this.startupShutdownMonitor) {
        // 1. 准备环境 (Environment, PropertySources)
        prepareRefresh();

        // 2. 获取 BeanFactory (DefaultListableBeanFactory)
        // 加载 BeanDefinition (XML, Annotation)
        ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

        // 3. 预处理 BeanFactory (设置 ClassLoader, 忽略接口等)
        prepareBeanFactory(beanFactory);

        try {
            // 4. 子类扩展点 (如 WebServer 启动)
            postProcessBeanFactory(beanFactory);

            // 5. 调用 BeanFactoryPostProcessor (BFPP)
            // 比如 PropertyPlaceholderConfigurer 替换占位符
            // ConfigurationClassPostProcessor 解析 @Configuration 类
            invokeBeanFactoryPostProcessors(beanFactory);

            // 6. 注册 BeanPostProcessor (BPP)
            // 比如 AutowiredAnnotationBeanPostProcessor 处理 @Autowired
            registerBeanPostProcessors(beanFactory);

            // 7. 初始化 MessageSource (国际化)
            initMessageSource();

            // 8. 初始化事件广播器
            initApplicationEventMulticaster();

            // 9. 子类扩展点 (onRefresh)
            // Spring Boot 在这里启动 Tomcat
            onRefresh();

            // 10. 注册监听器
            registerListeners();

            // 11. 实例化所有非懒加载的单例 Bean (核心步骤!)
            finishBeanFactoryInitialization(beanFactory);

            // 12. 发布 ContextRefreshedEvent
            finishRefresh();
        }
        ...
    }
}
```

## 2. `BeanDefinition` 的加载

在步骤 2 `obtainFreshBeanFactory()` 中，Spring 会加载所有的 `BeanDefinition`。
`BeanDefinition` 是 Spring 对 Bean 的元数据描述（类名、Scope、属性值、依赖关系等）。
*   **XML**: `XmlBeanDefinitionReader` 解析 XML。
*   **Annotation**: `ConfigurationClassPostProcessor` (在步骤 5 执行) 解析 `@Component`, `@Bean`。

## 3. 实例化时机

注意，在步骤 11 之前，容器中只有 `BeanDefinition`，还没有真正的 Bean 实例（BFPP 和 BPP 除外）。
只有执行到 `finishBeanFactoryInitialization` 时，Spring 才会遍历所有的 `BeanDefinition`，调用 `getBean()` 触发实例化。

---
**Next**: [Spring 源码阅读：03. Bean 的生命周期](../03-bean-lifecycle/)
