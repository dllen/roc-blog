---
title: "HBase 源码阅读：01. 源码编译与环境搭建"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Build, Environment]
weight: 1
---

阅读源码的第一步是能够自己编译并运行代码。本文介绍如何编译 HBase 2.x 源码并在 IntelliJ IDEA 中搭建调试环境。

## 1. 准备工作

### 1.1 环境要求
*   **JDK**: JDK 8 (HBase 2.x 主要基于 JDK 8，部分新版本支持 JDK 11)
*   **Maven**: 3.6+
*   **Git**: 最新版本

### 1.2 获取源码
推荐从 GitHub 克隆官方仓库，也可以下载 Release 包。

```bash
git clone https://github.com/apache/hbase.git
cd hbase
# 切换到稳定分支，例如 branch-2.5
git checkout branch-2.5
```

## 2. 编译源码

HBase 项目比较庞大，包含很多模块。

### 2.1 完整编译
跳过测试以加快速度（全量测试可能需要数小时）。

```bash
mvn clean package -DskipTests
```

如果遇到 Checkstyle 或 License 检查报错，可以添加参数忽略：

```bash
mvn clean package -DskipTests -Dcheckstyle.skip=true -Drat.skip=true
```

### 2.2 常见编译问题
*   **Protobuf 版本**: HBase 严重依赖 Protobuf，确保本地安装了正确版本的 `protoc`，或者让 Maven 自动下载（通常 Maven 会处理好）。
*   **网络问题**: 依赖包下载失败，建议配置阿里云 Maven 镜像。

## 3. IDEA 环境搭建

### 3.1 导入项目
1.  打开 IntelliJ IDEA -> File -> Open -> 选择 `hbase/pom.xml`。
2.  选择 "Open as Project"。
3.  等待 Maven 索引依赖（可能需要较长时间）。

### 3.2 配置 Code Style
为了方便贡献代码，建议导入 HBase 的代码风格配置。
*   `dev-support/hbase_eclipse_formatter.xml`

### 3.3 运行单元测试
随便找一个简单的测试类，例如 `TestCellUtil`，右键 Run，确保环境正常。

## 4. 本地调试 (Standalone Mode)

为了调试 Master 和 RegionServer，我们可以直接在 IDEA 中启动它们。HBase 支持 Standalone 模式，不需要依赖外部 HDFS 和 ZK。

### 4.1 启动 Master
找到 `org.apache.hadoop.hbase.master.HMaster` 类。

**VM Options**:
```text
-Dlog4j.configuration=file:///path/to/hbase/conf/log4j.properties
-Dhbase.rootdir=file:///tmp/hbase-root
-Dhbase.cluster.distributed=false
```

### 4.2 验证
启动成功后，访问 Master UI: `http://localhost:16010`。

---
**Next**: [HBase 源码阅读：02. 项目结构概览](../02-project-structure/)
