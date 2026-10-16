---
title: "Flink 源码阅读：20. Table Runtime (代码生成)"
date: 2026-01-13T06:00:00+08:00
description: "Code Generation 技术详解。为什么 Flink SQL 比手写 Java 代码还快？"
taxonomies:
  tags: [Flink, Source Code, SQL, Codegen, Janino]
weight: 20
tldr: "Code Generation 技术详解。为什么 Flink SQL 比手写 Java 代码还快？"
keywords: ["Flink", "源码阅读", "20.", "Table", "Runtime", "代码生成", "Source Code", "SQL"]
---

Flink Table/SQL 的 Runtime 极度依赖 **Code Generation (代码生成)**。








## 实战建议

Codegen 质量直接影响 SQL 作业性能：聚合/Join 的数据分布倾斜会绕过 Codegen 优化，需重写 SQL。

调试 Codegen 生成的代码时，可在 table.exec.resource.default-parallelism 调高并行度对比性能差异。

## 0. 本章定位

Flink Table/SQL Runtime 依赖 Code Generation 突破解释执行瓶颈：Calcite 优化后的 RelNode 经 Janino 生成 Java 字节码，避免虚函数调用和装箱拆箱。本章讲 Codegen 流程（CodeGenerator + 表达式翻译）、常用优化（融合算子 Fusion、投影下推 ProjectionPushDown、谓词下推 PredicatePushDown）、以及如何调试生成的代码（table.exec.resource.default-parallelism）。生产中 SQL 性能差，多半是 Codegen 没充分融合，需要重写 SQL 让算子更规整。建议结合 SQL 编译流程章一起读。

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
