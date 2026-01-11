---
title: "Redis 源码阅读：开篇与源码地图"
date: 2026-01-10T10:00:00+08:00
description: "开启 Redis 源码阅读之旅，梳理 Redis 源码目录结构，规划阅读路径。不积跬步，无以至千里。"
tags: [Redis, Source Code, C, Database, Architecture]
---

Redis 作为全球最流行的内存数据库，其代码质量一直被开发者称道。它用纯 C 语言编写，没有复杂的依赖，代码风格简洁明快，是学习 C 语言网络编程、数据结构设计以及系统架构的绝佳范本。

本系列博客将带你深入 Redis 源码，从底层数据结构到核心事件模型，再到集群架构，一步步揭开 Redis 高性能背后的秘密。

## 1. 为什么要读 Redis 源码？

在日常工作中，我们可能只需要掌握 Redis 的 API 和运维命令就能应付大多数场景。但如果你想进阶，阅读源码是必经之路：

1.  **知其所以然**：了解 `SET`, `GET` 背后发生了什么，`HSET` 在什么情况下会从 ZipList 转换为 HashTable，有助于我们写出更高效的业务代码。
2.  **排查疑难杂症**：当生产环境出现莫名其妙的延迟或内存飙升时，源码级的理解能帮你快速定位病灶。
3.  **学习系统设计**：Redis 的事件循环（Event Loop）、渐进式 Rehash、RDB/AOF 持久化机制，都是系统设计中的经典案例。
4.  **C 语言进阶**：Redis 展示了如何用 C 语言实现面向对象（redisObject）、泛型数据结构（dict）等高级特性。

## 2. 准备工作

### 获取源码
建议直接从 GitHub Clone，方便切换分支和查看历史提交。

```bash
git clone https://github.com/redis/redis.git
cd redis
# 建议切换到一个稳定版本，例如 7.0 或 7.2
git checkout 7.2.4
```

### 开发环境
虽然 Redis 可以在 Linux/macOS 上直接编译运行，但为了方便阅读和跳转，推荐使用 IDE：
*   **CLion**: JetBrains 出品，C/C++ 开发神器，代码跳转和分析非常强大（收费/教育版免费）。
*   **VS Code**: 配合 C/C++ 插件，轻量且免费。

### 编译与调试
Redis 的编译非常简单，没有 autotools/cmake 的复杂配置，直接 Make 即可。

```bash
make
# 编译带有调试信息的版本，方便 GDB/LLDB 调试
make noopt
```

## 3. 源码目录概览

打开 Redis 源码目录，你会看到以下核心文件夹：

*   **`src/`**:  **核心战场**。Redis 的所有源代码都在这里。
*   **`deps/`**:  Redis 依赖的第三方库。Redis 倾向于将依赖库源码包含进来，保证编译的一致性。
    *   `hiredis`: 官方 C 客户端库。
    *   `jemalloc`: 默认的高性能内存分配器。
    *   `lua`: Lua 脚本引擎。
    *   `linenoise`: 命令行编辑库（用于 redis-cli）。
*   **`tests/`**:  测试用例。Redis 的测试覆盖率很高，使用 Tcl 编写。
*   **`utils/`**:  工具脚本，如集群创建脚本等。
*   **`redis.conf`**:  默认配置文件，包含详细的注释，本身就是一份很好的文档。

## 4. 核心代码地图 (src/)

进入 `src/` 目录，几百个文件可能会让你眼花缭乱。我们可以按功能模块将它们分类：

### 4.1. 服务器启动与事件循环 (The Engine)
这是 Redis 的心脏。
*   **`server.c` / `server.h`**: 全局入口。包含 `main` 函数，服务器初始化，主循环 `aeMain`。`server` 结构体保存了整个服务器的运行状态。
*   **`ae.c` (Async Event)**: 自封装的事件库。支持 epoll (Linux), kqueue (macOS), select 等多路复用技术。Redis 高并发的基石。

### 4.2. 网络模型 (Networking)
*   **`networking.c`**: 处理客户端连接、请求解析、响应发送。
*   **`anet.c`**: 对 Socket API 的底层封装（bind, listen, accept, connect）。

### 4.3. 基础数据结构 (Data Structures)
Redis 造了很多轮子，为了追求极致的性能和内存效率。
*   **`sds.c` (Simple Dynamic String)**: 增强版字符串，二进制安全，O(1) 获取长度。
*   **`adlist.c`**: 双向链表。
*   **`dict.c`**: 字典（哈希表）。Redis 的核心，KV 存储的基石。支持渐进式 Rehash。
*   **`intset.c`**: 整数集合。当 Set 中只有整数且数量较少时使用，极省内存。
*   **`zipmap.c` / `ziplist.c` / `listpack.c`**: 压缩列表。内存紧凑型结构，用于存储元素较少的 List/Hash/ZSet。注意：`listpack` 正在逐渐替代 `ziplist`。
*   **`t_zset.c`**: 跳表 (Skiplist) 的实现，用于 ZSet。

### 4.4. 对象系统 (Object System)
*   **`object.c`**: 定义了 `redisObject` 结构体。Redis 所有的 Value（String, List, Hash...）在内部都封装为 `redisObject`。它实现了引用计数、LRU/LFU 信息记录等。

### 4.5. 数据类型实现 (Data Types)
连接底层数据结构和用户命令的桥梁。
*   `t_string.c`: String 命令实现 (SET, GET...)
*   `t_list.c`: List 命令实现 (LPUSH, LPOP...)
*   `t_hash.c`: Hash 命令实现 (HSET, HGET...)
*   `t_set.c`: Set 命令实现 (SADD, SMEMBERS...)
*   `t_zset.c`: ZSet 命令实现 (ZADD, ZRANGE...)

### 4.6. 持久化 (Persistence)
*   **`rdb.c`**: RDB 快照持久化。
*   **`aof.c`**: AOF 日志持久化。

### 4.7. 分布式特性
*   **`replication.c`**: 主从复制。
*   **`sentinel.c`**: 哨兵模式，高可用切换。
*   **`cluster.c`**: Redis Cluster 集群实现。

## 5. 推荐阅读路径

直接从 `main` 函数开始读通常会陷入细节的泥潭。我推荐的“由底向上，由点到面”的阅读顺序：

1.  **阶段一：底层基石**
    *   先看 `sds.c`，最简单，热热身。
    *   接着看 `adlist.c` 和 `dict.c`，理解 Redis 如何存数据。
    *   浏览 `ziplist.c`/`listpack.c`，体会 Redis 对内存的“抠门”。
2.  **阶段二：对象系统**
    *   阅读 `object.c` 和 `server.h` 中的 `redisObject` 定义，理解“类型”与“编码”的区别。
3.  **阶段三：事件驱动**
    *   死磕 `ae.c`，理解 Redis 的 IO 多路复用模型。这是 Redis 快的最主要原因。
4.  **阶段四：请求处理流**
    *   从 `server.c` 的 `main` 入手，看服务器初始化。
    *   追踪一个命令的生命周期：`networking.c` (readQueryFromClient) -> `processInputBuffer` -> `processCommand` -> `call` -> `addReply`。
5.  **阶段五：进阶功能**
    *   RDB/AOF、复制、集群、Lua 脚本等，根据兴趣按需阅读。

## 结语

Redis 源码是一座宝库。不要试图一次看完所有代码，抓住主线，理解核心思想才是关键。下一篇，我们将从 Redis 最基础的数据结构 —— **SDS (Simple Dynamic String)** 开始，揭开它比 C 字符串好用在哪里的秘密。
