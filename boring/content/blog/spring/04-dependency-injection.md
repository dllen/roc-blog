---
title: "Spring 源码阅读：04. 依赖注入 (DI) 的实现"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, DI, Circular Dependency]
weight: 4
---

依赖注入 (Dependency Injection) 是 IoC 的具体实现。Spring 如何解决最棘手的“循环依赖”问题？

## 1. getBean 的递归逻辑

当 Spring 创建 Bean A 时，发现 A 依赖 B：
1.  `getBean(A)` -> `createBean(A)`。
2.  `populateBean(A)` -> 发现依赖 B。
3.  `getBean(B)` -> `createBean(B)`。
4.  `populateBean(B)` -> 发现依赖 A。
5.  `getBean(A)` -> **?**

如果直接递归，会死循环。Spring 引入了“三级缓存”。

## 2. 三级缓存 (`DefaultSingletonBeanRegistry`)

```java
// 1. 一级缓存：成品 Bean (已完成初始化)
Map<String, Object> singletonObjects = new ConcurrentHashMap<>(256);

// 2. 二级缓存：半成品 Bean (已实例化，未初始化，未填充属性)
Map<String, Object> earlySingletonObjects = new HashMap<>(16);

// 3. 三级缓存：ObjectFactory (用于生成半成品 Bean，可能包含 AOP 逻辑)
Map<String, ObjectFactory<?>> singletonFactories = new HashMap<>(16);
```

## 3. 解决流程

回到 A 和 B 的例子：
1.  `createBean(A)`: 实例化 A。将 `() -> getEarlyBeanReference(A)` 放入**三级缓存**。
2.  `populateBean(A)`: 需要 B。调用 `getBean(B)`。
3.  `createBean(B)`: 实例化 B。将 B 的工厂放入三级缓存。
4.  `populateBean(B)`: 需要 A。调用 `getBean(A)`。
5.  `getBean(A)`:
    *   一级缓存？没有。
    *   二级缓存？没有。
    *   三级缓存？**有！** 调用 Factory 获取 A 的半成品引用（如果有 AOP，这里会提前创建代理）。
    *   将 A 放入**二级缓存**，移除三级缓存。返回 A。
6.  `populateBean(B)`: 拿到 A 的引用，B 初始化完成。放入一级缓存。
7.  `populateBean(A)`: 拿到 B 的引用 (B 已经是成品)，A 初始化完成。放入一级缓存。

## 4. 为什么需要三级？二级不够吗？

如果只有二级缓存，可以解决普通对象的循环依赖。
但在 **AOP** 场景下，B 需要注入的是 A 的代理对象 ($Proxy)，而不是 A 的原始对象。
Spring 的原则是：Bean 在生命周期的最后一步 (`postProcessAfterInitialization`) 才创建代理。
为了解决循环依赖，必须提前创建代理。
**三级缓存 (`singletonFactories`) 的作用就是**：延迟决策。只有当真正发生循环依赖时，才通过 `ObjectFactory` 提前执行 AOP 代理创建逻辑；否则，按正常流程在最后创建。

---
**Next**: [Spring 源码阅读：05. AOP 代理机制](../05-aop-proxy/)
