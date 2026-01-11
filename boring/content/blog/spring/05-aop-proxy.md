---
title: "Spring 源码阅读：05. AOP 代理机制"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, AOP, Proxy, CGLIB]
weight: 5
---

Rod Johnson 在《J2EE without EJB》中提出，业务逻辑应该纯粹，不应该包含日志、事务、安全等代码。AOP (Aspect Oriented Programming) 是实现这一目标的关键。

## 1. 代理工厂 (`ProxyFactory`)

Spring AOP 的核心是代理。Spring 不会修改字节码（除非使用 AspectJ LTW），而是通过运行期生成代理对象来拦截方法调用。
`ProxyFactory` 是生成代理的工厂，它会根据情况选择具体的实现。

## 2. JDK 动态代理 vs CGLIB

### 2.1 JDK Dynamic Proxy
*   **条件**: 目标对象实现了至少一个接口。
*   **原理**: 利用 `java.lang.reflect.Proxy` 生成一个实现了相同接口的类。
*   **优点**: JDK 自带，无需第三方库。
*   **缺点**: 只能代理接口方法。

### 2.2 CGLIB (Code Generation Library)
*   **条件**: 目标对象没有实现接口，或者是强制开启 (`proxyTargetClass=true`)。
*   **原理**: 利用 ASM 字节码库，生成目标类的**子类**，并重写父类方法。
*   **优点**: 可以代理具体的类。
*   **缺点**: 不能代理 `final` 类或 `final` 方法（因为无法继承/重写）。

## 3. Spring Boot 的默认选择

在 Spring Boot 2.x 中，默认策略变成了 **CGLIB** (`spring.aop.proxy-target-class=true`)。
为什么？因为 CGLIB 更健壮，避免了因为没有接口而导致的注入失败（Cast Exception）。

## 4. `AopProxy` 接口

```java
public interface AopProxy {
    Object getProxy();
    Object getProxy(ClassLoader classLoader);
}
```
两个实现类：`JdkDynamicAopProxy` 和 `CglibAopProxy`。

---
**Next**: [Spring 源码阅读：06. Pointcut 与 Advisor](../06-pointcut-advisor/)
