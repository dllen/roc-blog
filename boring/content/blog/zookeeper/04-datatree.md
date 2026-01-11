---
title: "ZooKeeper 源码阅读：04. 数据模型 (DataTree)"
date: 2026-01-13T10:00:00+08:00
tags: [ZooKeeper, Source Code, DataTree, ZKDatabase]
weight: 4
---

ZK 的核心是一个内存数据库，其结构类似于 Linux 文件系统。

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
