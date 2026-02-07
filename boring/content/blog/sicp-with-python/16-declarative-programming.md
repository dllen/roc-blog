---
title: "16. 声明式编程与 SQL：告诉计算机“要什么”"
date: 2026-02-07T19:00:00+08:00
draft: false
tags: ["SQL", "Declarative Programming", "Python", "Database", "SICP"]
categories: ["SICP-Python"]
description: "SICP 4.3 核心内容：从命令式转向声明式。学习 SQL 的核心语法（Select, Where, Join），并用 Python 实现一个简单的 SQL 解释器。"
---

# 第十六章：声明式编程与 SQL——告诉计算机“要什么”

> "Declarative languages abstract away procedural details, instead focusing on the form of the result." — SICP

在之前的章节中，无论是 Python 还是 Scheme，我们都在做**命令式编程 (Imperative Programming)**：我们详细地告诉计算机每一步该怎么做（定义变量、循环、判断、赋值）。

今天，我们进入**声明式编程 (Declarative Programming)** 的世界。在这里，我们只描述**我们想要什么结果**，而将“怎么做”的复杂细节交给解释器去处理。

最典型的例子就是 **SQL (Structured Query Language)**。

## 4.3.1 声明式思维 (Declarative Thinking)

想象你要在包含百万条记录的数据库中找到“所有住在 Berkeley 的人”。

*   **命令式做法**：
    1.  打开文件。
    2.  创建一个空列表 `results`。
    3.  循环读取每一行。
    4.  如果该行的 `city` 字段等于 "Berkeley"，将其加入 `results`。
    5.  返回 `results`。

*   **声明式做法 (SQL)**：
    ```sql
    SELECT * FROM cities WHERE name = 'Berkeley';
    ```

你只需要描述数据的特征（`WHERE name = 'Berkeley'`），数据库引擎会自动决定是全表扫描、使用索引还是其他优化算法。

## 4.3.2 SQL 核心语法

我们使用 SQLite 的方言来探索 SQL 的核心能力。

### 1. 表 (Tables) 与投影 (Projection)

表是记录的集合。`SELECT` 语句用于从表中选取数据，这被称为**投影**。

```sql
-- 创建表
create table cities as
  select 38 as latitude, 122 as longitude, "Berkeley" as name union
  select 42,             71,               "Cambridge"        union
  select 45,             93,               "Minneapolis";

-- 查询：计算距离并重命名列
select name, 60*abs(latitude-38) as distance from cities;
```

### 2. 过滤 (Filtering)

`WHERE` 子句用于筛选满足条件的行。

```sql
select name from cities where latitude > 43;
```

### 3. 连接 (Joins)

这是 SQL 最强大的功能。`JOIN` 允许我们将多个表的数据结合起来。

假设我们有另一个表 `temps` 记录气温：

```sql
create table temps as
  select "Berkeley" as city, 68 as temp union
  select "Chicago"         , 59         union
  select "Minneapolis"     , 55;
```

我们可以通过 `WHERE` 子句连接这两个表：

```sql
-- 查找城市的纬度和气温
select name, latitude, temp 
from cities, temps 
where name = city;
```

这背后发生了什么？从逻辑上讲，SQL 执行了**笛卡尔积**（所有可能的组合），然后通过 `where name = city` 过滤出有意义的匹配。

## 4.3.3 用 Python 实现 SQL 解释器

为了彻底理解声明式编程，我们可以在 Python 中实现一个微型的 SQL 解释器。

### 数据结构

我们用 `namedtuple` 来表示行，用列表来表示表。

```python
from collections import namedtuple

# 定义行结构
CitiesRow = namedtuple("Row", ["latitude", "longitude", "name"])

# 数据
cities = [
    CitiesRow(38, 122, "Berkeley"),
    CitiesRow(42, 71, "Cambridge"),
    CitiesRow(43, 93, "Minneapolis")
]
```

### Select 类的实现

一个 `Select` 语句可以看作是一个对象，它包含 `columns`, `tables`, `condition` 等属性。

```python
class Select:
    """SQL Select 语句的抽象"""
    def __init__(self, columns, tables, condition):
        self.columns = columns
        self.tables = tables
        self.condition = condition

    def execute(self, env):
        # 1. Join: 生成所有表的笛卡尔积
        from_rows = join(self.tables, env)
        
        # 2. Filter: 应用 where 条件
        filtered_rows = filter(self.filter_func, from_rows)
        
        # 3. Project: 计算 select 中的表达式
        return map(self.project_func, filtered_rows)
```

这个微型解释器揭示了 SQL 的本质：它是一系列集合操作（积、选择、投影）的组合。

## 总结

声明式编程将程序员从控制流的细节中解放出来。在 SQL 中：

*   **表** 是数据源。
*   **Select** 是投影变换。
*   **Where** 是过滤器。
*   **Join** 是数据关联的桥梁。

下一章，我们将探索另一种声明式编程范式：**逻辑编程 (Logic Programming)**，在那里我们将通过定义事实和规则来进行推理。

---
*参考链接：*
*   [Composing Programs 4.3 Declarative Programming](https://www.composingprograms.com/pages/43-declarative-programming.html)
