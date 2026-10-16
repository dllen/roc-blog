---
title: "HBase 源码阅读：06. ZooKeeper 协调机制"
date: 2026-01-12T10:00:00+08:00
description: "HBase 与 ZooKeeper 协调源码解析：ZKWatcher 注册机制、Master/RegionServer Session 管理、临时节点监听与故障检测。"
taxonomies:
  tags: [HBase, Source Code, ZooKeeper, Coordination]
weight: 6
tldr: "ZooKeeper (ZK) 是 HBase 集群的协调者，虽然 HBase 2."
keywords: ["HBase", "源码阅读", "06.", "ZooKeeper", "协调机制", "Source Code", "Coordination"]
---
## 0. 本章定位

HBase 源码阅读：06. ZooKeeper 协调机制：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

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
