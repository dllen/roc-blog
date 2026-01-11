---
title: "Redis 源码阅读：14. 命令执行模型 (processCommand)"
date: 2026-01-11T12:00:00+08:00
description: "Redis 接收到命令后是如何执行的？查找命令表、权限校验、参数校验、调用执行函数、记录慢查询日志。"
tags: [Redis, Source Code, Command, Execution]
weight: 14
---

在协议解析完成后，Redis 得到了一个参数数组 `c->argv`，接下来调用 `processCommand` 执行命令。

## 1. 查找命令
Redis 启动时会将所有命令注册到一个全局字典 `server.commands` 中。
`processCommand` 首先根据 `c->argv[0]` (命令名) 在字典中查找对应的 `redisCommand` 结构体。

## 2. 预处理与校验
在真正执行命令前，Redis 会做一系列检查：
1.  **参数个数检查**：检查 `argc` 是否符合 `cmd->arity` 的要求。
2.  **权限检查**：ACL 检查用户是否有权执行该命令。
3.  **内存限制检查**：如果设置了 `maxmemory` 且内存超限，拒绝写入命令。
4.  **持久化检查**：如果上次 BGSAVE 失败且配置了 `stop-writes-on-bgsave-error`，拒绝写入。
5.  **集群检查**：如果是 Cluster 模式，检查 Key 是否属于当前节点，否则返回 MOVED 错误。

## 3. 调用执行
如果所有检查通过，调用 `call(c, CMD_CALL_FULL)`。
`call` 函数会执行 `c->cmd->proc(c)`，即命令对应的 C 函数（如 `setCommand`, `getCommand`）。

## 4. 后处理
命令执行完后，`call` 函数还会做几件事：
1.  **慢查询日志**：如果执行时间超过 `slowlog-log-slower-than`，记录慢日志。
2.  **统计信息**：更新 `cmd->microseconds` 和 `cmd->calls`。
3.  **AOF/Replication**：如果命令修改了数据，将命令传播到 AOF 缓冲区和从节点。
