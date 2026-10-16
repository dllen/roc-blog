---
title: "Kafka 源码阅读：01. 环境搭建与源码编译"
date: 2026-01-15T10:00:00+08:00
description: "Kafka 3.x 源码编译环境搭建（JDK 11+ / Gradle / Scala）全流程：源码获取、IDEA 导入、可运行 Demo 调试配置。"
taxonomies:
  tags: [Kafka, Source Code, Build, Gradle]
weight: 1
tldr: "1. 准备工作 JDK : JDK 8 或 11 (Kafka 3."
keywords: ["Kafka", "源码阅读", "01.", "环境搭建与源码编译", "Source Code", "Build", "Gradle"]
---
## 0. 本章定位

Kafka 源码阅读：01. 环境搭建与源码编译：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

建议在源码根目录运行 gradle task 构建，并通过 IDEA 的 Run Configuration 启动 Kafka 进程，结合日志观察启动流程。Kafka 3.x 默认 KRaft 模式，无需依赖 ZooKeeper，从源码 build 到单 broker 启动只需几分钟。

## 1. 准备工作
*   **JDK**: JDK 8 或 11 (Kafka 3.x 推荐 JDK 11+)
*   **Scala**: 虽然 Gradle 会自动下载，但建议了解基础语法。
*   **Gradle**: Kafka 使用 Gradle 构建。

## 2. 获取源码
```bash
git clone https://github.com/apache/kafka.git
cd kafka
git checkout 3.5.1 # 切换到稳定 tag
```

## 3. 编译
Kafka 源码根目录下有 `gradlew` 脚本。

```bash
# 构建并运行测试 (时间较长，建议跳过测试)
./gradlew clean build -x test

# 编译成 IDEA 项目
./gradlew idea
```

## 4. 导入 IDEA
1.  Open Project -> 选择 `build.gradle`。
2.  等待 Gradle Sync。
3.  **配置 Run Configuration**:
    *   **Main Class**: `kafka.Kafka`
    *   **Program Arguments**: `config/server.properties`
    *   **Working Directory**: 项目根目录

## 5. 模块结构
*   `clients`: Java 客户端 (Producer, Consumer, AdminClient)。
*   `core`: Broker 核心代码 (Scala)。
*   `raft`: KRaft 共识协议实现。
*   `streams`: Kafka Streams 流处理库。
*   `connect`: Kafka Connect 框架。

---
**Next**: [Kafka 源码阅读：02. 架构概览](../02-architecture-overview/)
