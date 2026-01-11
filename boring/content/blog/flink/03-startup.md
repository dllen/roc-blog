---
title: "Flink 源码阅读：03. 启动流程详解"
date: 2026-01-12T13:00:00+08:00
description: "Flink Cluster 的启动流程，从 Entrypoint 到 Dispatcher 和 ResourceManager 的初始化。"
tags: [Flink, Source Code, Startup, ClusterEntrypoint]
weight: 3
---

Flink 支持多种部署模式（Standalone, YARN, K8s），但启动流程大同小异。我们以 **Standalone Session** 模式为例。

## 1. 入口类：ClusterEntrypoint
Flink Master 进程的入口类通常是 `ClusterEntrypoint` 的子类。
在 Standalone 模式下，入口是 `StandaloneSessionClusterEntrypoint`。

`main()` 方法核心逻辑：
1.  解析命令行参数。
2.  加载 `flink-conf.yaml` 配置。
3.  初始化 Plugin 系统。
4.  调用 `ClusterEntrypoint.runClusterEntrypoint()`。

## 2. 核心组件初始化
在 `runClusterEntrypoint` -> `initializeServices` 中，会初始化三大核心组件：

### 2.1 ResourceManager (资源管理器)
负责 Slot 资源的管理。
*   在 Standalone 模式下，是 `StandaloneResourceManager`。
*   在 YARN 模式下，是 `YarnResourceManager`。
它会处理 TaskManager 的注册（RegisterTaskManager），并维护 Slot 的状态。

### 2.2 Dispatcher (分发器)
负责接收 Client 提交的 JobGraph，并启动 JobMaster。
它运行了一个 `DispatcherGateway` RPC 服务，Client 通过 RestClusterClient 连接到这里。

### 2.3 WebMonitorEndpoint (Web UI)
启动 Netty 服务端，提供 Web Dashboard 和 REST API。

## 3. TaskManager 启动
TaskManager 的入口类是 `TaskManagerRunner`。
1.  启动 ActorSystem (RPC)。
2.  启动 `TaskExecutor`。
3.  向 ResourceManager 注册自己，汇报拥有的 Slot 数量。

## 4. 总结
启动流程本质上是拉起 RPC 服务，并组装 Dispatcher 和 ResourceManager。
一旦这两个组件就绪，集群就进入了 `READY` 状态，等待 Job 提交。
