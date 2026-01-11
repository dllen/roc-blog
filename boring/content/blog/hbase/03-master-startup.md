---
title: "HBase 源码阅读：03. Master 启动流程"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Master, Startup]
weight: 3
---

HMaster 是 HBase 集群的主脑，负责元数据管理、Region 分配、负载均衡等。

## 1. 入口类：`HMaster`

`HMaster` 继承自 `HRegionServer`（没错，Master 也是一个特殊的 RS），并实现了 `MasterServices` 接口。
启动入口在 `HMaster.main()`，但通常由 `HMasterCommandLine` 解析参数后拉起。

## 2. 启动核心流程 (`finishActiveMasterInitialization`)

HMaster 启动后会竞争 ZK 锁，成为 Active Master 后，会执行初始化逻辑。核心方法是 `finishActiveMasterInitialization`。

### 2.1 步骤概览

1.  **初始化文件系统**: 检查 `hbase.rootdir`，清理临时文件。
2.  **启动 ProcedureExecutor**: 加载之前的 Procedure 状态（WAL），恢复未完成的任务（如建表）。
3.  **初始化 AssignmentManager**: 这是 V2 版本的核心，负责 Region 的分配。
    *   加载 `hbase:meta` 表数据。
    *   构建 Region 状态机。
4.  **启动 Balancer**: 负载均衡器。
5.  **启动 CatalogJanitor**: 定期清理元数据的垃圾回收线程。
6.  **标记集群启动**: 设置 Cluster ID，标记 Master 为 initialized。

## 3. 关键组件

### 3.1 `AssignmentManager` (AM)
负责维护所有 Region 的位置信息和状态。HBase 2.x 引入了 Procedure V2，AM 严重依赖 Procedure 来进行 Region 的 Assign/Unassign，解决了旧版状态不一致的问题。

### 3.2 `ServerManager`
管理所有在线的 RegionServer。处理 RS 的 Heartbeat，检测 RS 宕机（ServerCrashProcedure）。

### 3.3 `MasterWalManager`
Master 也有自己的 WAL，主要用于 Procedure 的持久化。

## 4. 源码追踪

```java
HMaster.run()
  -> becomeActiveMaster()
    -> finishActiveMasterInitialization()
      -> fileSystemManager.splitWALs() // 处理旧日志
      -> procedureExecutor.start()     // 启动状态机
      -> assignmentManager.joinCluster() // 核心：加入集群管理
```

---
**Next**: [HBase 源码阅读：04. RegionServer 启动流程](../04-regionserver-startup/)
