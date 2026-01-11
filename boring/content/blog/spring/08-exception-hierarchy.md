---
title: "Spring 源码阅读：08. 统一异常体系"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, Exception, DataAccess]
weight: 8
---

在《J2EE without EJB》中，Rod 痛斥了 `SQLException`。这是一个 Checked Exception，强迫开发者捕获它，但开发者往往无能为力（比如数据库宕机了，你能catch并恢复吗？）。

## 1. Runtime Exception 策略

Spring 提倡使用 Unchecked Exception (RuntimeException)。
Spring 定义了一个庞大的异常体系 `DataAccessException`，它是 `RuntimeException`。

## 2. 异常转换器 (`SQLExceptionTranslator`)

当使用 `JdbcTemplate` 执行 SQL 时，如果底层 JDBC 驱动抛出了 `SQLException`，Spring 会捕获它，并利用 `SQLExceptionTranslator` 将其转换为对应的 `DataAccessException` 子类。

例如：
*   死锁 -> `DeadlockLoserDataAccessException`
*   主键冲突 -> `DuplicateKeyException`
*   SQL 语法错误 -> `BadSqlGrammarException`

这样，业务代码只需要关心特定的业务错误，而不需要处理底层的 JDBC 细节。

---
**Next**: [Spring 源码阅读：09. JdbcTemplate 设计模式](../09-jdbctemplate/)
