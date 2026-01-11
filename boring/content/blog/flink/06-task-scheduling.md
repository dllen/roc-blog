---
title: "Flink 源码阅读：06. Task 调度与执行"
date: 2026-01-12T16:00:00+08:00
description: "TaskManager 如何启动 Task？Slot、Task、SubTask 的关系，以及 Task 线程模型。"
tags: [Flink, Source Code, Task, Thread Model]
weight: 6
---

JobMaster 分配好 Slot 后，TaskManager 接收到 `SubmitTask` 请求。

## 1. Task 与 SubTask
*   **SubTask**: Flink 并行执行的最小单位。一个 ExecutionVertex 对应一个 SubTask。
*   **Task**: 在 TaskManager 内部，SubTask 被封装为 `Task` 对象。

## 2. 线程模型
Flink 采用**单线程模型**执行 Task。
每个 `Task` 启动一个独立的线程 (`Task.run()`)。
在这个线程中，依次执行：
1.  加载 Operator Chain。
2.  初始化 StateBackend。
3.  开始处理数据 (`invokable.invoke()`)。

## 3. Slot Sharing (Slot 共享)
为了提高资源利用率，Flink 允许不同 JobVertex 的 SubTask 共享同一个 Slot。
前提是它们属于同一个 Slot Sharing Group。
这意味着一个 Slot 中可能运行多个 SubTask（例如 map 和 sink 跑在一起）。
但在代码层面，它们依然是**独立的线程**。

## 4. Mailbox 模型 (邮箱模型)
Flink 1.10+ 引入了 Mailbox 模型。
Task 线程不仅处理数据，还处理“邮件”（Action）。
*   Checkpoint 触发
*   Timer 触发
*   数据处理
所有操作都在 Main Thread 中串行执行，**避免了复杂的锁竞争**。
这是 Flink 高性能的关键之一。
