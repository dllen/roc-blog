---
title: "HDFS 源码阅读：00. 阅读大纲与学习路线"
date: 2026-01-12T12:00:00+08:00
description: "Hadoop Distributed File System (HDFS) 源码阅读系列大纲。涵盖 NameNode 元数据管理、DataNode 存储引擎、客户端读写流程、HA 高可用机制等核心模块。"
taxonomies:
  tags: [Hadoop, HDFS, Source Code, Outline, Roadmap]
weight: 0
---

Hadoop Distributed File System (HDFS) 是大数据生态系统的基石。尽管对象存储（如 S3）日益流行，但 HDFS 依然是理解分布式存储系统设计思想的最佳范本。

本系列将基于 **Hadoop 3.3+** 源码，深入剖析其底层原理。

## 🗺️ 整体蓝图

我们将 HDFS 源码阅读分为五个阶段：

1.  **基础篇**：了解 HDFS 的核心架构、设计目标与项目结构。
2.  **NameNode 篇**：深入“大脑”，探索元数据管理、RPC 处理与块管理。
3.  **DataNode 篇**：深入“四肢”，研究存储管理、心跳汇报与数据传输。
4.  **Client 篇**：深入“用户接口”，剖析文件读写流程与流式接口。
5.  **高可用与进阶篇**：探究 HA、Federation、EC (Erasure Coding) 等高级特性。

---

## 📚 详细大纲 (持续更新)

### Phase 1: 准备与架构 (Preparation & Architecture)

*   **[01. 源码编译与环境搭建]({{< ref "01-hdfs-source-code-map.md" >}})**
    *   Hadoop 源码目录结构解析
    *   使用 Maven 编译 Hadoop
    *   IDEA 远程调试环境配置
*   **02. HDFS 核心架构设计**
    *   Master/Slave 架构回顾
    *   Block 的设计理念
    *   通信协议 (Hadoop RPC) 概览

### Phase 2: NameNode - 系统的核心 (The Brain)

NameNode 管理着整个文件系统的命名空间和 Block 映射信息。

*   **03. NameNode 启动流程**
    *   `NameNode` 类入口分析
    *   组件初始化顺序
    *   安全模式 (SafeMode) 的进入与退出
*   **04. 元数据管理 (FSDirectory)**
    *   内存目录树结构 (`INode`, `INodeFile`, `INodeDirectory`)
    *   快照 (Snapshot) 的实现基础
*   **05. 持久化机制 (FsImage & EditLog)**
    *   `FSEditLog` 的双缓冲机制 (Double Buffer)
    *   `FSImage` 的加载与存储
    *   Checkpoint 流程 (SecondaryNameNode/Checkpointer)
*   **06. 块管理 (BlockManager)**
    *   Block 的生命周期管理
    *   副本复制 (Replication Monitor)
    *   Corrupt Block 处理
*   **07. 租约管理 (LeaseManager)**
    *   文件写入锁机制
    *   租约恢复与软硬限流

### Phase 3: DataNode - 数据的存储 (The Worker)

DataNode 负责实际的数据块存储与读写。

*   **08. DataNode 启动与注册**
    *   `DataNode` 类入口
    *   向 NameNode 注册与握手
    *   BPServiceActor 线程模型
*   **09. 存储管理 (FsDatasetImpl)**
    *   磁盘卷管理 (`FsVolumeImpl`)
    *   Block 文件在本地磁盘的布局
    *   RAM Disk 与 异构存储支持
*   **10. 心跳与块汇报 (Heartbeat & BlockReport)**
    *   增量汇报 vs 全量汇报
    *   IBR (Incremental Block Report) 优化
*   **11. 数据传输协议 (DataTransferProtocol)**
    *   基于 Netty 的数据传输服务端
    *   `DataXceiver` 与 `BlockReceiver`

### Phase 4: Client - 读写流程 (IO Path)

最复杂的交互逻辑往往发生在客户端。

*   **12. DFSClient 初始化**
    *   代理对象的创建
*   **13. 文件写入流程 (Write Path)**
    *   `DFSOutputStream` 内部原理
    *   DataStreamer 线程与 AckQueue
    *   Packet 的构造与发送
    *   Pipeline 建立与恢复 (Pipeline Recovery)
*   **14. 文件读取流程 (Read Path)**
    *   `DFSInputStream` 内部原理
    *   BlockReader 的选择 (短路读 Short Circuit Read)
    *   Checksum 校验机制

### Phase 5: 高级特性 (Advanced)

*   **15. HDFS HA (High Availability)**
    *   QJM (Quorum Journal Manager) 原理
    *   ZKFC (ZooKeeper Failover Controller) 选举机制
*   **16. HDFS Federation**
    *   ViewFileSystem 与 RBF (Router-based Federation)
*   **17. Erasure Coding (纠删码)**
    *   原理与 Striped Block 实现

## 💡 学习建议

Hadoop 代码库历史悠久，风格混合。建议：

1.  **关注核心类**：如 `FSNamesystem`, `FSDirectory`, `BlockManager`, `DFSOutputStream`。
2.  **理解 RPC**：Hadoop 的逻辑几乎都是通过 RPC 串联的，理解 Protocol 定义是关键。
3.  **不要陷入细节**：Metrics、Web UI、Audit Log 等非核心逻辑可先跳过。
