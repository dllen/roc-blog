---
title: "Spring 源码阅读：02. IoC 容器启动流程"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, IoC, ApplicationContext]
weight: 2
---

Spring 的核心就是 IoC 容器。了解 `ApplicationContext` 是如何启动的，是阅读源码的第一步。

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
