---
title: "Flink 源码阅读：21. PyFlink 原理"
date: 2026-01-13T07:00:00+08:00
description: "Java 与 Python 进程间的通信模型。Apache Beam Portability Framework 的应用。"
taxonomies:
  tags: [Flink, Source Code, PyFlink, Python, Beam]
weight: 21
tldr: "Java 与 Python 进程间的通信模型。Apache Beam Portability Framework 的应用。"
keywords: ["Flink", "源码阅读", "21.", "PyFlink", "原理", "Source Code", "Python", "Beam"]
---

PyFlink 允许用户用 Python 编写 Flink 任务。








## 实战建议

PyFlink 性能调优三板斧：启用 Arrow + Pipeline 模式、关闭 pickling 日志、避免 Python UDF 内频繁 IO。

## 0. 本章定位

PyFlink 用 Apache Beam Portability 框架解决 JVM ↔ Python 跨进程通信：Java Operator（生产） + Python Worker（计算）+ gRPC + 共享内存 Arrow 传输。本章讲架构、序列化（pickle / Arrow）、性能调优（Arrow 批量、Pipeline 模式、BeamFn 调优）。PyFlink 适合 ETL / ML 推理场景，但跨语言通信是天然瓶颈——单条 Record 传输可达 ms 级，务必批处理。生产中遇到 PyFlink 慢，先检查是否启用了 Arrow + Pipeline 模式。

## 1. 架构痛点
Flink 运行在 JVM 上，而 Python 运行在 PVM 上。如何通信？

## 2. 进程间通信 (IPC)
PyFlink 基于 **Apache Beam** 的 Portability Framework。
*   **Java 端**: 启动一个 `PythonFunctionOperator`。它负责数据序列化。
*   **Python 端**: 启动一个独立的 Python 进程（SDK Harness）。
*   **通信**: 两者通过 GRPC (Control Plane) 和 DataStream API (Data Plane) 通信。

## 3. 性能优化 (Vectorized)
为了减少 IPC 开销，PyFlink 引入了向量化执行。
利用 Apache Arrow 格式，在 Java 和 Python 之间批量传输数据。
Python 端使用 Pandas/NumPy 进行高效的列式计算。
这使得 PyFlink 在处理数值计算时，性能甚至能接近原生 Java。
