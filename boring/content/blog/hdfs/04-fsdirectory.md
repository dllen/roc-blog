---
title: "HDFS 源码阅读：04. 元数据管理 (FSDirectory)"
date: 2026-01-15T10:00:00+08:00
description: "深入 FSDirectory 内部，解析 INode 内存结构与目录树的锁机制。"
tags: [Hadoop, HDFS, NameNode, Metadata]
weight: 4
---

`FSDirectory` 是 NameNode 维护文件系统目录树的核心组件。它管理着所有的 `INode`。

## 1. INode 类层次结构

HDFS 的目录树完全驻留在内存中。

*   **`INode`**: 抽象基类，定义了 id, name, permission, modificationTime, accessTime, parent 等通用属性。
*   **`INodeDirectory`**: 表示目录。内部有一个 `children` 列表（通常是 `ArrayList` 或 `ReadOnlyList`）。
*   **`INodeFile`**: 表示文件。核心属性是 `BlockInfo[] blocks`，指向文件包含的数据块。
*   **`INodeSymlink`**: 符号链接。

```java
// INodeFile.java 简化版
public class INodeFile extends INodeWithAdditionalFields {
    private BlockInfo[] blocks; // 文件包含的 Block
    private short blockReplication; // 副本数
    private long preferredBlockSize; // 块大小
}
```

## 2. 内存优化

为了在有限的内存中存下数亿个文件，HDFS 做了极致优化：

1.  **整数编码**: 权限、用户、组等信息被压缩在一个 `long` 类型中 (`PermissionStatusFormat`)。
2.  **定长数组**: `INodeDirectory` 的 children 尽量使用定长数组，减少对象头开销。
3.  **UTF-8 字节**: 文件名存储为 `byte[]` 而不是 `String`（Java String 开销大）。

## 3. 全局锁 vs 细粒度锁

在早期版本，NameNode 使用一把全局读写锁 (`FSNamesystemLock`)。

```java
// FSNamesystem.java
private final ReentrantReadWriteLock fsLock = new ReentrantReadWriteLock();
```

所有元数据操作（如 `mkdir`）都需要获取这把锁。

Hadoop 2.x/3.x 引入了**细粒度锁 (Fine-grained Locking)** 的尝试，但在 `FSDirectory` 层面，大部分操作依然依赖 `FSNamesystem` 的全局锁来保证一致性。

## 4. 目录树操作

以 `mkdir` 为例：

1.  **RPC 入口**: `NameNodeRpcServer.mkdirs`
2.  **FSNamesystem**: 获取写锁 (`writeLock()`)。
3.  **FSDirectory**: `mkdirs` -> `unprotectedMkdir`。
4.  **EditLog**: 记录操作 (`logMkDir`)。
5.  **释放锁**: 操作完成。

## 5. 快照 (Snapshot)

HDFS 支持目录级别的快照。

当对目录 `/data` 创建快照 `s1` 时，HDFS **不会复制**该目录下的所有 INode。而是采用 **Copy-on-Write (写时复制)** 机制。

*   `INodeDirectory` 会维护一个 `DirectoryWithSnapshotFeature`。
*   当修改某个文件时，会记录其修改前的状态（Diff List）。
*   读取快照时，通过应用 Diff List 还原出当时的状态。

这使得创建快照非常快（O(1)），且节省内存。
