---
title: "Flink 源码阅读：18. High Availability (HA)"
date: 2026-01-13T04:00:00+08:00
description: "基于 ZooKeeper 和 Kubernetes 的 Leader 选举与元数据存储。"
taxonomies:
  tags: [Flink, Source Code, HA, ZooKeeper, K8s]
weight: 18
tldr: "基于 ZooKeeper 和 Kubernetes 的 Leader 选举与元数据存储。"
keywords: ["Flink", "源码阅读", "18.", "High", "Availability", "HA", "Source Code", "ZooKeeper"]
---

HA 保证了 JobMaster 挂掉后，Job 能够自动恢复。








## 实战建议

生产环境强烈建议开 HA + 高可用存储（S3 / OSS），避免单点故障导致作业无法恢复。

HA 切换时 ZK / K8s ConfigMap 的锁状态至关重要，监控 LeaderElection 指标可提前发现异常。

## 0. 本章定位

HA 保证 JobMaster 挂掉后 Job 自动恢复。本章讲 ZK / K8s ConfigMap 两种 Leader 选举方案（Curator LeaderLatch / ConfigMap Annotation）、元数据存储（Blob Server + HA Service）、状态恢复流程（从最近 Checkpoint 重启）。生产环境部署 Flink on K8s 时必读——HA Service 配错会导致 JM 切换时作业重启失败。还要注意 high-availability.storageDir 必须所有节点都能访问（共享文件系统或对象存储）。生产环境强烈建议开 HA 避免单点。

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
