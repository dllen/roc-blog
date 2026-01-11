---
title: "Spring 源码阅读：10. 声明式事务管理"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, Transaction, AOP]
weight: 10
---

声明式事务 (`@Transactional`) 是 Spring 最受欢迎的特性之一，它让开发者从繁琐的 commit/rollback 中解脱出来。

## 1. 基础设施：`PlatformTransactionManager`

Spring 抽象了事务管理器接口，适配不同的持久层框架。
*   `DataSourceTransactionManager`: 用于 JDBC, MyBatis。
*   `HibernateTransactionManager`: 用于 Hibernate。
*   `JtaTransactionManager`: 用于分布式事务 (JTA)。

## 2. AOP 增强 (`TransactionInterceptor`)

`@Transactional` 的实现原理是 AOP。
Spring 会为带注解的 Bean 创建代理，并添加 `TransactionInterceptor`。

### 2.1 拦截逻辑 (`invoke`)

1.  **获取事务属性**: 解析 `@Transactional` 的参数（隔离级别、传播行为）。
2.  **获取事务管理器**: `determineTransactionManager`。
3.  **开启事务**: `createTransactionIfNecessary`。
    *   根据传播行为（Propagation），决定是开启新事务，还是加入现有事务。
4.  **执行目标方法**: `invocation.proceedWithInvocation()`。
5.  **异常处理**:
    *   如果捕获到异常，且该异常在 `rollbackFor` 范围内 -> **回滚 (Rollback)**。
    *   否则 -> **提交 (Commit)**。
6.  **提交事务**: `commitTransactionAfterReturning`。

## 3. 事务同步管理器 (`TransactionSynchronizationManager`)

如何在同一个线程的不同方法间共享 Connection？
Spring 使用 `ThreadLocal` 存储当前线程的 Connection 和 Transaction 状态。
`DataSourceUtils.getConnection()` 会优先从 ThreadLocal 获取，从而保证在同一个事务中使用同一个数据库连接。

---
**Next**: [Spring 源码阅读：11. DispatcherServlet 流程](../11-dispatcher-servlet/)
