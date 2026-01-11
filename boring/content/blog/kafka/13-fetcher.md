---
title: "Kafka 源码阅读：13. Fetcher"
date: 2026-01-15T10:00:00+08:00
tags: [Kafka, Source Code, Consumer, Fetcher]
weight: 13
---

Consumer 并不是被动接收消息，而是主动拉取 (`poll`)。

## 1. 核心流程

1.  **sendFetches**: 遍历分配给自己的 Partition，构建 `FetchRequest`。
    *   并不是每次 poll 都发请求，而是检查本地缓存 (`completedFetches`) 是否有数据。
2.  **NetworkClient.poll**: 发送请求，接收响应。
3.  **handleFetchResponse**: 解析响应，将 RecordBatch 解析出来，放入 `completedFetches` 队列。
4.  **return**: `poll()` 方法从队列取出记录返回给用户。

## 2. 优化

*   **Max Poll Records**: 限制一次返回的条数。
*   **Fetch Min Bytes**: 攒够多少数据才返回（长轮询）。
*   **Fetch Max Wait**: 最长等待时间。

---
**Next**: [Kafka 源码阅读：14. 副本同步机制](../14-replication/)
