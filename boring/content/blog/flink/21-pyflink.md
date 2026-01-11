---
title: "Flink 源码阅读：21. PyFlink 原理"
date: 2026-01-13T07:00:00+08:00
description: "Java 与 Python 进程间的通信模型。Apache Beam Portability Framework 的应用。"
tags: [Flink, Source Code, PyFlink, Python, Beam]
weight: 21
---

PyFlink 允许用户用 Python 编写 Flink 任务。

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
