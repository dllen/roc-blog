---
title: "Flink 源码阅读：20. Table Runtime (代码生成)"
date: 2026-01-13T06:00:00+08:00
description: "Code Generation 技术详解。为什么 Flink SQL 比手写 Java 代码还快？"
tags: [Flink, Source Code, SQL, Codegen, Janino]
weight: 20
---

Flink Table/SQL 的 Runtime 极度依赖 **Code Generation (代码生成)**。

## 1. 为什么需要 Codegen？
传统的数据库引擎（如 Hive）通常使用解释执行模型。
`AddOperator.process(row)` -> 读取 a, 读取 b -> 相加。
这涉及大量的虚函数调用、装箱拆箱，CPU 分支预测失效。

## 2. Janino 编译器
Flink 使用 Janino 编译器，在运行时动态生成 Java 类。
例如 `SELECT a + b FROM t`。
Flink 会生成一个 `GeneratedMapFunction` 类，里面直接写死 `result = row.getInt(0) + row.getInt(1)`。
这等同于手写了最高效的 Java 代码。

## 3. Whole-Stage Codegen
不仅是表达式，Flink 还会尝试将多个算子（如 Filter + Map + Projection）的代码合并到一个 Function 中。
这消除了函数调用开销，数据完全在 CPU 寄存器/L1 缓存中流转。
