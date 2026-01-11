---
title: "HDFS 源码阅读：03. NameNode 启动流程"
date: 2026-01-14T10:00:00+08:00
description: "NameNode 启动全流程解析：从 main 函数入口到 RPC 服务就绪，以及 SafeMode 的处理逻辑。"
tags: [Hadoop, HDFS, NameNode, Startup]
weight: 3
---

NameNode 是 HDFS 的大脑，它的启动过程决定了整个集群何时可用。

## 1. 入口：NameNode.main()

一切始于 `org.apache.hadoop.hdfs.server.namenode.NameNode` 类的 `main` 方法。

```java
public static void main(String argv[]) throws Exception {
    if (DFSUtil.parseHelpArgument(argv, NameNode.USAGE, System.out, true)) {
        System.exit(0);
    }
    try {
        StringUtils.startupShutdownMessage(NameNode.class, argv, LOG);
        NameNode namenode = createNameNode(argv, null); // 核心
        if (namenode != null) {
            namenode.join();
        }
    } catch (Throwable e) {
        // ... Error handling
    }
}
```

`createNameNode` 方法会解析命令行参数（如 `-format`, `-recover`, `-upgrade`），如果只是正常启动，最终会调用 `new NameNode(conf)`。

## 2. 初始化核心组件 (initialize)

在构造函数中，核心逻辑都在 `initialize(conf)` 方法里。

```java
protected void initialize(Configuration conf) throws IOException {
    // 1. 设置登录用户 (Kerberos)
    if (UserGroupInformation.isSecurityEnabled()) {
        SecurityUtil.login(conf, DFS_NAMENODE_KEYTAB_FILE_KEY, ...);
    }
    
    // 2. 启动 HTTP Server (Web UI: 9870)
    startHttpServer(conf);
    
    // 3. 加载元数据 (重点)
    loadNamesystem(conf);
    
    // 4. 创建 RPC Server (ClientRPC: 9820, ServiceRPC: 8020)
    rpcServer = createRpcServer(conf);
    
    // 5. 启动公共服务 (JvmPauseMonitor, MetricsSystem)
    startCommonServices(conf);
    
    // 6. 启动 NameNode 只有在 SafeMode 退出后才做的服务
    startActiveServices();
}
```

## 3. 加载元数据 (FSNamesystem.loadFromDisk)

`loadNamesystem` 会创建 `FSNamesystem` 对象，并调用其 `loadFromDisk` 方法。这是启动过程中最耗时的步骤。

1.  **加载 FSImage**: 读取最新的 Checkpoint 文件，恢复内存中的 `INode` 树。
2.  **回放 EditLog**: 读取 FSImage 之后的 EditLog，将操作重做到内存树上。
3.  **保存新 Image (可选)**: 如果配置了 `dfs.namenode.checkpoint.check.user.provider` 等，可能会触发。

```java
// FSImage.java
long loadFSImage(File curFile, StartupOption startOpt, MetaRecoveryContext recovery) throws IOException {
    // Protocol Buffers 反序列化
    FSImageFormatProtobuf.Loader loader = new FSImageFormatProtobuf.Loader(conf, namesystem);
    loader.load(curFile);
}
```

## 4. 启动 RPC 服务

NameNode 通常启动两个 RPC Server：

1.  **ServiceRpcServer**: 专门处理 DataNode 的心跳、块汇报等请求。避免 Client 流量把 DataNode 挤掉。
2.  **ClientRpcServer**: 处理 Client 的 `ls`, `mkdir` 等请求。

## 5. 进入安全模式 (SafeMode)

启动初期，NameNode 内存中虽然有了文件目录树，但**没有 Block 的位置信息**（BlockMap 是空的）。

Block 的位置信息不会持久化在磁盘，必须等 DataNode 启动并汇报。

因此，NameNode 启动后自动进入 **SafeMode**（只读模式）：
1.  等待 DataNode 汇报 Block。
2.  统计已汇报的 Block 比例（默认阈值 99.9%）。
3.  达到阈值后，再等待 30 秒（`dfs.namenode.safemode.extension`），然后退出 SafeMode。

## 6. 总结

NameNode 启动不仅是加载磁盘数据，更依赖于全网 DataNode 的参与来重建完整的元数据视图。
