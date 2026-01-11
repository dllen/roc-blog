---
title: "Flink 源码阅读：18. High Availability (HA)"
date: 2026-01-13T04:00:00+08:00
description: "基于 ZooKeeper 和 Kubernetes 的 Leader 选举与元数据存储。"
tags: [Flink, Source Code, HA, ZooKeeper, K8s]
weight: 18
---

HA 保证了 JobMaster 挂掉后，Job 能够自动恢复。

## 1. Leader 选举
*   **ZooKeeper**: 使用 Curator 的 `LeaderLatch`。谁抢到了 ZNode，谁就是 Leader。
*   **Kubernetes**: 使用 ConfigMap 的 Annotation 抢占锁。

## 2. 元数据存储
JobMaster 需要将 JobGraph 和 Checkpoint 元数据持久化。
*   **JobGraph**: 存储在 DFS (HDFS/S3)，ZK 中只存路径。
*   **Checkpoint**: `CompletedCheckpoint` 对象序列化后存入 ZK/K8s。

## 3. 恢复流程
1.  新的 JobMaster 启动，竞选 Leader 成功。
2.  从 ZK 读取最新的 Checkpoint 元数据。
3.  从 DFS 加载 JobGraph。
4.  重新调度 ExecutionGraph，并将状态恢复到最后一次成功的 Checkpoint。
