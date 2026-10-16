---
title: "Spring 源码阅读：09. JdbcTemplate 设计模式"
date: 2026-01-14T10:00:00+08:00
description: "Spring JdbcTemplate 源码解析：JdbcOperations 抽象、StatementCreator / RowMapper、事务同步与连接管理。"
taxonomies:
  tags: [Spring, Source Code, JdbcTemplate, Template Pattern]
weight: 9
tldr: "是模板方法模式的教科书级应用，也是 Spring 最早提供的功能之一。"
keywords: ["Spring", "源码阅读", "09.", "JdbcTemplate", "设计模式", "Source Code", "Template Pattern"]
---
## 0. 本章定位

Spring 源码阅读：09. JdbcTemplate 设计模式：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

`JdbcTemplate` 是模板方法模式的教科书级应用，也是 Spring 最早提供的功能之一。

JdbcTemplate 通过 JdbcOperations 接口封装 StatementCreator / ResultSetExtractor 等步骤，理解其模板方法模式对扩展很重要。

JdbcTemplate 通过 DataSourceUtils 统一管理连接与事务同步，与 TransactionManager 协作实现事务边界。

## 1. 痛点：样板代码

在原生 JDBC 中，执行一个查询需要写一大堆代码：
1.  获取连接。
2.  创建 Statement。
3.  执行 SQL。
4.  处理 ResultSet。
5.  处理异常。
6.  **关闭 ResultSet, Statement, Connection** (finally 块中)。

其中，只有步骤 3 和 4 是业务相关的，其他都是样板代码。

## 2. 解决方案：Template-Callback

`JdbcTemplate` 将样板代码封装在 `execute` 方法中，而将变化的部分（SQL 执行、结果集处理）通过回调接口暴露出来。

### 2.1 核心方法 `execute(StatementCallback)`

```java
public <T> T execute(StatementCallback<T> action) {
    Connection con = DataSourceUtils.getConnection(obtainDataSource());
    Statement stmt = null;
    try {
        stmt = con.createStatement();
        // 回调用户逻辑
        return action.doInStatement(stmt);
    } catch (SQLException ex) {
        // 异常转换
        throw translateException("StatementCallback", getSql(action), ex);
    } finally {
        // 资源释放
        JdbcUtils.closeStatement(stmt);
        DataSourceUtils.releaseConnection(con, obtainDataSource());
    }
}
```

### 2.2 常用回调

*   `RowMapper`: 将 ResultSet 的每一行映射为一个 Java 对象。
*   `PreparedStatementSetter`: 设置 SQL 参数。

---
**Next**: [Spring 源码阅读：10. 声明式事务管理](../10-transaction/)
