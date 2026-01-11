---
title: "ZooKeeper 源码阅读：01. 环境搭建与源码编译"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, Build]
weight: 1
---

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

---
**Next**: [ZooKeeper 源码阅读：02. 核心架构与模块概览](../02-architecture/)
