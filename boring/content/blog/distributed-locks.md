---
title: "分布式锁实践与对比：Redis、ZooKeeper、etcd、数据库"
date: 2025-10-19T12:35:00+08:00
update_date: 2025-10-19T12:35:00+08:00
description: "系统梳理分布式锁的实现方案与取舍，结合《数据密集型应用》与高评分博客（如左耳朵耗子）给出不同场景的最佳实践与示例。"
tags: ["分布式系统", "锁", "一致性", "Redis", "ZooKeeper", "etcd", "数据库"]
---

## 背景与目标
分布式锁用于在多节点间对共享资源的互斥访问进行协调。正确的分布式锁不仅要“拿到锁”，更要保证在网络分区、节点崩溃、时钟漂移等故障下行为可预期。《数据密集型应用》提出关键原则：
- 使用线性一致（linearizable）的存储实现锁，或在架构中引入防护策略（如 fencing token）。
- 锁只是建议（advisory），业务层仍需幂等与回滚保障。
- 赋予锁“租约”（lease/TTL）并持续续约；结合会话（session）与心跳释放过期锁。
- 引入 **fencing token**（单调递增版本号）防止旧持有者在失效后仍然操作资源。

## 评估维度
- 正确性与一致性：是否线性一致、是否能防止“双主/脑裂”。
- 可用性与容灾：跨机房、网络抖动、故障恢复能力。
- 公平性：是否支持排队、公平获取（FIFO）。
- 性能与成本：吞吐、延迟、存储/运维代价。
- 易用性：API成熟度、客户端生态、部署复杂度。

## Redis 分布式锁
- 基本模式：`SET key value NX PX ttl` 获取，释放用 Lua 保证原子性：
```lua
-- 仅当持有者匹配时删除
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
```
- 续约：定期延长 TTL，避免长 GC/Stop-The-World导致过期；需守护线程。
- Redlock：通过多主实例多数派获取锁，但在强严格一致性语义上存在争议；不建议用于需要线性一致的关键场景。
- 适用场景：同机房内的“去重/防重复任务启动”、非关键资源短持锁；配合幂等和回滚机制。
- 风险与缓解：
  - 网络分区与主从切换可能导致锁可见性不一致；避免跨机房关键路径。
  - TTL不是严格终止条件，过期后旧持有者仍可能继续操作；加 **fencing token** 在资源侧校验。

## ZooKeeper 分布式锁
- 核心机制：临时节点（ephemeral）+ 顺序节点（sequential）。创建 `/${lock}/lock-` 顺序临时节点；序号最小者获锁，其余监听前驱节点删除后再竞争。
- 特性：强一致（基于 Zab），具备公平性（排队），会话失效自动释放。
- 客户端：推荐使用 Curator Recipes（`InterProcessMutex` 等），处理好 Watch 一次性触发与重入。
- 适用场景：需要强一致与公平的分布式协调（调度器、主选举、全局限流）。
- 风险与缓解：
  - 群聚效应（herd effect）：尽量只监听前驱而非根目录，避免大量节点同时唤醒。
  - 会话过期与网络抖动：务必实现重连与锁重获逻辑。

## etcd 分布式锁
- 推荐模式：`lease` + `Txn(CAS)`。
```go
// 伪代码：创建带租约的锁键
lease := Grant(ttl)
keepalive(lease)
resp := Txn().If(key_not_exists).Then(Put(key, owner, WithLease(lease))).Commit()
if resp.Succeeded { /* got lock; use resp.Header.Revision 作为 fencing token */ }
```
- 特性：线性一致（Raft），原生支持 `lock` API 与租约续约；可用 `revision`/`mod_revision` 作为 **fencing token**。
- 适用场景：对一致性要求高的核心路径（支付、订单、分布式调度）。
- 风险与缓解：
  - 网络分区与领导者选举：设计重试与指数退避，降级为读一致或只读模式。
  - 续约失败处理：监控 keepalive 延迟与失败率，及时释放与重获。

## 数据库分布式锁
- 模式一：行级锁/状态行 + 唯一约束 + CAS：
```sql
-- 获取锁
UPDATE locks SET owner = :who, version = version + 1
WHERE name = :resource AND (owner IS NULL OR expired_at < NOW());
-- 判断影响行数以确定是否拿到锁；version 作为 fencing token
```
- 模式二：PostgreSQL Advisory Lock：`SELECT pg_try_advisory_lock(hashtext(:resource));`
- 模式三：MySQL `GET_LOCK('res', timeout)` 与 `RELEASE_LOCK('res')`（注意复制一致性与可靠性）。
- 特性：易用、无需新组件；但公平性与 TTL 支持有限，跨机房一致性取决于复制架构。
- 适用场景：单库/同机房、任务编排/批处理；或过渡方案。
- 风险与缓解：
  - 会话崩溃释放语义不一致（不同数据库实现差异）；建议显式心跳与过期字段。
  - 复制延迟（主从）可能导致锁可见性问题；关键路径谨慎使用。

## 关键实践：Fencing Token
- 原理：每次成功获取锁生成单调递增的令牌（版本号）。资源侧仅接受令牌更大的写入，防止“旧持有者”在锁过期/网络分区后继续写。
- 示例：将 `version`/`revision`随写入一起校验；存储系统需具备原子比较能力（CAS/upsert）。

## 场景最佳方案
- 强一致、关键业务（支付/订单/配置变更）：优先 etcd/ZooKeeper + 租约续约 + fencing token。
- 公平排队（调度/限流/分布式队列）：ZooKeeper 顺序节点或 etcd 的队列/锁实现。
- 低一致性需求、短持锁（去重、定时任务防并发）：Redis `SET NX PX` + Lua 释放 + 续约守护；在单机房内使用。
- 单库内任务编排/过渡期：数据库行级锁/Advisory Lock，但避免跨机房关键路径。

## 监控与稳定性
- 监控：锁等待时长、失败率、租约续约延迟、会话过期次数、fencing token 单调性、网络分区事件。
- 降级：锁获取超时触发熔断或改为幂等重试；批任务降速；业务侧容错与回滚。

## 常见坑
- 仅依赖 TTL 作为安全阀门；旧持有者仍可能继续写 => 用 fencing token。
- 忽视幂等与回滚；锁不是万能防线。
- 未处理客户端重连与会话过期；需自动重试与锁重获。
- ZK 监听根目录导致群聚效应；只监听前驱节点。
- Redis 跨机房使用 Redlock 期望强一致；不现实。

## 示例速览
- Redis 获取与释放（Lua）：见上文；确保 `value` 是唯一持有者标识并在释放时核验。
- etcd 事务：`If(key missing) Then Put(key, lease)`；用 `revision` 作为 fencing。
- PostgreSQL Advisory Lock：`pg_try_advisory_lock` + 会话结束自动释放；非线性一致全局锁。

## 参考资料
- 《数据密集型应用》：一致性、锁、Fencing Token 与分布式系统实践。
- 官方文档：
  - Redis SET NX/PX 与 Lua 原子释放
  - ZooKeeper Recipes（Curator）
  - etcd `lease`/`lock`/`txn`
  - PostgreSQL Advisory Lock / MySQL GET_LOCK