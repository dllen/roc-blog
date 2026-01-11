---
title: "Kafka 源码阅读：01. 环境搭建与源码编译"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Build, Gradle]
weight: 1
---

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
