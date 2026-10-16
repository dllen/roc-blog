---
title: "Flink 源码阅读：19. Flink SQL 编译流程"
date: 2026-01-13T05:00:00+08:00
description: "从 SQL 语句到 Physical Plan。Calcite 在 Flink SQL 中的应用。"
taxonomies:
  tags: [Flink, Source Code, SQL, Calcite, Planner]
weight: 19
tldr: "从 SQL 语句到 Physical Plan。Calcite 在 Flink SQL 中的应用。"
keywords: ["Flink", "源码阅读", "19.", "SQL", "编译流程", "Source Code", "Calcite", "Planner"]
---

Flink SQL 引擎基于 Apache Calcite。








## 实战建议

用 EXPLAIN 看 RelNode 树是定位 SQL 性能问题的高效手段：Calcite 优化前后的差异一目了然。

## 0. 本章定位

Flink SQL 基于 Apache Calcite：Parser（SQL → SqlNode）→ Validator（结合 Catalog 校验）→ Logical Plan（RelNode / 关系代数）→ 优化（RBO/CBO + 自定义 FlinkRule）→ Physical Plan（DataStreamRel / DataSetRel）。本章讲前两步，理解后续 CodeGen 的基础。生产中 SQL 报错（如 Column not found）多在 Validator 阶段抛；性能差多在 RBO/CBO 优化不足，需看 RelNode 树调优。建议结合 Table Runtime 章一起读。

## 1. Parser (解析)
使用 Calcite Parser 将 SQL 字符串解析为 AST (抽象语法树)，即 `SqlNode`。

## 2. Validator (验证)
使用 Calcite Validator 结合 `Catalog` (元数据) 验证 SQL 的合法性（表是否存在、字段类型是否匹配）。
输出 `RelNode` (Relational Node) 树，这是逻辑执行计划。

## 3. Optimizer (优化)
使用 Calcite Volcano Planner 或 Hep Planner 进行优化。
*   **Rule-based Optimization (RBO)**: 谓词下推、列裁剪。
*   **Cost-based Optimization (CBO)**: Join Reorder。
最终生成 Flink 的物理执行计划 (`FlinkPhysicalRel`)。

## 4. Translation (翻译)
最后，将 Physical Plan 翻译为 `Transformation` 树（DataStream API 的底层对象）。
这样，SQL 任务就变成了普通的 DataStream 任务。
