---
title: "Spring 源码阅读：08. 统一异常体系"
date: 2026-01-14T10:00:00+08:00
description: "Spring 异常体系源码解析：DataAccessException 子树、Unchecked 异常设计哲学、与 JDK 异常的转换机制。"
taxonomies:
  tags: [Spring, Source Code, Exception, DataAccess]
weight: 8
tldr: "在《J2EE without EJB》中，Rod 痛斥了 。这是一个 Checked Exception，强迫开发者捕获它，但开发者往往无能为力（比如数据库宕机了，你能catch并恢复吗？"
keywords: ["Spring", "源码阅读", "08.", "统一异常体系", "Source Code", "Exception", "DataAccess"]
---
## 0. 本章定位

Spring 源码阅读：08. 统一异常体系：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

在《J2EE without EJB》中，Rod 痛斥了 `SQLException`。这是一个 Checked Exception，强迫开发者捕获它，但开发者往往无能为力（比如数据库宕机了，你能catch并恢复吗？）。

DataAccessException 子树将所有 SQLException 翻译为 unchecked，是 Spring 抽象数据访问的设计哲学体现。

翻译机制通过 SQLExceptionTranslator 实现，可自定义 translator 把厂商错误码映射到 Spring 的标准异常类型。

Spring 的 unchecked 异常设计哲学让业务代码不必强制 try-catch，提升可读性。

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
