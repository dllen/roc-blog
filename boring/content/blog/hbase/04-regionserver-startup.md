---
title: "HBase 源码阅读：04. RegionServer 启动流程"
date: 2026-01-12T10:00:00+08:00
description: "HBase RegionServer 启动流程源码解析：HRegionServer 构造、RPC 服务初始化、与 ZK 的 Session 协商、WAL 与 Cache 预热。"
taxonomies:
  tags: [HBase, Source Code, RegionServer, Startup]
weight: 4
tldr: "HRegionServer (RS) 是真正干活的节点，负责数据的读写。"
keywords: ["HBase", "源码阅读", "04.", "RegionServer", "启动流程", "Source Code", "Startup"]
---
## 0. 本章定位

HBase 源码阅读：04. RegionServer 启动流程：本文为源码阅读系列的一部分，假设读者已掌握对应中间件的基本概念与 Java 并发编程。建议先在本地搭建环境，再跟着章节顺序逐节 Debug，不要一次性读完——Flink / Kafka / HBase 等系统的状态机跨多个类，单纯阅读很难形成肌肉记忆。

## 实战建议

读源码时建议配合官方文档 + 单测用例 + 实际日志三件套：单测展示 happy path，日志展示异常路径，文档提供整体架构。生产环境遇到问题，回到对应章节能节省大量调试时间。

HRegionServer (RS) 是真正干活的节点，负责数据的读写。

## 1. 入口类：`HRegionServer`

入口同样是 `main` 方法，通过 `HRegionServerCommandLine` 启动。

## 2. 启动核心流程

### 2.1 初始化 (`initializeMemStoreChunkCreator`, `setupWALAndReplication`)
*   初始化 MemStore 的内存分配器（ChunkCreator，使用 Netty 的堆外内存池）。
*   初始化 WAL 工厂（FSHLog 或 AsyncFSWAL）。
*   初始化 Replication 服务。

### 2.2 启动 RPC 服务 (`createRpcServices`)
创建一个 `RSRpcServices` 实例，启动 Netty Server 监听端口（默认 16020），准备接收 Client 和 Master 的请求。

### 2.3 向 Master 汇报 (`handleReportForDutyResponse`)
1.  **ReportForDuty**: RS 启动后，向 Master 发送 RPC 请求，告知自己的存在。
2.  **ZooKeeper 注册**: 在 `/hbase/rs` 目录下创建临时节点。
3.  **等待上线**: 只有 Master 确认后，RS 才能正式对外服务。

### 2.4 启动后台线程
*   **MemStoreFlusher**: 负责 Flush MemStore。
*   **CompactedHFilesDischarger**: 清理被 Compact 掉的 HFile。
*   **LeaseManager**: 管理 Scanner 的租约。
*   **HealthChecker**: 健康检查。

## 3. 核心对象：`RSRpcServices`

这是 RS 对外暴露接口的实现类，包含了所有 Protocol 的实现，如 `ClientService`, `AdminService`。
当我们追踪 `put`, `get` 请求时，这里是 Server 端的第一站。

```java
public class RSRpcServices implements HBaseRPCErrorHandler,
    AdminService.BlockingInterface, ClientService.BlockingInterface {
    
    @Override
    public MutateResponse mutate(RpcController rpcc, MutateRequest request) {
        // 处理 Put/Delete 请求
    }
}
```

---
**Next**: [HBase 源码阅读：05. RPC 通信机制](../05-rpc-mechanism/)
