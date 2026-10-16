---
title: "ZooKeeper 源码阅读：01. 环境搭建与源码编译"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper 3.5+ 全面转向 Maven 构建，本文从 JDK / Maven 准备、源码获取、IDEA 导入到单机配置文件 zoo.cfg 逐步搭建可调试环境。"
taxonomies:
  tags: [ZooKeeper, Source Code, Build]
weight: 1
tldr: "ZooKeeper 3.5+ 全面转向 Maven 构建，本文从 JDK / Maven 准备、源码获取、IDEA 导入到单机配置文件 zoo.cfg 逐步搭建可调试环境。"
keywords: ["ZooKeeper", "源码阅读", "01.", "环境搭建与源码编译", "Source Code", "Build"]
---

## 0. 前置知识与阅读路径

阅读 ZooKeeper 源码前需要掌握：Java NIO 多线程编程、ZAB 协议基本概念（Leader 选举、原子广播）、以及 Maven 多模块项目的构建机制。本系列源码阅读从环境搭建开始，逐步覆盖架构、数据树、持久化、网络通信、Session 与 Watcher、ZAB 协议等核心模块；建议按章节顺序阅读，每章之间都有依赖关系。如果你只是想用 ZK 而不是读源码，可以跳过本系列，直接看官方文档与 `zookeeper-server` 的 `zoo.cfg` 示例即可。

ZooKeeper 3.5+ 全面转向 Maven 构建，3.4 及更早版本仍使用 Ant。本章给出从环境准备到 IDEA 单机调试的完整步骤，建议在主分支 `branch-3.7` 或最新稳定分支上操作；切换到带数字后缀的分支（如 `branch-3.9`）可对照不同版本差异。搭建过程中最容易卡住的点不在编译，而在 IDEA Run Configuration 的 Working Directory 与 zoo.cfg 路径配置——本文会逐项列出。

## 1. 准备工作
*   **JDK**: JDK 8 或 11
*   **Maven**: 3.6+
*   **Ant**: ZK 旧版本使用 Ant 构建，新版本 (3.5+) 全面转向 Maven。

## 2. 获取源码
```bash
git clone https://github.com/apache/zookeeper.git
cd zookeeper
git checkout branch-3.7
```

## 3. 编译
```bash
mvn clean install -DskipTests
```
如果遇到 Checkstyle 错误：
```bash
mvn clean install -DskipTests -Dcheckstyle.skip=true
```

## 4. IDEA 导入
1.  Open Project -> 选择 `pom.xml`。
2.  等待 Maven 索引。
3.  **配置 Run Configuration**:
    *   **Main Class**: `org.apache.zookeeper.server.quorum.QuorumPeerMain`
    *   **Program Arguments**: `/path/to/zoo.cfg` (你需要先创建一个配置文件)
    *   **Working Directory**: 项目根目录

## 5. 单机配置文件示例 (`zoo.cfg`)
```properties
tickTime=2000
dataDir=/tmp/zookeeper
clientPort=2181
```

## 6. 常见问题排查

- **`mvn install` 卡在 checkstyle**：在 3.7+ 源码上偶发；用 `mvn install -Dcheckstyle.skip=true` 绕过。
- **IDEA 启动 `QuorumPeerMain` 报 `Cannot find or load main class`**：通常是 Working Directory 没设为项目根目录，zoo.cfg 用相对路径加载失败。
- **客户端连不上 2181 端口**：检查 `clientPort` 是否被注释；Mac 上注意 `127.0.0.1` 与 `0.0.0.0` 监听的差异。

---
**Next**: [ZooKeeper 源码阅读：02. 核心架构与模块概览](../02-architecture/)
