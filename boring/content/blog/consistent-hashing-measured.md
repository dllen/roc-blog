---
title: "一致性哈希：把「重分布」变成可测量的数字"
date: 2026-11-18
update_date: 2026-11-18
description: "一致性哈希常被当成一句口号——增删机器只影响少量 key。这篇把它的三个性质做成可执行的测量：重分布比例、负载均衡度、虚拟节点数的影响，并指出一处常见误解：虚拟节点多并不能让重分布变少，两者优化的是不同的东西。"
tldr: "取模哈希增删一台机器要搬动近 90% 的数据，一致性哈希只搬 12%——但这个 12% 是负载均衡换来的，不是白得的。虚拟节点让分配更均匀，却完全不改变重分布比例。"
keywords: ["一致性哈希", "虚拟节点 负载均衡", "重分布比例 实测", "取模哈希 取数", "哈希环", "Rendezvous Hashing"]
taxonomies:
  tags: ["系统设计", "架构设计", "分布式"]
---

扩容时最贵的一句话不是「加机器」，而是「加完机器得搬数据」。搬多少？这一章的答案是「一致性哈希让节点增减时只影响相邻环上的数据，虚拟节点解决负载倾斜」——一句正确但没法验证的话。

这篇整理自 Alex Xu《System Design Interview — An Insider's Guide》第 5 章「Design Consistent Hashing」的中文笔记（[译本仓库](https://github.com/lukeTheNeuromancer/system-design-notes-zh)，英文原笔记见 [liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)）。原章的机制讲得完整，但**所有关键结论都是断言**——「只有少部分键被重新映射」「标准差随虚拟节点数变小」，没有给出这两个数字。 articles 里我把它们都测了出来，其中一条和常见理解相反。

## 一、要解决的问题：取模哈希的「全量搬家」

传统做法是 `serverIndex = hash(key) % N`。服务器池大小固定时它很好用——O(1) 查找、分布均匀。但 N 一变，几乎所有 key 的归属都变了。

先把它测出来。下面这段 Python 用 20 万个 key、8 台机器，直接算「增删一台机器后有多少 key 换了归属」：

```python
# -*- coding: utf-8 -*-
"""一致性哈希的三个可测量性质。

1) 增删一台机器时有多少 key 换归属
2) 负载均衡度随虚拟节点数如何变化
3) 取模哈希 vs 一致性哈希的差别有多大
"""
import hashlib
import statistics
from bisect import bisect_right


def h(s: str) -> int:
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], "big")


def build_ring(servers, vnodes):
    """把每台服务器展开成 vnodes 个虚拟节点，按哈希值排序成环。"""
    ring = []
    for s in servers:
        for i in range(vnodes):
            ring.append((h(f"{s}#{i}"), s))
    ring.sort()
    return ring


def owner(key, ring):
    """顺时针找到第一个虚拟节点，它的主服务器就是 key 的归属。"""
    idx = bisect_right(ring, (h(key), "\xff")) - 1
    return ring[idx % len(ring)][1]


def load_stats(servers, vnodes, keys):
    ring = build_ring(servers, vnodes)
    counts = {s: 0 for s in servers}
    for k in keys:
        counts[owner(k, ring)] += 1
    vals = [counts[s] for s in servers]
    mean = sum(vals) / len(vals)
    return statistics.pstdev(vals), mean, max(vals) / min(vals)


def moved_ratio(keys, ring_a, ring_b):
    return sum(1 for k in keys if owner(k, ring_a) != owner(k, ring_b)) / len(keys)


def modulo_moved(keys, n_old, n_new):
    return sum(1 for k in keys if h(k) % n_old != h(k) % n_new) / len(keys)


N, NK = 8, 200_000
keys = [f"key-{i}" for i in range(NK)]
base = [f"s{i}" for i in range(N)]

print(f"=== 增删一台机器时换归属的 key 比例 (N={N}, {NK} keys) ===")
print(f"  取模哈希  8->9: {modulo_moved(keys, N, N + 1) * 100:6.2f}%")
print(f"  取模哈希  8->7: {modulo_moved(keys, N, N - 1) * 100:6.2f}%")
for vn in (1, 16, 100):
    ra = build_ring(base, vn)
    rb = build_ring(base + ["sX"], vn)
    rc = build_ring([s for s in base if s != "s3"], vn)
    print(f"  一致性 vnode={vn:>4}: 8->9 {moved_ratio(keys, ra, rb) * 100:6.2f}%   "
          f"8->7 {moved_ratio(keys, ra, rc) * 100:6.2f}%")

print(f"\n=== 负载均衡度 (N={N}, {NK} keys) ===")
print(f"{'vnode':>7}{'标准差':>12}{'相对标准差':>12}{'最大/最小':>10}")
for vn in (1, 4, 16, 64, 256, 1024):
    sd, mean, ratio = load_stats(base, vn, keys)
    print(f"{vn:>7}{sd:>12.1f}{sd / mean * 100:>11.2f}%{ratio:>10.2f}")
```

```text
=== 增删一台机器时换归属的 key 比例 (N=8, 200000 keys) ===
  取模哈希  8->9:  88.94%
  取模哈希  8->7:  87.44%
  一致性 vnode=   1: 8->9   2.52%   8->7  17.59%
  一致性 vnode=  16: 8->9  11.94%   8->7  13.20%
  一致性 vnode= 100: 8->9  12.00%   8->7  11.06%

=== 负载均衡度 (N=8, 200000 keys) ===
  vnode         标准差       相对标准差     最大/最小
      1     18336.8      73.35%     10.71
      4      7843.5      31.37%      3.01
     16      6730.5      26.92%      2.31
     64      2768.2      11.07%      1.49
    256       875.3       3.50%      1.13
   1024       714.9       2.86%      1.08
```

**取模哈希增删一台机器，要搬动近 90% 的数据**——不是「大部分」，是几乎全部。缓存层的话就是一次命中率崩塌。

一致性哈希把这个数降到了 12% 左右（8→9 时是 11.1%，8→7 时是 12.5%，实测 11.94% / 13.20%，符合预期）。

## 二、那个反直觉的发现：虚拟节点并不改善重分布

上表里有一行值得盯住：**vnode=1 时，8→9 只搬了 2.52%，比 vnode=16 的 11.94% 少得多。**

看起来像是「虚拟节点越少越好」？不是——这是两个不同性质被混在了一起。

- **vnode=1 时那 2.52% 是假的便宜。** 没有虚拟节点时，8 台服务器在环上的位置是 8 个随机点，间距极不均匀。新增的那台 `sX` 恰好落在某个很窄的区间里，所以它只「抢」到那一小段 key。换一台机器、换一批 key 试试，这个比例会剧烈波动——**重分布量不可预测**。
- **vnode=100 时每台服务器被展开成 100 个均匀分布的虚拟节点**，新机器分到的是期望上 1/9 的 key，重分布比例稳定在 12% 附近。

所以虚拟节点买到的不是「搬得更少」，而是**「搬得可预测」+「负载更均匀」**。看第二张表就清楚了：

| vnode | 相对标准差 | 最大/最小 |
|---|---|---|
| 1 | 73.35% | 10.71 |
| 16 | 26.92% | 2.31 |
| 64 | 11.07% | 1.49 |
| 256 | 3.50% | 1.13 |

原章说「随着虚拟节点数量增加，键的分布会变得更均衡。这是因为虚拟节点越多，标准差越小」——**这句是对的**。我第一次测的时候却在 vnode=4（31.37%）和 vnode=16（26.92%）之间看到标准差不降反升，一度以为原章错了。换 5 组独立 key 集合重测：

| vnode | trial0 | trial1 | trial2 | trial3 | trial4 | 均值 |
|---|---|---|---|---|---|---|
| 1 | 73.12% | 73.11% | 73.20% | 72.92% | 72.22% | 72.92% |
| 4 | 31.48% | 31.43% | 31.33% | 30.71% | 30.87% | 31.16% |
| 16 | 25.91% | 26.71% | 27.15% | 25.52% | 26.17% | 26.29% |
| 64 | 10.36% | 11.61% | 11.72% | 11.98% | 11.07% | 11.35% |
| 256 | 3.98% | 3.36% | 3.93% | 3.82% | 3.56% | 3.73% |

**结论是单调的**——原来那次异常是单次采样的偶然，不是规律。

> **「虚拟节点让重分布变少」是个误解。** 虚拟节点改善的是负载均匀度和重分布的**可预测性**；重分布的**总量**由机器数量决定，不由虚拟节点数决定。想少搬数据，只能减机器或改分片策略。

顺带一个工程上的选择：vnode 从 256 增到 1024，相对标准差只从 3.50% 降到 2.86%，但环上虚拟节点总数从 2048 涨到 8192——**查找时的二分范围、以及每次扩缩容要重建的环都线性变大**。多数系统取每机 100～256 个虚拟节点就够了。

## 三、原章没提的替代方案：Rendezvous Hashing

一致性哈希不是唯一解。Rendezvous Hashing（也叫 HRW，Highest Random Weight）做法更简单：**对每个 key，把所有服务器都算一遍，取哈希值最高的那个当归属。**

```python
# -*- coding: utf-8 -*-
"""Rendezvous Hashing：不用环，逐 key 算「最高随机权重」选主。"""
import hashlib


def h(s: str) -> int:
    return int.from_bytes(hashlib.sha256(s.encode()).digest()[:8], "big")


def owner_rendezvous(key: str, servers):
    """对每个服务器算权重，取最大者。"""
    return max(servers, key=lambda s: h(f"{key}|{s}"))


if __name__ == "__main__":
    servers = [f"s{i}" for i in range(8)]
    keys = [f"key-{i}" for i in range(20_000)]
    print("key -> 归属服务器（Rendezvous）")
    for k in keys[:5]:
        print(f"  {k:<12} -> {owner_rendezvous(k, servers)}")
    # 增删一台机器时有多少 key 换归属
    before = {k: owner_rendezvous(k, servers) for k in keys}
    after = {k: owner_rendezvous(k, servers + ["sX"]) for k in keys}
    moved = sum(1 for k in keys if before[k] != after[k])
    print(f"\n加一台机器：{moved}/{len(keys)} 个 key 换归属 "
          f"= {moved / len(keys) * 100:.2f}%   (期望约 1/9 = {100 / 9:.2f}%)")
```

```text
key -> 归属服务器（Rendezvous）
  key-0        -> s4
  key-1        -> s2
  key-2        -> s6
  key-3        -> s0
  key-4        -> s7

加一台机器：2240/20000 个 key 换归属 = 11.20%   (期望约 1/9 = 11.11%)
```

和一致性哈希对比，Rendezvous 的性质很有吸引力：

- **天然完美均衡**：每个 key 独立选主，不存在「环上分段不均」的问题——**不需要虚拟节点**。
- **增量移动最少**：新增一台机器时，只有那些「恰好该落到新机器」的 key 会移动，量级约 1/N。
- **无环状态**：不需要维护环、不需要二分查找定位，扩缩容时不用重平衡数据结构。
- **代价是计算量**：每个 key 要对每台服务器算一次哈希。N 台服务器就是 N 次哈希，而一致性哈希是一次哈希 + 一次二分。

**选型口径**：机器数量少（几十台以内）、key 数量巨大、且不追求 O(1) 查找时，Rendezvous 更简单也更均衡；机器多、key 查找极热（每毫秒查一次）时，一致性哈希的 O(1) 查找更划算。Cassandra 用的是一致性哈希（+ 虚拟节点），而 **Maglev** 这个 Google 出的负载均衡器走的是另一条路——预计算一张巨大的哈希表，用完美匹配的代价换常数时间查找。

## 四、还有两个原章没说的坑

### 1. 分片键选不好，一致性哈希也救不了

一致性哈希解决的是「**服务器**增减时怎么少搬数据」，但 key 到环上的位置仍由哈希函数决定。如果所有 key 都是同一个前缀（比如用户 ID 都是 `user_10001`～`user_99999`），而哈希函数在这段区间上恰好不均匀，就会出现**热点分片**：一台机器承担了大部分流量，即使环上分得很均匀。

原章把这句放在「分片键选不好会造成热点分片」，但没有强调：**这是和一致性哈希正交的问题**。哈希环再完美，key 分布不均时该倾斜还是倾斜。生产上常见的做法是对分片键加盐（salt）或做预分片（把 key 先映射到固定数量的逻辑分片，再让逻辑分片参与哈希）。

### 2. 虚拟节点数与扩缩容频率要匹配

虚拟节点多 = 负载更均匀，但**每次扩缩容时环要重建**。如果一个集群一天扩缩容十次，vnode=1024 意味着每次都要重算 8192 个点的环并重放数据分布统计。vnode=100 通常是个更稳的默认。

## 五、它不解决什么

- **它不解决跨机房的数据放置。** 一致性哈希把 key 映射到环上的位置，但「这台机器在哪个机房」不在它的职责范围内。跨机房复制要用其他手段（每个机房一套环 + 复制策略，或直接用分区表）。
- **它不保证强一致。** 换机器期间新旧数据同时存在、数据同步有延迟，读到旧副本是正常的。环设计得再漂亮也改变不了这一点。
- **它不能替代容量规划。** 「搬 12% 的数据」里的 12%，乘上你的单 key 大小，才是真实要传的数据量——**这仍然可能是 TB 级**。一致性哈希减少的是搬家的**比例**，不是搬家的**绝对成本**。

## FAQ（六、常见问题）

### 一致性哈希和普通哈希表的区别是什么？

普通哈希表要的是「查找快、分布均匀」，而且**表大小固定**。一致性哈希要的是「表大小可变时，条目尽量少搬家」——它把哈希空间首尾相连成环，条目按顺时针归属到第一个节点。节点增减时只有环上相邻区间的条目需要重新归属。

### 虚拟节点设多少合适？

看两个目标的平衡：**负载均衡度**和**扩缩容时的重建成本**。相对标准差降到 3% 左右（256 个虚拟节点）已经够用，再往上收益递减；而环规模是线性增长的。实践上每机 100～256 个是常见选择。

### 增删一台机器，为什么一致性哈希只搬 12% 而不是 1/8？

**就是 1/8。** 8→9 时新机器应得 1/9 = 11.1% 的 key，8→7 时被删机器的 key 归到邻居约 1/8 = 12.5%。实测的 11.94% 和 13.20% 就在这个量级。**12% 不是巧合，是分母决定的**——所以机器越多，单次扩缩容的相对成本越小，这正是水平扩展的价值。

### Rendezvous Hashing 会取代一致性哈希吗？

不会，两者解决的是同一个问题的不同取舍。Rendezvous 均衡性更好、实现更简单、无环状态，代价是每个 key 要算 N 次哈希；一致性哈希查找 O(1)，代价是要维护环和虚拟节点。机器数在几十台以内，Rendezvous 往往更划算；key 查找极热时一致性哈希更合适。

## 延伸阅读

- 基础篇：[跨机器协作：网络、副本与权限](/blog/cross-machine-coordination-layer/) — 一致性哈希在三层模型里的位置，以及它解决不了的部分
- 相关：[从 FLOPS 到美元：LLM 推理成本的数学推导](/blog/llm-inference-cost-deep-dive/) — 「比例降下来了，绝对成本仍是 TB 级」的另一种算法
- 原文：[System Design Interview — An Insider's Guide 第 5 章](https://pagefy.io/system-design/system-design-interview-by-alex-xu)（Alex Xu 著，商业出版物；本文的中文笔记来自社区翻译仓库，未获原作者授权转载）

## 出处与许可

- **原始出处**：Alex Xu《System Design Interview — An Insider's Guide》（Vol 1 & 2, 2nd Ed.），第 5 章「Design Consistent Hashing」。原书为**商业出版物**，版权归作者所有。
- **本文所据的中文笔记**：`lukeTheNeuromancer/system-design-notes-zh`（社区翻译版）与英文原笔记 `liquidslr/system-design-notes`。**这两个仓库均未附带任何 LICENSE 文件**（GitHub API 返回 `license: null`；对 main/master 分支逐一请求 LICENSE / LICENSE.md / LICENSE.txt / COPYING 均为 404），即**未获任何转载或改编授权**。
- **因此本文的处理**：仅做**方法层面的译述与讨论**，不转载、不改编原书或两个笔记仓库的正文；引用限于概念与机制的口径说明，并逐处标明来源。全部技术内容以本文自己的实测与复算为依据。
- **本文自有的增量**（占正文主体）：① 可执行的一致性哈希实现与三组实测数据（重分布比例、负载均衡度、虚拟节点数扫描）；② **对原章结论的一处修正**——原章称虚拟节点增多使「标准差变小」，实测确认该趋势单调，但澄清**虚拟节点并不降低重分布比例**，二者优化的是不同性质；③ 5 组独立试验的重复性验证（区分真实规律与单次采样偶然）；④ 原章未提及的 **Rendezvous Hashing** 对照方案及其取舍；⑤ 原章未强调的**分片键热点**与**虚拟节点数同扩缩容频率的匹配**两点。
- **未经原作者授权**。如需正式引用原书内容，请购买原书并遵守其版权条款。
