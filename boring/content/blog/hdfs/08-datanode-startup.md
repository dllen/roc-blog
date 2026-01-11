---
title: "HDFS 源码阅读：08. DataNode 启动与注册"
date: 2026-01-19T10:00:00+08:00
description: "DataNode 启动全流程解析：从存储初始化、BlockPool 管理到向 NameNode 注册。"
tags: [Hadoop, HDFS, DataNode, Startup]
weight: 8
---

DataNode 是 HDFS 的苦力，负责真正的磁盘 IO。它的启动流程比 NameNode 稍微简单一些，但涉及多线程协作。

## 1. 入口：DataNode.main()

```java
public static void main(String args[]) {
    secureMain(args, null);
}

public static void secureMain(String args[], SecureResources resources) {
    // ... 解析参数
    DataNode datanode = createDataNode(args, null, resources);
    if (datanode != null) {
        datanode.join();
    }
}
```

`createDataNode` 最终调用 `instantiateDataNode` -> `makeInstance` -> `new DataNode(conf)`.

## 2. 核心初始化 (startDataNode)

```java
void startDataNode(Configuration conf, ...) {
    // 1. 初始化存储管理模块 (FsDataset)
    storage = new DataStorage();
    
    // 2. 初始化 BlockPoolManager (负责跟 NameNode 通信)
    blockPoolManager = new BlockPoolManager(this);
    
    // 3. 启动数据传输服务 (TCP Server, 默认 9866)
    initDataXceiver(conf);
    
    // 4. 启动 HTTP 服务 (Web UI, 默认 9864)
    initHttpServer(conf);
    
    // 5. 启动 IPC 服务 (ClientDatanodeProtocol, 默认 9867)
    initIpcServer(conf);
}
```

## 3. BPServiceActor 与注册

HDFS 支持 **Federation**，即一个 DataNode 可以同时为多个 NameNode (Namespace) 服务。每个 Namespace 对应一个 **Block Pool (BP)**。

DataNode 为每个 Block Pool 启动一个 `BPOfferService`，其中包含两个 `BPServiceActor` 线程（对应 Active 和 Standby NameNode）。

`BPServiceActor` 的核心循环：

1.  **Handshake**: 连接 NameNode，获取 NamespaceInfo（ClusterID, BlockPoolID 等），验证版本是否匹配。
2.  **Register**: 调用 RPC `registerDatanode` 向 NameNode 注册自己。
3.  **OfferService**: 进入主循环，定期发送心跳和块汇报。

```java
// BPServiceActor.java
void connectToNNAndHandshake() throws IOException {
    // 获取 NameNode 代理
    bpNamenode = dn.connectToNN(nnAddr);
    // 握手
    NamespaceInfo nsInfo = handshake(bpNamenode);
    // 设置 Block Pool ID
    bpos.setNamespaceInfo(nsInfo);
}
```

## 4. 存储初始化

在连接 NameNode 之前，DataNode 必须先扫描本地磁盘，加载已有的 Block 信息。这由 `FsDatasetImpl` 完成（详见下一篇）。

## 5. 总结

DataNode 的启动是一个“自下而上”的过程：先准备好底层的存储，再向上层的 NameNode 汇报“我准备好了”。
