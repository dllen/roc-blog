---
title: "ZooKeeper 源码阅读：04. 数据模型 (DataTree)"
date: 2026-01-13T10:00:00+08:00
description: "ZooKeeper DataTree 源码解析：内存树形结构、DataNode 节点、ACL 与 Stat 属性、path 解析与 ZNode 操作。"
taxonomies:
  tags: [ZooKeeper, Source Code, DataTree, ZKDatabase]
weight: 4
tldr: "ZK 的核心是一个内存数据库，其结构类似于 Linux 文件系统。"
keywords: ["ZooKeeper", "源码阅读", "04.", "数据模型", "DataTree", "Source Code", "ZKDatabase"]
---
## 0. 本章定位

ZooKeeper 源码阅读：04. 数据模型 (DataTree)：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

ZK 的核心是一个内存数据库，其结构类似于 Linux 文件系统。

DataTree 是 ZK 内存数据结构，DataNode 包含 stat 与 children 字段，是 ZNode 操作的根入口。

DataTree 还维护 watch 表，ZNode 操作触发 watch 事件是 Watcher 机制的基础（08 章）。

DataTree 的持久化由 DataNode 与 FileTxnSnapLog 协作完成（见 05 章持久化）。

DataTree 配合 FileTxnSnapLog 实现 WAL 机制，每次 ZNode 操作都会序列化到事务日志（05 章）。

## 1. `DataNode`
每个 ZNode 在内存中对应一个 `DataNode` 对象。
*   `byte[] data`: 存储的数据。
*   `Long acl`: 权限控制。
*   `StatPersisted stat`: 节点状态 (czxid, mzxid, ctime, mtime, version...)。
*   `Set<String> children`: 子节点列表。

## 2. `DataTree`
`DataTree` 是整棵树的容器。
*   `nodes`: `ConcurrentHashMap<String, DataNode>`，存储路径到节点的映射。
*   `ephemerals`: `Map<Long, HashSet<String>>`，sessionId -> 该 Session 创建的所有临时节点路径。
    *   这个结构使得 Session 过期时，能快速找到并删除所有临时节点。

## 3. `ZKDatabase`
`ZKDatabase` 是 `DataTree` 的包装类，额外管理了：
*   `FileTxnSnapLog`: 磁盘 IO。
*   `sessionsWithTimeouts`: Session 管理。
*   `committedLog`: 已提交的日志缓存（用于 Follower 同步）。

---
**Next**: [ZooKeeper 源码阅读：05. 持久化机制](../05-persistence/)
