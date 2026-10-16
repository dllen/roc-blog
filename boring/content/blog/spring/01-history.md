---
title: "Spring 源码阅读：01. 历史的回响：从 interface21 到 Spring"
date: 2026-01-14T10:00:00+08:00
description: "Spring 框架发展史与生态：从 2003 年 IoC 容器到 Spring Boot / Cloud / Native，模块演进与设计哲学。"
taxonomies:
  tags: [Spring, Source Code, History, Rod Johnson]
weight: 1
tldr: "1. 没有 EJB 的 J2EE 在 2002 年，Rod Johnson 发布了 《Expert One on One J2EE Development without EJB》 。"
keywords: ["Spring", "源码阅读", "01.", "历史的回响", "interface21", "Source Code", "History", "Rod Johnson"]
---
## 0. 本章定位

Spring 源码阅读：01. 历史的回响：从 interface21 到 Spring：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

## 1. 没有 EJB 的 J2EE

在 2002 年，Rod Johnson 发布了 **《Expert One-on-One J2EE Development without EJB》**。这本书猛烈抨击了当时的主流架构——EJB 2.x。
EJB 的问题在于：
*   **侵入性强**: 业务类必须继承 `EJBObject` 等特定接口。
*   **依赖容器**: 无法在容器外进行单元测试。
*   **开发效率低**: 部署描述符复杂，启动缓慢。

Rod 提出的解决方案是：**POJO (Plain Old Java Object)**。业务逻辑应该是纯净的 Java 对象，不依赖任何框架接口。

## 2. Interface21 框架

为了证明他的观点，Rod 在书中附带了一个示例框架，名为 `interface21`（包名 `com.interface21`）。这个框架包含了 Spring 的核心 DNA：
*   **BeanFactory**: 负责管理 Bean 的生命周期和依赖注入。
*   **ApplicationContext**: 扩展了 BeanFactory，增加了事件、国际化等支持。
*   **JdbcTemplate**: 简化 JDBC 操作。

后来，这个示例框架被重构并开源，命名为 **Spring**（寓意给 J2EE 的寒冬带来春天）。

## 3. 现代 Spring 架构

虽然经过了 20 年的演进，Spring 的核心模块结构依然清晰可见：

### 3.1 Core Container
*   `spring-core`: 基础工具类。
*   `spring-beans`: `BeanFactory` 及其相关实现。
*   `spring-context`: `ApplicationContext`，提供了企业级服务支持。
*   `spring-expression`: SpEL 表达式语言。

### 3.2 AOP
*   `spring-aop`: 基于代理的 AOP 实现。
*   `spring-aspects`: 集成 AspectJ。

### 3.3 Data Access
*   `spring-jdbc`: JdbcTemplate。
*   `spring-tx`: 事务管理抽象。
*   `spring-orm`: 集成 Hibernate, JPA。

---
**Next**: [Spring 源码阅读：02. IoC 容器启动流程](../02-ioc-startup/)
