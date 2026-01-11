---
title: "HBase 源码阅读：07. Meta 表管理"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Meta Table, Catalog]
weight: 7
---

`hbase:meta` 表是 HBase 中最重要的一张系统表，它存储了集群中所有用户表的 Region 路由信息。

## 1. Meta 表结构

Meta 表本身也是一个 HBase 表，但它不能被切分，只能有一个 Region。

*   **RowKey**: `tableName,startKey,timestamp.encodedRegionName`
    *   这种设计保证了 Region 信息是按照 Table 和 StartKey 排序的，方便定位。
*   **Column Family**: `info`
    *   `info:regioninfo`: 序列化的 `RegionInfo` 对象（包含 StartKey, EndKey 等）。
    *   `info:server`: 当前管理该 Region 的 RegionServer 地址 (`host:port`)。
    *   `info:serverstartcode`: RS 的启动时间戳，用于版本检查。
    *   `info:state`: Region 的状态（OPEN, CLOSED, OFFLINE 等）。

## 2. 客户端定位 Region (Client Lookup)

Client 读写数据时，如何找到 RowKey 对应的 RegionServer？这是一个三层查询架构：

1.  **Level 1**: **ZooKeeper**。读取 `/hbase/meta-region-server`，获取 Meta 表所在的 RegionServer。
2.  **Level 2**: **Meta 表**。向 Meta RS 发送 Scan 请求，根据 RowKey 找到目标 Region 所在的 RS。
    *   查找逻辑：Scan Meta 表，RowKey >= 目标 RowKey 的第一行之前的那个 Region。
3.  **Level 3**: **用户 Region**。直接向目标 RS 发送读写请求。

## 3. 客户端缓存 (`MetaCache`)

为了性能，Client 会缓存 Meta 信息。
*   **正常流程**: 先查缓存，有则直接访问。
*   **缓存失效**: 如果访问 RS 报错（如 `NotServingRegionException`），说明 Region 迁移了。Client 会清理缓存，重新走 ZK -> Meta 的流程。

## 4. Meta 表的维护

Meta 表的数据由 Master 的 `AssignmentManager` 维护。
*   当 Region Open 成功后，更新 Meta 表中的 server 字段。
*   当 Region Split 时，插入新的子 Region 信息，并标记父 Region 为 Offline。

---
**Next**: [HBase 源码阅读：08. 读流程详解 (Read Path)](../08-read-path/)
