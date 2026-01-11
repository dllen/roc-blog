---
title: "Spring 源码阅读：09. JdbcTemplate 设计模式"
date: 2026-01-14T10:00:00+08:00
tags: [Spring, Source Code, JdbcTemplate, Template Pattern]
weight: 9
---

`JdbcTemplate` 是模板方法模式的教科书级应用，也是 Spring 最早提供的功能之一。

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
