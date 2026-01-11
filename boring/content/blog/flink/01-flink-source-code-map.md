---
title: "Flink 源码阅读：01. 源码编译与环境搭建"
date: 2026-01-12T11:00:00+08:00
description: "工欲善其事，必先利其器。如何编译 Flink 源码，并在 IDEA 中运行 WordCount 示例进行 Debug。"
tags: [Flink, Source Code, Build, Maven, IDEA]
weight: 1
---

阅读源码的第一步，是把源码跑起来。只有能 Debug 的源码，才是活的源码。

## 1. 源码下载
建议选择一个稳定的 Release 版本，例如 1.17.x 或 1.18.x。
```bash
git clone https://github.com/apache/flink.git
cd flink
git checkout release-1.17
```

## 2. 编译源码 (Maven)
Flink 依赖 Maven 构建。由于项目庞大，全量编译非常耗时。
为了加快速度，可以跳过测试和 QA 检查：

```bash
mvn clean install -DskipTests -Dfast
```
*   `-DskipTests`: 跳过单元测试执行。
*   `-Dfast`: Flink 自定义的 Profile，跳过 Checkstyle, Spotless, Enforcer 等代码质量检查。

## 3. 核心模块概览
编译完成后，我们在 IDEA 中打开。主要关注以下模块：

*   **flink-core**: 核心接口、数据类型、配置类。
*   **flink-runtime**: 运行时核心，包括 RPC、调度、内存管理、Checkpoint 等（最硬核的部分）。
*   **flink-streaming-java**: DataStream API 的实现，包括算子、StreamGraph 生成。
*   **flink-clients**: 客户端提交作业的逻辑。
*   **flink-table**: SQL 和 Table API 相关。
*   **flink-connectors**: 各种连接器（Kafka, FileSystem 等）。

## 4. IDEA 运行 WordCount
为了调试，我们需要在本地启动一个 MiniCluster。
找到 `flink-examples/flink-examples-streaming` 模块下的 `SocketWindowWordCount.java`。

直接运行 `main` 方法通常会报错，因为 Flink 也就是 Provided 依赖在 IDE 中默认不加载。
**解决方法**：
在 IDEA 的 Run Configuration 中，勾选 **"Include dependencies with 'Provided' scope"**。

或者，自己创建一个模块，引入 `flink-clients` 和 `flink-streaming-java` 依赖，编写一个简单的 `StreamExecutionEnvironment.createLocalEnvironment()` 示例。

```java
public class MyDebug {
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.createLocalEnvironment();
        env.fromElements("hello", "world", "flink")
           .map(String::toUpperCase)
           .print();
        env.execute();
    }
}
```
在该代码中打断点，即可追踪 `env.execute()` 背后的源码逻辑。
