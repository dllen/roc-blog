---
title: "HDFS 源码阅读：01. 源码编译与环境搭建"
date: 2026-01-12T14:00:00+08:00
description: "HDFS 源码阅读第一步：源码下载、Maven 编译指南、IDEA 项目导入及远程调试环境配置。"
tags: [Hadoop, HDFS, Source Code, Build]
weight: 1
---

在开始深入代码之前，我们需要先把环境搭好。Hadoop 是一个庞大的 Java 项目，构建过程可能会遇到各种环境依赖问题。

## 1. 源码下载

建议阅读 **Hadoop 3.3.x** 版本的代码，这是目前生产环境的主流版本。

```bash
git clone https://github.com/apache/hadoop.git
cd hadoop
git checkout rel/release-3.3.6
```

## 2. 项目结构概览

Hadoop 采用 Maven 多模块构建。对于 HDFS 阅读，我们主要关注 `hadoop-hdfs-project` 目录。

核心模块如下：

*   **hadoop-common-project/hadoop-common**: 基础库，包括 RPC 框架、配置系统、IO 工具类等。
*   **hadoop-hdfs-project/hadoop-hdfs**: HDFS 的核心实现（NameNode, DataNode 等）。
*   **hadoop-hdfs-project/hadoop-hdfs-client**: HDFS 客户端实现，为了解耦从 core 中拆分出来。
*   **hadoop-mapreduce-project**: MapReduce 实现（本次暂不关注）。
*   **hadoop-yarn-project**: YARN 实现（本次暂不关注）。

## 3. 源码编译

Hadoop 依赖 Protocol Buffers (protobuf) 2.5.0 (部分模块可能需要更新版本) 和 CMake (用于编译 native 库)。

### 3.1 前置要求 (macOS)

```bash
brew install maven cmake protobuf autoconf automake libtool
```

*注意：Hadoop 3.3+ 可能需要 Protobuf 3.7.1+。请参考源码根目录下的 `BUILDING.txt`。*

### 3.2 编译命令

如果我们只是为了阅读源码和在 IDEA 中跳转，**不需要编译 Native 库**，也不需要打包 tarball。

只需生成 Protobuf 对应的 Java 代码即可：

```bash
mvn clean install -DskipTests -Dmaven.javadoc.skip=true -Pdist -Dtar
```

如果为了节省时间，可以只编译 hdfs 模块：

```bash
cd hadoop-hdfs-project
mvn clean install -DskipTests -Dmaven.javadoc.skip=true
```

## 4. 导入 IntelliJ IDEA

1.  打开 IDEA，选择 `Open`，选中 `hadoop` 根目录下的 `pom.xml`。
2.  等待 Maven 依赖下载完成。
3.  **关键步骤**：确保生成的源码目录被识别。
    *   Hadoop 使用 Protobuf 生成了很多代码，通常位于 `target/generated-sources/java` 下。
    *   如果 IDEA 报红找不到类（如 `ClientNamenodeProtocolProtos`），需手动将 `target/generated-sources` 标记为 `Generated Sources Root`。

## 5. 调试环境配置

最简单的调试方法是利用 Hadoop 的 `MiniDFSCluster`。这是一个在单进程中启动 NameNode and DataNodes 的测试工具，非常适合断点调试。

创建一个简单的 JUnit 测试用例：

```java
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.hdfs.MiniDFSCluster;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;

public class HdfsDebugDemo {

    private MiniDFSCluster cluster;
    private FileSystem fs;
    private Configuration conf;

    @Before
    public void setUp() throws IOException {
        conf = new Configuration();
        // 启动一个 NameNode 和 3 个 DataNode
        cluster = new MiniDFSCluster.Builder(conf).numDataNodes(3).build();
        cluster.waitActive();
        fs = cluster.getFileSystem();
    }

    @Test
    public void testWriteAndRead() throws IOException {
        Path file = new Path("/test/hello.txt");
        
        // 在此处打断点，跟踪 create 流程
        fs.create(file).close();
        
        // 在此处打断点，跟踪 open 流程
        fs.open(file).close();
    }

    @After
    public void tearDown() {
        if (cluster != null) {
            cluster.shutdown();
        }
    }
}
```

运行这个 Test，你就可以在 `DFSOutputStream` 或 `NameNode` 的相关代码中停下来观察了。
