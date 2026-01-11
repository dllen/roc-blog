---
title: "Redis 源码阅读：24. Lua 脚本"
date: 2026-01-11T22:00:00+08:00
description: "Redis 为什么选择 Lua？脚本原子性是如何保证的？EVAL 命令执行原理。"
tags: [Redis, Source Code, Lua, Scripting]
weight: 24
---

Redis 从 2.6 版本开始引入 Lua 脚本支持（`EVAL` 命令）。
代码位于 `src/scripting.c`。

## 1. 为什么是 Lua？
Lua 是一门轻量级、高性能的脚本语言，专为嵌入式场景设计。
Redis 使用 Lua 脚本主要为了解决 **原子性** 问题：Redis 会将整个脚本作为一个整体执行，中间不会被其他命令插入。

## 2. Lua 环境初始化
Redis 启动时，会创建一个 Lua 虚拟机 (`lua_State`)。
并加载 Redis 专用的 Lua 库，使得脚本中可以调用 `redis.call()` 来执行 Redis 命令。

## 3. 脚本执行 (EVAL)
当执行 `EVAL "return redis.call('get', KEYS[1])" 1 key1` 时：
1.  Redis 会为脚本生成一个 SHA1 摘要。
2.  检查该脚本是否已经缓存（为了避免重复编译）。如果没有，编译并缓存。
3.  将脚本作为一个函数放入 Lua 栈中。
4.  将 KEYS 和 ARGV 参数传入 Lua 环境。
5.  调用 Lua 函数执行。
6.  将 Lua 返回结果转换为 RESP 格式返回给客户端。

## 4. 脚本超时
虽然脚本是原子的，但如果脚本死循环了怎么办？
Redis 提供了 `lua-time-limit` 配置（默认 5秒）。
如果脚本执行时间超过限制，Redis **不会** 强制杀掉脚本（因为这样会破坏原子性，可能导致数据处于中间状态）。
此时 Redis 会开始接受客户端请求，但只允许执行 `SCRIPT KILL` (如果脚本没写数据) 或 `SHUTDOWN NOSAVE`。
