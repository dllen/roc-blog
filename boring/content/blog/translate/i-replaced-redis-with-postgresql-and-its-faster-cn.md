---
title: "用 PostgreSQL 替换 Redis（竟然更快）"
date: "2026-01-09"
description: "翻译自 dev.to《I Replaced Redis with PostgreSQL (And It's Faster)》，讨论如何用 PostgreSQL 统一替代 Redis 做缓存、Pub/Sub 和任务队列，并给出性能与运维对比。"
original_url: "https://dev.to/polliog/i-replaced-redis-with-postgresql-and-its-faster-4942"
---

# 用 PostgreSQL 替换 Redis（竟然更快）

> 原文：I Replaced Redis with PostgreSQL (And It's Faster)  
> 作者：Polliog  
> 首发：DEV Community（dev.to）  
> 链接：<https://dev.to/polliog/i-replaced-redis-with-postgresql-and-its-faster-4942>  
> 说明：由于抓取工具对页面内容有长度限制，本文译文目前覆盖到 PostgreSQL 的 LISTEN/NOTIFY 和 Live Tail 示例之前的部分，其余段落请参考原文。

我原来的 Web 应用栈非常典型：

- PostgreSQL：负责持久化数据
- Redis：负责缓存、Pub/Sub 和后台任务

两套数据库，两套东西要维护，两处潜在故障点。

后来我意识到：**PostgreSQL 其实可以干掉 Redis 做的所有事情。**

于是我直接把 Redis 整个撤掉，看看会发生什么。

---

## 我原来是怎么用 Redis 的

在变更之前，Redis 主要干三件事：

### 1. 缓存（大约占 70% 使用量）

```js
// Cache API responses
await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 3600);
```

### 2. Pub/Sub（大约占 20% 使用量）

```js
// Real-time notifications
redis.publish('notifications', JSON.stringify({ userId, message }));
```

### 3. 后台任务队列（大约占 10% 使用量）

```js
// Using Bull/BullMQ
queue.add('send-email', { to, subject, body });
```

这些用法本身没问题，Redis 完全胜任。但长期下来，我开始越来越不满意这种「一主一辅」的架构。

**痛点主要有：**

- 两套数据库都要做备份
- Redis 吃的是内存，规模一大成本很快上去
- Redis 的持久化机制比较「门道多」
- 应用和 Redis 之间多了一跳网络

---

## 为什么考虑用 PostgreSQL 替换 Redis

### 理由一：成本

**我的 Redis 配置：**

- AWS ElastiCache：2GB，约 \$45/月
- 如果要扩到 5GB，要涨到约 \$110/月

**PostgreSQL：**

- 已经在付 RDS 的钱：20GB 存储约 \$50/月
- 多加 5GB 数据：大约 \$0.50/月

**潜在节省：一个月能省将近 \$100。**

### 理由二：运维复杂度

有 Redis 的时候，你的世界是这样的：

```text
Postgres backup ✅
Redis backup ❓ (RDB? AOF? Both?)
Postgres monitoring ✅
Redis monitoring ❓
Postgres failover ✅
Redis Sentinel/Cluster ❓
```

把 Redis 撤掉之后，世界变成：

```text
Postgres backup ✅
Postgres monitoring ✅
Postgres failover ✅
```

**少了一个移动部件（moving part），整个系统就简单了很多。**

### 理由三：数据一致性

经典问题如下：

```js
// Update database
await db.query('UPDATE users SET name = $1 WHERE id = $2', [name, id]);

// Invalidate cache
await redis.del(`user:${id}`);

// ⚠️ What if Redis is down?
// ⚠️ What if this fails?
// Now cache and DB are out of sync
```

一旦更新数据库和操作缓存不是处在同一个事务里，你就必须考虑各种失败场景：Redis 掉线、网络抖动、重试策略……一大堆边界条件。

而如果所有东西都在 Postgres 里，**事务本身就解决了一致性问题**。

---

## PostgreSQL 特性一：用 UNLOGGED 表做缓存

先看 Redis 版本：

```js
await redis.set('session:abc123', JSON.stringify(sessionData), 'EX', 3600);
```

在 PostgreSQL 里，可以这样建一张缓存表：

```sql
CREATE UNLOGGED TABLE cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_cache_expires ON cache(expires_at);
```

插入或更新缓存：

```sql
INSERT INTO cache (key, value, expires_at)
VALUES ($1, $2, NOW() + INTERVAL '1 hour')
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      expires_at = EXCLUDED.expires_at;
```

读取缓存：

```sql
SELECT value FROM cache
WHERE key = $1 AND expires_at > NOW();
```

定期清理过期数据（可以用 cron 或调度任务跑）：

```sql
DELETE FROM cache WHERE expires_at < NOW();
```

### 什么是 UNLOGGED 表？

UNLOGGED 表有几个关键特性：

- 跳过 WAL（Write-Ahead Log，预写日志）
- 写入速度更快
- 崩溃后数据不会保留（而缓存本来就可以重建）

一个实际测试结果：

```text
Redis SET: 0.05ms
Postgres UNLOGGED INSERT: 0.08ms
```

从纯延迟来看，Postgres 慢了几十微秒，但对于缓存这种场景来说，**已经完全够用**，而且还能少一条网络链路和一整套基础设施。

---

## PostgreSQL 特性二：用 LISTEN/NOTIFY 做 Pub/Sub

有意思的地方来了：PostgreSQL 自带一个很多人都不知道的能力——**原生 Pub/Sub**。

### Redis Pub/Sub 写法

```js
// Publisher
redis.publish('notifications', JSON.stringify({ userId: 123, msg: 'Hello' }));

// Subscriber
redis.subscribe('notifications');
redis.on('message', (channel, message) => {
  console.log(message);
});
```

### PostgreSQL Pub/Sub 写法

发布端（SQL）：

```sql
-- Publisher
NOTIFY notifications, '{"userId": 123, "msg": "Hello"}';
```

订阅端（Node.js + pg）：

```js
// Subscriber (Node.js with pg)
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query('LISTEN notifications');

client.on('notification', (msg) => {
  const payload = JSON.parse(msg.payload);
  console.log(payload);
});
```

### 性能对比

```text
Redis pub/sub latency: 1-2ms
Postgres NOTIFY latency: 2-5ms
```

Postgres 在这里确实稍微慢一点，但：

- 不需要额外的基础设施
- 可以和事务结合使用
- 可以和查询、触发器等能力自然组合

在很多系统里，这点延迟换来的架构简单性是非常划算的。

---

## 小结

到目前为止，我们已经看到：

- 用 **UNLOGGED 表 + JSONB** 可以在 PostgreSQL 里构建一个「够快」的缓存层
- 用 **LISTEN/NOTIFY** 可以覆盖 Redis 的绝大多数 Pub/Sub 场景
- 所有这些能力都运行在同一个数据库里，可以天然享受事务带来的一致性

原文在后续部分还继续介绍了：

- 用 `SKIP LOCKED` 实现任务队列
- 基于 PostgreSQL 的限流实现
- 会话（Session）存储与 JSONB 的组合
- 一些真实的性能基准测试和迁移策略

鉴于抓取接口的长度限制，这里就不逐段翻译后半部分了。对于完整细节、数字和代码示例，可以直接阅读原文：

<https://dev.to/polliog/i-replaced-redis-with-postgresql-and-its-faster-4942>

如果你现在的系统已经在使用 PostgreSQL，而 Redis 只承担缓存、Pub/Sub 或轻量队列这类职责，那么认真评估一下：**是否真的需要再多养一套 Redis 基础设施？** 很多时候，PostgreSQL 这套「一站式方案」已经足够，并且会让你的系统在一致性、可运维性方面更容易掌控。

