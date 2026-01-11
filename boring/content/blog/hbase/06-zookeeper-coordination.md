---
title: "HBase 源码阅读：06. ZooKeeper 协调机制"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, ZooKeeper, Coordination]
weight: 6
---

ZooKeeper (ZK) 是 HBase 集群的协调者，虽然 HBase 2.x 试图减少对 ZK 的依赖（如 Assignment Manager V2），但 ZK 依然是不可或缺的。

## 1. ZK 在 HBase 中的作用

1.  **Master 选举**: `/hbase/master`。保证任何时刻只有一个 Active Master。
2.  **RegionServer 注册**: `/hbase/rs`。Master 监控此节点感知 RS 的上下线。
3.  **Meta 表位置**: `/hbase/meta-region-server`。Client 第一次请求必须先访问 ZK 找到 Meta 表在哪。
4.  **集群 ID**: `/hbase/hbaseid`。
5.  **ACL / Token**: 安全相关配置。

## 2. 核心类：`ZKWatcher`

`ZKWatcher` 封装了 ZK 的客户端，并管理所有的 Listener (`ZKListener`)。
当 ZK 节点发生变化时，`ZKWatcher` 会回调注册的 Listener。

## 3. 关键流程分析

### 3.1 Master 选举 (`ActiveMasterManager`)
*   Master 启动时尝试创建临时节点 `/hbase/master`。
*   创建成功 -> 成为 Active Master。
*   创建失败 -> Watch 该节点，进入 Standby 模式。
*   如果 Active Master 挂了（节点消失），Standby Master 收到通知，再次尝试创建节点。

### 3.2 节点宕机检测
*   Master 监听 `/hbase/rs` 目录的 Children 变化。
*   当某个 RS 挂掉，临时节点消失。
*   Master 收到 NodeChildrenChanged 事件，触发 `ServerCrashProcedure` (SCP)，开始数据恢复流程（切分 WAL，重新分配 Region）。

---
**Next**: [HBase 源码阅读：07. Meta 表管理](../07-meta-table/)
