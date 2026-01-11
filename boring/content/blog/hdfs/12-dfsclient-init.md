---
title: "HDFS 源码阅读：12. DFSClient 初始化"
date: 2026-01-23T10:00:00+08:00
description: "DFSClient 是 HDFS 交互的入口。解析 DistributedFileSystem 与 DFSClient 的关系，以及 RPC 代理的创建。"
tags: [Hadoop, HDFS, Client, Initialization]
weight: 12
---

当我们调用 `FileSystem.get(conf)` 时，发生了什么？

## 1. FileSystem 与 DistributedFileSystem

`FileSystem` 是 Hadoop 的抽象基类，支持 LocalFileSystem, S3AFileSystem, DistributedFileSystem (HDFS) 等多种实现。

HDFS 的实现类是 `org.apache.hadoop.hdfs.DistributedFileSystem`。

```java
// DistributedFileSystem.java
public void initialize(URI uri, Configuration conf) throws IOException {
    super.initialize(uri, conf);
    setConf(conf);
    
    // 核心：创建 DFSClient
    this.dfs = new DFSClient(uri, conf, statistics);
}
```

`DistributedFileSystem` 基本上只是 `DFSClient` 的一层包装。

## 2. DFSClient 构造函数

`DFSClient` 是真正干活的类。它的构造函数非常庞大。

```java
// DFSClient.java
public DFSClient(URI nameNodeUri, Configuration conf, ...) {
    // 1. 获取 NameNode 代理 (NameNodeProxies)
    this.namenode = NameNodeProxies.createProxy(conf, nameNodeUri, ClientProtocol.class).getProxy();
    
    // 2. 初始化一些配置
    this.dfsClientConf = new DfsClientConf(conf);
    
    // 3. 启动 LeaseRenewer (如果需要)
    // ...
}
```

## 3. RPC 代理 (Proxy)

`NameNodeProxies.createProxy` 负责创建一个实现了 `ClientProtocol` 接口的动态代理对象。

*   **RetryPolicy**: 代理对象封装了重试逻辑。例如，如果连接失败，会自动重试；如果是 HA 模式，会自动切换到 Standby NameNode 试探。
*   **FailoverProxyProvider**: 决定了 HA 切换的策略（如 `ConfiguredFailoverProxyProvider`）。

因此，我们在写代码时调用 `dfs.mkdirs("/tmp")`，实际上是调用了代理对象，代理对象通过 Protobuf RPC 发送请求给 NameNode，如果失败则自动重试，对用户代码透明。

## 4. 总结

`DFSClient` 初始化建立了与 NameNode 的控制通道。接下来的读写操作，将由 `DFSClient` 指挥，并在必要时建立与 DataNode 的数据通道。
