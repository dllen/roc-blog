---
title: "扩展的每一步都在换瓶颈：一份可计算的扩展阶梯"
date: "2026-11-25"
description: "《系统设计面试内幕指南》第 1 章的骨架是十二步扩展阶梯：单机、拆数据库、主从、缓存、CDN、无状态、多机房、消息队列、分片。本文不复述译文，而是把这条阶梯写成可计算的判据——每加一层瓶颈换到哪里、加机器有没有用、缓存究竟买到了什么。"
tldr: "扩展不是加机器，而是一层层把瓶颈挪走：加读副本解决不了写瓶颈，缓存买到的是读压力而不是端到端吞吐，LFU 在分布漂移后会掉到 0.127——淘汰策略的差别要按漂移来算，不按静态命中率算。"
keywords: ["系统设计", "水平扩展", "分片", "缓存淘汰策略", "扩展瓶颈"]
taxonomies:
  tags: ["系统设计", "架构设计", "读书笔记", "缓存"]
---

扩展的每一步都在换瓶颈——这是读完 Alex Xu《系统设计面试内幕指南》第 1 章最该带走的一句话。这一章把「从单机到百万用户」拆成十二步：拆数据库、垂直还是水平扩展、加负载均衡、主从复制、缓存、CDN、无状态 Web 层、多数据中心、消息队列、日志指标与自动化，最后是数据库的分片。

这篇不复述译文，也不搬运中文译本的任何段落。它做三件事：用自己的话复述这条阶梯的骨架，然后补两个能跑的模型——**一个把「加机器有没有用」写成可计算的判据**，**一个把「缓存什么时候会被打穿」和「LRU/LFU 到底谁好」写成可复现的实验**。

## 口径说明：这是导读，不是改写

- 原书：*System Design Interview — An Insider's Guide*（Alex Xu，Vol 1 & 2, 2nd Ed.）。
- 英文笔记仓库：[liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)；中文译本仓库：[lukeTheNeuromancer/system-design-notes-zh](https://github.com/lukeTheNeuromancer/system-design-notes-zh)。
- 许可状态：2026-11-25 实测，两个仓库的 `LICENSE` 文件在 `main` 与 `master` 分支上用 raw 通道取都返回 **404**，仓库网页本身返回 200；**未能确认上游许可**。原书是商业出版物。因此这篇按导读式处理：只复述章节骨架（章节名与结构属于事实性目录信息），**不引用译文原文、不逐段翻译**，正文主体是自写的模型与判断。

## 一、扩展阶梯的骨架

把十二步压成一条链，每一步都在解决上一步留下的问题：

| 步骤 | 解决什么 | 留下什么 |
|---|---|---|
| 单机 | 先能跑起来 | 一切都是单点 |
| 数据库单独部署 | 读写资源分开调度 | 数据库成了新的中心 |
| 垂直扩展 vs 水平扩展 | 垂直省事但有物理与成本上限、故障域更大 | 水平扩展要求组件无状态 |
| 负载均衡器 | 把流量分给多台 | 写路径仍然只有一个出口 |
| 主从复制 | 读可以水平扩 | **写还是单点**，复制有延迟 |
| 缓存 | 热点读不回源 | 一致性、失效、淘汰、缓存自身单点 |
| CDN | 静态内容就近出 | 费用、过期策略、失效时机 |
| 无状态 Web 层 | 会话外置，Web 层可随意扩 | 会话存储成了新依赖 |
| 多数据中心 | 可用性与延迟 | 数据同步、流量重定向、部署一致性 |
| 消息队列 | 异步化与削峰 | 顺序、重复、积压、死信 |
| 日志指标自动化 | 看得见、才能自动扩 | —— |
| 数据库分片 | 数据层也能水平扩 | 重新分片、热点键、跨分片 Join |

这张表里最容易被跳过的是第三行和第五行的组合：**加机器的前提是先有东西可以加**——主从复制加的是读副本，缓存救的是读，Web 层无状态才谈得上自动扩缩容。顺序错了，加机器就是加成本。

## 二、增量一：把「加机器有没有用」写成可计算的判据

「瓶颈会转移」是句口号，可以变成一张能算的表。模型给每层一个容量参数，端到端上限取各层的最小值，瓶颈落在最小的那一层：

```python
"""扩展阶梯：每加一层，瓶颈就换地方——把它写成可计算的判据。

参数是示例值（不是任何真实系统的实测）。模型只做一件事：
给定当前架构，算出端到端最大服务率、瓶颈落在哪一层、「加机器有没有用」。
"""

WEB_PER_SERVER = 800.0      # 单台 Web 服务器吞吐上限（req/s）
DB_READ_PER_NODE = 2000.0   # 单个 DB 节点读吞吐（req/s）
DB_WRITE_PER_NODE = 1200.0  # 单个 DB 节点写吞吐（req/s）
READ_SHARE = 0.8            # 读占比


def analyze(web_servers, read_replicas, writers, cache_hit=0.0):
    """返回 (端到端最大服务率, 瓶颈层, DB 读需求占用的读容量比)。

    读侧：只有未命中缓存的读请求才打到 DB，因此同样的 DB 读容量能支撑更高的端到端吞吐。
    写侧：写不进缓存，读副本也帮不上，写节点数直接决定上限。
    """
    web_cap = WEB_PER_SERVER * web_servers
    db_read_nodes = DB_READ_PER_NODE * read_replicas
    read_end_to_end = db_read_nodes / (1.0 - cache_hit) if cache_hit < 1.0 else float("inf")
    write_end_to_end = DB_WRITE_PER_NODE * writers
    caps = {"Web 层": web_cap, "数据库读": read_end_to_end, "数据库写": write_end_to_end}
    bottleneck = min(caps, key=lambda k: caps[k])
    # DB 读侧被占用的比例：端到端吞吐下，真正打到 DB 的读请求占读容量的多少
    read_load_ratio = 1.0
    return caps[bottleneck], bottleneck


STAGES = [
    ("单机（不扩展）", 1, 1, 1, 0.0),
    ("+ 负载均衡 + 3 台 Web", 3, 1, 1, 0.0),
    ("数据库主从：1 写 3 读", 3, 3, 1, 0.0),
    ("+ 缓存（命中 90%）", 3, 3, 1, 0.9),
    ("Web 扩到 20 台", 20, 3, 1, 0.9),
    ("分片：4 写 × 3 读", 20, 12, 4, 0.9),
]

print("%-26s %-10s %-10s %s" % ("架构阶段", "最大服务率", "瓶颈层", "这一步加机器有用吗"))
prev = None
for name, web, replicas, writers, hit in STAGES:
    tp, bn = analyze(web, replicas, writers, hit)
    if prev is None:
        verdict = "—"
    elif tp > prev[0] * 1.001:
        verdict = "有用（%d -> %d req/s，瓶颈移到「%s」）" % (prev[0], tp, bn)
    else:
        verdict = "无效（瓶颈仍在「%s」，容量没涨）" % bn
    print("%-26s %-10.0f %-10s %s" % (name, tp, bn, verdict))
    prev = (tp, bn)

print()
print("同一组参数下，缓存到底买到了什么：")
for hit in (0.0, 0.5, 0.9, 0.99):
    tp, bn = analyze(3, 3, 1, hit)
    db_read_nodes = DB_READ_PER_NODE * 3
    # 端到端吞吐取 1200（写瓶颈）时，真正打到 DB 的读请求量
    read_reqs = READ_SHARE * 1200 * (1 - hit)
    print("  命中率 %.2f -> 端到端上限 %.0f req/s（瓶颈 %s），打到 DB 的读请求 %.0f req/s，占读容量 %.1f%%"
          % (hit, tp, bn, read_reqs, 100.0 * read_reqs / db_read_nodes))
```

```text
架构阶段                       最大服务率      瓶颈层        这一步加机器有用吗
单机（不扩展）                    800        Web 层      —
+ 负载均衡 + 3 台 Web           1200       数据库写       有用（800 -> 1200 req/s，瓶颈移到「数据库写」）
数据库主从：1 写 3 读              1200       数据库写       无效（瓶颈仍在「数据库写」，容量没涨）
+ 缓存（命中 90%）               1200       数据库写       无效（瓶颈仍在「数据库写」，容量没涨）
Web 扩到 20 台                1200       数据库写       无效（瓶颈仍在「数据库写」，容量没涨）
分片：4 写 × 3 读               4800       数据库写       有用（1200 -> 4800 req/s，瓶颈移到「数据库写」）

同一组参数下，缓存到底买到了什么：
  命中率 0.00 -> 端到端上限 1200 req/s（瓶颈 数据库写），打到 DB 的读请求 960 req/s，占读容量 16.0%
  命中率 0.50 -> 端到端上限 1200 req/s（瓶颈 数据库写），打到 DB 的读请求 480 req/s，占读容量 8.0%
  命中率 0.90 -> 端到端上限 1200 req/s（瓶颈 数据库写），打到 DB 的读请求 96 req/s，占读容量 1.6%
  命中率 0.99 -> 端到端上限 1200 req/s（瓶颈 数据库写），打到 DB 的读请求 10 req/s，占读容量 0.2%
```

三处结果值得停下来：

**第一，主从复制这一步被判为「无效」不是模型出错，而是重点。** 加了 3 个读副本之后端到端上限纹丝不动（1200 req/s），因为写容量没变——读副本再多也帮不上写路径。这一步在教程里常被当成「加机器」的同义词，在模型里它根本不是扩容。

**第二，加缓存同样被判为「无效」，但它买到的东西在表下面那四行里。** 命中率从 0 到 0.99，打到 DB 的读请求从 960 req/s 降到 10 req/s，占读容量的比例从 16% 降到 0.2%。**端到端吞吐一点没涨，读侧压力几乎被清空**——所以缓存的收益不在吞吐上，而在「你终于可以把读副本留给分析型查询」这类事上。只看最大服务率会误判缓存无用，只看 DB 压力会误判吞吐已经解决。

**第三，分片那一步之所以「有用」，是因为它改的是写节点数。** 4 写 × 3 读把上限从 1200 抬到 4800，瓶颈仍在写——下一步该想的是写分片键、跨分片事务，而不是继续加 Web 机器。

模型的判据只有一条：**这一步之后端到端上限是否上升**。上升就是有效扩容，没上升就是加成本。瓶颈层的名字是副产品，它告诉你下一步该动哪一层。

## 三、增量二：缓存的两件小事——漂移与打穿

### 淘汰策略：静态命中率骗人

缓存章节通常会介绍 LRU 与 LFU，并给一个「LRU 更常用」的结论。真的吗？把它写成实验：2000 个键、200 的缓存容量、30% 的请求均匀散开、70% 落在 50 个热键上，然后**让热区整体漂移到另一批键**，两个阶段共用同一个缓存实例：

```python
"""缓存层的容量取舍、分布漂移下的淘汰策略之争，以及三种失效模式的机械判据。

访问分布用幂律形状模拟，序列固定种子可复现；两个阶段共用同一个缓存实例，
这样「分布漂移后策略要多久才能适应」才是被测量的东西。
"""

import random
from collections import OrderedDict


class LRUCache:
    """淘汰最久未用的。"""

    def __init__(self, cap):
        self.cap = cap
        self.data = OrderedDict()

    def get(self, key):
        if key in self.data:
            self.data.move_to_end(key)
            return True
        return False

    def put(self, key):
        self.data[key] = 1
        self.data.move_to_end(key)
        while len(self.data) > self.cap:
            self.data.popitem(last=False)


class LFUCache:
    """按访问频次淘汰；频次相同时淘汰最久未用的。"""

    def __init__(self, cap):
        self.cap = cap
        self.freq = {}
        self.data = OrderedDict()

    def get(self, key):
        if key in self.data:
            self.freq[key] += 1
            self.data.move_to_end(key)
            return True
        return False

    def put(self, key):
        if key in self.data:
            self.freq[key] += 1
            self.data.move_to_end(key)
            return
        self.data[key] = 1
        self.freq[key] = 1
        while len(self.data) > self.cap:
            victim = min(self.data.keys(), key=lambda k: (self.freq[k], list(self.data).index(k)))
            del self.data[victim]
            self.freq.pop(victim, None)


def skewed_key(rng, hot_lo, hot_hi, n_keys):
    """70% 请求落在 [hot_lo, hot_hi) 这个热区间，其余均匀散开。"""
    if rng.random() < 0.7:
        return rng.randint(hot_lo, hot_hi - 1)
    return rng.randrange(n_keys)


def phase(cache, cap, n_keys, requests, hot_lo, hot_hi, seed):
    """在一段请求序列上跑，返回命中率。"""
    rng = random.Random(seed)
    hits = 0
    for _ in range(requests):
        k = skewed_key(rng, hot_lo, hot_hi, n_keys)
        if cache.get(k):
            hits += 1
        else:
            cache.put(k)
    return hits / requests


N_KEYS = 2000
CAP = 200
REQUESTS = 30000
print("键数=%d 缓存容量=%d 每阶段请求=%d（两个阶段共用同一个缓存实例）" % (N_KEYS, CAP, REQUESTS))

results = {}
for cls in (LRUCache, LFUCache):
    cache = cls(CAP)
    hr1 = phase(cache, CAP, N_KEYS, REQUESTS, 0, 50, 20261125)
    hr2 = phase(cache, CAP, N_KEYS, REQUESTS, 1000, 1050, 20261126)
    results[cls.__name__] = (hr1, hr2)

print()
print("阶段一：热区固定在 0-49")
for name, (hr1, _) in results.items():
    print("  %-10s 命中率 %.3f" % (name, hr1))
print("阶段二：热区漂移到 1000-1049（其余流量不变）")
for name, (_, hr2) in results.items():
    print("  %-10s 命中率 %.3f" % (name, hr2))
print("  漂移后 LRU 相对 LFU 的领先 = %+.3f" % (results["LRUCache"][1] - results["LFUCache"][1]))

hr_static = results["LRUCache"][0]
print()
print("后端负载：无缓存时后端要接 1.000 倍请求；命中率 %.3f 时后端只接 %.3f 倍，"
      "等价于把后端的有效处理能力放大 %.2f 倍" % (hr_static, 1 - hr_static, 1 / (1 - hr_static)))

print()
print("=== 三种失效模式的机械判据 ===")
DB_CONCURRENCY = 50.0


def verdict(name, concurrent):
    return "%s: 并发 %.0f vs 后端可承载 %.0f -> %s" % (
        name, concurrent, DB_CONCURRENCY, "会被打穿" if concurrent > DB_CONCURRENCY else "扛得住")


print(" " + verdict("[雪崩] 同一时刻过期 800 个键", 800))
print(" " + verdict("[雪崩·修复] 过期时间加抖动后同时过期 20 个键", 20))
print(" " + verdict("[击穿] 热键过期瞬间 120 并发", 120))
print(" " + verdict("[击穿·修复] 单飞/互斥重建后并发 1", 1))
MISS_RATIO = 0.25
print(" [穿透]: 不存在键的请求占比 %.2f，负缓存关 -> 无效请求原样打到后端 %.2f" % (MISS_RATIO, MISS_RATIO))

print()
print("判据边界：阈值是示例参数，只看请求量不看单请求代价；")
print("真实系统还要看后端单请求耗时、连接池大小与缓存重建速率。")
```

```text
键数=2000 缓存容量=200 每阶段请求=30000（两个阶段共用同一个缓存实例）

阶段一：热区固定在 0-49
  LRUCache   命中率 0.723
  LFUCache   命中率 0.724
阶段二：热区漂移到 1000-1049（其余流量不变）
  LRUCache   命中率 0.724
  LFUCache   命中率 0.127
  漂移后 LRU 相对 LFU 的领先 = +0.597

后端负载：无缓存时后端要接 1.000 倍请求；命中率 0.723 时后端只接 0.277 倍，等价于把后端的有效处理能力放大 3.62 倍

=== 三种失效模式的机械判据 ===
 [雪崩] 同一时刻过期 800 个键: 并发 800 vs 后端可承载 50 -> 会被打穿
 [雪崩·修复] 过期时间加抖动后同时过期 20 个键: 并发 20 vs 后端可承载 50 -> 扛得住
 [击穿] 热键过期瞬间 120 并发: 并发 120 vs 后端可承载 50 -> 会被打穿
 [击穿·修复] 单飞/互斥重建后并发 1: 并发 1 vs 后端可承载 50 -> 扛得住
 [穿透]: 不存在键的请求占比 0.25，负缓存关 -> 无效请求原样打到后端 0.25

判据边界：阈值是示例参数，只看请求量不看单请求代价；
真实系统还要看后端单请求耗时、连接池大小与缓存重建速率。
```

阶段一里 LRU 0.723、LFU 0.724，**几乎一样**——静态偏斜分布下谈不出谁强。阶段二热区漂移后，LRU 0.724（很快适应），LFU **0.127**（被旧热度拖住，新热键刚进缓存就被当作低频键淘汰），LRU 一口气领先 0.597。

这不是 LFU 实现有问题，而是它的定义使然：**它记着「过去有多热」，而热点的定义是会变的**。所以「LRU vs LFU」的正确答案取决于一个前提问题——**你的访问分布是稳定的吗？** 稳定且偏斜，LFU 略优；会漂移（热点随事件迁移、热门内容换季、攻击流量转移），LRU 的适应速度是决定性的。这也是为什么生产上常见 LRU 或近似算法（如 ARC 这种自适应方案、SLRU 这种分段 LRU，以及 Redis 的近似 LRU）而不是纯 LFU：**给热点一个半衰期，而不是永久记账**。

### 什么时候缓存会被打穿

三种失效模式在教程里是三个名词，在系统里是三个可以先算出来的数。判据只有一条：**同一瞬间落到后端的并发请求数，是否超过后端能承受的并发**。

上面脚本输出的最后六行对应三种模式与它们的修复：雪崩是同时过期的键太多（800 个 vs 后端能扛 50 → 打穿；给过期时间加抖动后同时过期 20 个 → 扛得住）；击穿是单个热键过期瞬间的并发（120 → 打穿；用单飞/互斥重建把并发压到 1 → 扛得住）；穿透是请求不存在的键，缓存永远不命中（占比 0.25 的无效请求原样打到后端，需要负缓存或布隆过滤器）。

## 四、这篇不重复已发的内容

已发文章里已有[一致性哈希：把「重分布」变成可测量的数字](/blog/consistent-hashing-measured/)——所以这篇**不复述**「什么时候需要重新分片、怎么用一致性哈希减少迁移量」，那部分只留一句提要与链接；分片键选得均不均匀、热点键怎么单独处理，属于那篇的范围。同样，已发的[跨机器协作：网络会骗你](/blog/cross-machine-coordination-layer/)处理的是多机通信的延迟与失败语义，与本文的「容量在哪一层」不重叠。

## 五、这两个模型判不了什么

- **参数是示例值。** 800 req/s 的单机吞吐、1200 req/s 的写节点、2000 req/s 的读节点都是编的；模型的价值在结构（端到端上限取各层最小值、读副本只扩读、缓存只减读负载），不在具体数字。
- **没有延迟与故障。** 模型假设各层不互相等待、没有超时重试、没有部分失败；真实系统里瓶颈常常是「锁等待」或「跨机房 RTT」，不是吞吐上限。
- **缓存实验只测了两种分布形状。** 幂律 + 漂移是一种，还有突发、扫描式遍历、攻击流量（全部 key miss）没测；命中率 0.723 来自这个具体形状，不是通用结论。
- **失效模式判据只看请求量。** 后端单请求耗时、连接池大小、缓存重建速率都没进模型——同样的 50 并发，慢查询和快查询对后端的意义完全不同。

## FAQ（六、常见问题）

**Q：主从复制不是提升读性能的吗？为什么模型里说它「无效」？**

A：它对**读**有效，对**端到端吞吐**无效——只要写路径是瓶颈。模型里加了 3 个读副本之后读侧容量翻了几倍，但写上限没动，端到端上限被写卡住。这不意味着主从没用：它让读副本可以扛走大部分读流量，从而让你在**不扩容**的前提下把端到端上限维持住。判据要看你的瓶颈在哪一层。

**Q：缓存命中率做到 90% 就够了吗？**

A：看瓶颈在哪。命中率从 0.9 提到 0.99，在写瓶颈的系统里端到端吞吐一点不变；它只在读是瓶颈时直接换算成吞吐。另外还要看**键的分布形状**：0.9 的命中率可能来自 90% 的请求打在 1 个热键上——那么缓存其实只服务了一条链路，其余容量是闲的。

**Q：既然 LRU 在漂移下更稳，为什么很多系统还在用 LFU？**

A：因为很多系统的访问分布**确实稳定**（同一批内容反复被读），此时 LFU 的历史计数是有价值的信息，而不是包袱。另外纯 LFU 少见的原因是实现成本与冷启动：空缓存时它没有频次可依，通常要退化成 LRU 或加一个「 newcomer」区。

**Q：这些结论能直接用在什么规模上？**

A：模型的结论与规模无关，它描述的是**依赖关系**（谁依赖谁、瓶颈会在哪一层出现）。真要用它做容量规划，把示例参数换成你的实测值（单节点压测吞吐、读写比、缓存命中率），它就是一个粗算器；精度取决于你的参数，而不是它的结构。

## 出处与许可

- 原书：*System Design Interview — An Insider's Guide*（Alex Xu，Vol 1 & 2, 2nd Ed.）——本章骨架（第 1 章 Scale from Zero to Millions of Users）为其目录与要点。
- 英文笔记仓库：[liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)；中文译本仓库：[lukeTheNeuromancer/system-design-notes-zh](https://github.com/lukeTheNeuromancer/system-design-notes-zh)。
- **许可状态**：2026-11-25 实测，两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均 404，仓库网页 200，**上游许可未能确认**；原书为商业出版物。故本篇为导读式：只复述章节骨架，不引用译文原文或原书段落，正文主体为自写模型与判断。
- 本文两个脚本为自写增量，仅依赖 Python 标准库（`random`、`collections`），在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致。
