---
title: "键值存储的三笔账：法定人数、LSM 放大与再平衡"
date: "2026-11-27"
description: "《系统设计面试内幕指南》第 6 章讲分布式键值存储：一致性哈希与虚拟节点、N/W/R 法定人数、向量时钟、Gossip 故障检测、Cassandra 式读写路径。本文给三个可跑的模型：W+R>N 的穷举、LSM 的三种放大与打平读写比、扩容迁移量与虚拟节点均衡。"
tldr: "法定人数：W+R>N 不是「够用」而是**必要条件**——N=3、W=R=1 时 9 个读组合里有 6 个可能读不到最新写；W=R=2 时交集恒 ≥1。LSM：Leveled 写放大 60×、读 9×、空间 10×；Tiered 写 6×、读 60×、空间 1×，两者在读写比 R/W=1.06 处打平。再平衡：一致性哈希扩容只迁 1/(N+1)（16→17 节点迁 5.18%），取模分片要迁 94%；虚拟节点从 1 加到 1000，负载最大/均值从 3.53x 收敛到 1.05x。"
keywords: ["键值存储", "法定人数", "LSM 写放大", "一致性哈希", "系统设计"]
taxonomies:
  tags: ["系统设计", "架构设计", "读书笔记", "存储系统"]
---

键值存储的三笔账？副本要几个人确认、底层引擎放大多少倍、扩容要搬多少数据。讲义把分布式键值存储的设计讲全了（一致性哈希 + 虚拟节点、法定人数、向量时钟、Gossip 故障检测、Cassandra 式读写路径），但这三笔账它都留成定性判断。这篇把它们算出来。

这篇不复述译文，也不搬运中文译本的任何段落。它复述这一章的骨架（设计特点、单机与分布式的界限、CAP 权衡、六个组件、读写路径），然后补三个自写模型：**W+R>N 的穷举验证**、**LSM 的三种放大与打平读写比**、**扩容迁移量与虚拟节点均衡**。

## 口径说明

- 源笔记是 Alex Xu《System Design Interview — An Insider's Guide》第 6 章的社区中译。上游两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均返回 404，**上游许可未能确认**；原书是商业出版物。故本篇为导读式：只复述章节骨架与要点，不引用译文原文或原书段落，不使用译本配图，正文主体是自写模型与判断。
- 三个脚本均为自写增量，只依赖 Python 标准库；输出为实跑结果，逐行可复现（三段计算都不含随机数，脚本自带确定性哈希）。
- 与已发文章的重叠见「这一章不重复已发的内容」一节。

## 一、本章骨架：特点、CAP、六个组件、两条路径

**设计特点**：键值对**小于 10 KB**；支持大数据量、高可用与高扩展；**自动扩展与可调一致性**；低延迟。操作只有 `put(key, value)` 与 `get(key)`。

**单机版**：内存里的**哈希表**，配两个优化——数据压缩、把不常访问的数据挪到磁盘。局限是内存有限，所以必须走分布式。

**CAP 权衡**：一致性 / 可用性 / 分区容忍性三者只能取二；**CA 系统在现实中不存在**（网络故障不可避免，必须容忍分区）。分区发生时，CP 方案要**阻塞对存活节点的写**，AP 方案继续接受读但可能返回陈旧数据，分区恢复后再同步。

**六个组件**：① **数据分区**——用一致性哈希把数据均匀分布，服务器增减时自动扩展，**虚拟节点**支持异构（虚拟节点数量与服务器容量成正比）；② **数据复制**——在 N 台服务器上复制，沿环顺时针取前 N 台，**副本分散在不同数据中心**；③ **一致性**——法定人数：N 是副本总数，W 是写法定人数（拿到 W 个副本确认才算成功），R 是读法定人数（至少等 R 个副本响应），**规则 `W + R > N` 保证强一致性**（典型 N=3、W=R=2；R=1 & W=N 偏读；W=1 & R=N 偏写）；④ **不一致解决**——用**版本控制 + 向量时钟**判断两个版本是先后还是并发，并发则产生冲突值交给上层解决；⑤ **故障处理**——故障检测**至少要两个独立信息源**才判定宕机，用 **Gossip**（成员 ID + 心跳计数器，定期递增并向随机节点发心跳，超过时段未增长即离线），临时故障用**宽松法定人数（sloppy quorum）**顶上；⑥ **数据中心宕机**。

**读路径（Cassandra 式）**：先查内存缓存，没有则用**布隆过滤器**在 SSTable 里定位，取回返回。**写路径**：持久化到**提交日志**，同时写内存缓存，缓存满时刷成磁盘上的 **SSTable**（有序字符串表）。

## 二、增量一：W+R>N 是必要条件，不是「够用」

讲义给了一条规则和三种配置。规则本身可以穷举验证——它到底保证了什么：

```python
# -*- coding: utf-8 -*-
"""键值存储的法定人数（quorum）账本。

把讲义里关于 quorum 的三条规则变成可计算的数：

1. "W + R > N 保证强一致" —— 穷举所有写集合与读集合，看交集到底有多大，
   什么时候会出现"读集合与写集合完全不相交"（即读到旧值）。
2. N 个副本各有独立不可用概率 p 时，写与读各自的成功率、能容忍几台故障。
3. 同一份键值对，在不同 (W, R) 配置下跨节点传输放大多少倍。

只依赖标准库；输出确定性（无随机数，不依赖集合或字典的迭代顺序）。
"""
from itertools import combinations
from math import comb

READ_QPS = 100000      # 假设：读 QPS
WRITE_QPS = 20000      # 假设：写 QPS
VALUE_BYTES = 1024     # 假设：平均键值对大小（讲义给的是 < 10 KB 上限）
CROSS_NODE_FACTOR = 1  # 跨节点传输相对本地读写的倍数（1 = 同价，仅作比较尺度）


def all_quorums(n, k):
    """所有大小为 k 的副本集合（按字典序，确定性）。"""
    return [tuple(c) for c in combinations(range(n), k)]


def intersection_stats(n, w, r):
    """穷举写集合 x 读集合。

    返回 (最小交集大小, 交集为空的组合数, 组合总数)。
    交集为空的组合意味着：这次读可能完全没有命中任何持有最新值的副本。
    """
    write_sets = all_quorums(n, w)
    read_sets = all_quorums(n, r)
    min_overlap = n
    empty = 0
    for a in write_sets:
        sa = set(a)
        for b in read_sets:
            overlap = len(sa & set(b))
            if overlap < min_overlap:
                min_overlap = overlap
            if overlap == 0:
                empty += 1
    return min_overlap, empty, len(write_sets) * len(read_sets)


def alive_prob(n, k, p):
    """至少有 k 个副本可用的概率（各副本独立以 p 的概率不可用）。"""
    total = 0.0
    for alive in range(k, n + 1):
        total += comb(n, alive) * ((1.0 - p) ** alive) * (p ** (n - alive))
    return total


def band(bytes_per_second):
    """把字节/秒折成 Gb/s（十进制 G）。"""
    return bytes_per_second * 8.0 / 1e9


print("=== 1. 穷举验证：W + R > N 这条规则到底保证什么 ===")
print("副本数 N，写法定人数 W，读法定人数 R")
print()
print("N   W   R   W+R   W+R>N   最小交集   交集为空的读组合   组合总数")
cases = []
for n in (3, 5):
    ws = range(1, n + 1) if n == 3 else (1, 2, 3, 4, 5)
    rs = range(1, n + 1) if n == 3 else (2, 3, 4, 5)
    for w in ws:
        for r in rs:
            cases.append((n, w, r))
for (n, w, r) in cases:
    best, empty, total = intersection_stats(n, w, r)
    print("%-3d %-3d %-3d %-5d %-8s %-10d %-18d %d"
          % (n, w, r, w + r, "是" if w + r > n else "否", best, empty, total))

print()
print("结论：最小交集恒等于 max(0, W + R - N)；W + R <= N 时确实存在")
print("      交集为空的组合（读到陈旧值是可能的），W + R > N 时恒不为空。")

print()
print("=== 2. 副本故障下的可用性：N=3 的一组配置 ===")
N = 3
configs = [(2, 2), (3, 1), (1, 3)]
print("独立不可用概率 p   配置(W,R)   写成功率   读成功率   宽松写成功率   写容忍故障   读容忍故障")
for p in (0.01, 0.05, 0.10, 0.20):
    for (w, r) in configs:
        w_ok = alive_prob(N, w, p)
        r_ok = alive_prob(N, r, p)
        sloppy_ok = alive_prob(N, 1, p)
        print("%-16.0f%% %-11s %-10.4f %-10.4f %-14.4f %-12d %d"
              % (p * 100, "(%d,%d)" % (w, r), w_ok, r_ok, sloppy_ok, N - w, N - r))
    print()

print("读成功率与写成功率相乘，就是一次「读后写」要两个条件同时成立的概率：")
for p in (0.01, 0.05, 0.10):
    joint = alive_prob(N, 2, p) * alive_prob(N, 2, p)
    print("  p=%.0f%%  N=3/W=R=2 时，读后写两个动作都成功的概率 = %.4f" % (p * 100, joint))

print()
print("=== 3. 同样的键值对，不同 (W,R) 的跨节点放大 ===")
read_bytes = READ_QPS * VALUE_BYTES
write_bytes = WRITE_QPS * VALUE_BYTES
print("负载假设：读 %d QPS、写 %d QPS、平均键值对 %d B" % (READ_QPS, WRITE_QPS, VALUE_BYTES))
print()
print("配置(W,R)   读放大   写放大   读跨节点流量   写跨节点流量   合计 Gb/s   相对 (2,2)")
base = None
for (w, r) in [(2, 2), (3, 1), (1, 3), (2, 3)]:
    r_bytes = read_bytes * r
    w_bytes = write_bytes * w
    total = band(r_bytes + w_bytes)
    if base is None:
        base = total
    print("%-11s %-8d %-8d %-14.2f %-14.2f %-11.3f %.2f 倍"
          % ("(%d,%d)" % (w, r), r, w, band(r_bytes), band(w_bytes), total, total / base))

print()
print("三个配置的读延迟画像（副本延迟分布相同，取最慢副本）：")
print("  (3,1) 读只要 1 个副本，p99 由单副本决定；写要等 3 个副本")
print("  (1,3) 写只要 1 个副本，p99 由单副本决定；读要等 3 个副本")
print("  (2,2) 读写各等 2 个副本，跨节点流量居中，故讲义推荐它作为默认值")
```

输出：

```text
=== 1. 穷举验证：W + R > N 这条规则到底保证什么 ===
副本数 N，写法定人数 W，读法定人数 R

N   W   R   W+R   W+R>N   最小交集   交集为空的读组合   组合总数
3   1   1   2     否        0          6                  9
3   1   2   3     否        0          3                  9
3   1   3   4     是        1          0                  3
3   2   1   3     否        0          3                  9
3   2   2   4     是        1          0                  9
3   2   3   5     是        2          0                  3
3   3   1   4     是        1          0                  3
3   3   2   5     是        2          0                  3
3   3   3   6     是        3          0                  1
5   1   2   3     否        0          30                 50
5   1   3   4     否        0          20                 50
5   1   4   5     否        0          5                  25
5   1   5   6     是        1          0                  5
5   2   2   4     否        0          30                 100
5   2   3   5     否        0          10                 100
5   2   4   6     是        1          0                  50
5   2   5   7     是        2          0                  10
5   3   2   5     否        0          10                 100
5   3   3   6     是        1          0                  100
5   3   4   7     是        2          0                  50
5   3   5   8     是        3          0                  10
5   4   2   6     是        1          0                  50
5   4   3   7     是        2          0                  50
5   4   4   8     是        3          0                  25
5   4   5   9     是        4          0                  5
5   5   2   7     是        2          0                  10
5   5   3   8     是        3          0                  10
5   5   4   9     是        4          0                  5
5   5   5   10    是        5          0                  1

结论：最小交集恒等于 max(0, W + R - N)；W + R <= N 时确实存在
      交集为空的组合（读到陈旧值是可能的），W + R > N 时恒不为空。

=== 2. 副本故障下的可用性：N=3 的一组配置 ===
独立不可用概率 p   配置(W,R)   写成功率   读成功率   宽松写成功率   写容忍故障   读容忍故障
1               % (2,2)       0.9997     0.9997     1.0000         1            1
1               % (3,1)       0.9703     1.0000     1.0000         0            2
1               % (1,3)       1.0000     0.9703     1.0000         2            0

5               % (2,2)       0.9927     0.9927     0.9999         1            1
5               % (3,1)       0.8574     0.9999     0.9999         0            2
5               % (1,3)       0.9999     0.8574     0.9999         2            0

10              % (2,2)       0.9720     0.9720     0.9990         1            1
10              % (3,1)       0.7290     0.9990     0.9990         0            2
10              % (1,3)       0.9990     0.7290     0.9990         2            0

20              % (2,2)       0.8960     0.8960     0.9920         1            1
20              % (3,1)       0.5120     0.9920     0.9920         0            2
20              % (1,3)       0.9920     0.5120     0.9920         2            0

读成功率与写成功率相乘，就是一次「读后写」要两个条件同时成立的概率：
  p=1%  N=3/W=R=2 时，读后写两个动作都成功的概率 = 0.9994
  p=5%  N=3/W=R=2 时，读后写两个动作都成功的概率 = 0.9856
  p=10%  N=3/W=R=2 时，读后写两个动作都成功的概率 = 0.9448

=== 3. 同样的键值对，不同 (W,R) 的跨节点放大 ===
负载假设：读 100000 QPS、写 20000 QPS、平均键值对 1024 B

配置(W,R)   读放大   写放大   读跨节点流量   写跨节点流量   合计 Gb/s   相对 (2,2)
(2,2)       2        2        1.64           0.33           1.966       1.00 倍
(3,1)       1        3        0.82           0.49           1.311       0.67 倍
(1,3)       3        1        2.46           0.16           2.621       1.33 倍
(2,3)       3        2        2.46           0.33           2.785       1.42 倍

三个配置的读延迟画像（副本延迟分布相同，取最慢副本）：
  (3,1) 读只要 1 个副本，p99 由单副本决定；写要等 3 个副本
  (1,3) 写只要 1 个副本，p99 由单副本决定；读要等 3 个副本
  (2,2) 读写各等 2 个副本，跨节点流量居中，故讲义推荐它作为默认值
```

三处结论：

**第一，`W+R>N` 的确切含义是「任意 W 个写副本与任意 R 个读副本必有交集」。** 脚本对每组 (N, W, R) 穷举了所有写组合与读组合，统计**最小交集**与**交集为空的读组合数**。N=3、W=R=1 时：交集恒为 0，**9 个读组合里 6 个**读不到最新写；W=R=2 时交集恒 ≥1，交集为空的组合数为 0。

**第二，规则被违反时的后果是「静默读到陈旧值」，而不是报错。** N=5、W=2、R=3 时 W+R=5 ≤ N：50 个写组合里有 **10 个读组合**与任何写集合都不相交——这些读**必然**读不到最新写。这解释了讲义为什么把它称为「保证强一致性」而不是「提高一致性」。

**第三，调 W/R 的取舍是延迟账。** 讲义给的 R=1 & W=N（偏读）与 W=1 & R=N（偏写），在脚本的视角里就是：偏读时读只等 1 个副本（快）但写要等全部 N 个（慢）；偏写时反之。**代价不是「一致性更强或更弱」，而是把延迟压在读侧还是写侧**——而 W+R>N 这条规则在任何一种配置下都必须成立。

## 三、增量二：Leveled 与 Tiered：三种放大与打平读写比

讲义只讲了 SSTable、内存缓存与布隆过滤器，没讲底层引擎的放大账。这是 LSM 两种组织方式的账：

```python
# -*- coding: utf-8 -*-
"""键值存储的存储引擎账：LSM 与 B+ 树的写放大、读放大、空间放大。

讲义给的写路径（commit log -> 内存缓存 -> 刷盘成 SSTable）与读路径
（内存缓存 -> 布隆过滤器定位 -> SSTable 取回）其实是一套 LSM 式引擎，
但讲义没有给任何数字。这份脚本把三笔账算出来。

模型（全部参数在下面显式声明，结论只在这个模型内成立）：
  T = 层间放大比（tiering ratio），L = 层数（含 L0 缓存层）。
  Leveled：第 i 层的文件区间与第 i+1 层的文件区间重叠，T 个第 i 层文件
            会触发 T 次对第 i+1 层整个区间的重写 -> 每下沉一层，
            每字节被重写 T 次；字节总共下沉 L 层 -> 写放大 L x T。
            同一层内文件互不重叠 -> 点查每层只需探 1 个文件。
  Tiered ：同层文件之间互相重叠，点查要把同层文件全探一遍；
            字节每下沉一层只被重写一次 -> 写放大 L，读放大 L x T。

脚本在此模型之上算三笔账落到硬件上的量：磁盘写带宽、磁盘容量、
读放大带来的 IOPS，以及两种引擎在什么读写比下打平。
附带算布隆过滤器：指纹占多少内存、假阳性率多少、把「查不存在」的
读放大削掉多少。

只依赖标准库；输出确定性（无随机数，遍历一律 sorted）。
"""
import math

VALUE_BYTES = 1024                  # 假设：平均键值对 1 KB（讲义给的是 < 10 KB 上限）
TIERING_RATIO = 10                  # 假设：层间放大比 T = 10
LEVELS = 6                          # 假设：6 层（L0 缓存 + L1..L5）
L0_FILES = 4                        # 假设：L0 同时压着 4 个文件（L0 内文件互相重叠）
PAGE_BYTES = 16 * 1024              # 假设：B+ 树页大小 16 KB
BLOOM_BITS_PER_KEY = 10             # 假设：每个 SSTable 的布隆过滤器 10 bit/键
BLOOM_K = 4                         # 假设：布隆过滤器用 4 个哈希函数

DATASET_BYTES = 10 * 1024 ** 4      # 假设：数据集 10 TB
WRITE_QPS = 20000                   # 假设：写 2 万 QPS
READ_QPS = 100000                   # 假设：读 10 万 QPS
USABLE_RATIO = 0.70                 # 假设：磁盘可用率 70%
NVME_WRITE_GBPS = 2.5               # 假设：单块 NVMe 顺序写 2.5 GB/s

T = TIERING_RATIO
L = LEVELS


def bloom_false_positive(keys, bits_per_key, k):
    """布隆过滤器假阳性率（闭式公式）。"""
    m = float(keys * bits_per_key)
    return (1.0 - math.exp(-k * keys / m)) ** k


def fmt_bytes(n):
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    v = float(n)
    i = 0
    while v >= 1024.0 and i < len(units) - 1:
        v /= 1024.0
        i += 1
    return "%.2f %s" % (v, units[i])


def fmt_gbps(bytes_per_second):
    return bytes_per_second * 8.0 / 1e9


print("=== 0. 模型参数 ===")
print("值 %d B，层数 L = %d，层间放大比 T = %d，L0 同时压 %d 个文件"
      % (VALUE_BYTES, L, T, L0_FILES))
print("数据集 %s，写 %d QPS，读 %d QPS，磁盘可用率 %.0f%%，单块 NVMe 写 %.1f GB/s"
      % (fmt_bytes(DATASET_BYTES), WRITE_QPS, READ_QPS, USABLE_RATIO * 100, NVME_WRITE_GBPS))
print()

print("=== 1. 三种放大：Leveled 与 Tiered 的账 ===")
amp = {}
amp["Leveled"] = {
    "write": L * T,
    "read": L0_FILES + (L - 1),
    "space": T,
}
amp["Tiered"] = {
    "write": L,
    "read": L * T,
    "space": 1,
}
print("引擎      写放大      读放大      空间放大")
for name in ("Leveled", "Tiered"):
    a = amp[name]
    print("%-9s %-11d %-11d %d" % (name, a["write"], a["read"], a["space"]))
print()
print("写放大推导（Leveled）：第 i 层的一个文件区间大小 S，第 i+1 层是 T x S；")
print("  T 个第 i 层文件会触发 T 次对第 i+1 层整个区间的重写 -> 每下沉一层，")
print("  每字节被重写 T 次；字节共下沉 %d 层 -> 写放大 = %d x %d = %d 倍"
      % (L, L, T, L * T))
print("写放大推导（Tiered）：字节每下沉一层只被重写一次 -> 写放大 = %d 倍" % L)
print()

print("=== 2. 写放大落到磁盘带宽上 ===")
user_write_bytes = WRITE_QPS * VALUE_BYTES
print("用户写 %d QPS x %d B = %s/s" % (WRITE_QPS, VALUE_BYTES, fmt_bytes(user_write_bytes)))
for name in ("Leveled", "Tiered"):
    disk_write = user_write_bytes * amp[name]["write"]
    disks = disk_write / (NVME_WRITE_GBPS * 1e9)
    print("  %-8s 实际落盘 %-11s/s = %6.2f Gb/s -> 需要 %4.1f 块 NVMe（单块写 %.1f GB/s）"
          % (name, fmt_bytes(disk_write), fmt_gbps(disk_write), disks, NVME_WRITE_GBPS))
print("  用户写只占 %s/s，落盘的其余部分全是压实重写出来的。"
      % fmt_bytes(user_write_bytes))
print()

print("=== 3. 空间放大落到磁盘容量上 ===")
for name in ("Leveled", "Tiered"):
    need = DATASET_BYTES * amp[name]["space"]
    raw = need / USABLE_RATIO
    print("  %-8s 需要 %-11s 逻辑容量 -> 按 %.0f%% 可用率备盘 %-11s"
          % (name, fmt_bytes(need), USABLE_RATIO * 100, fmt_bytes(raw)))
print()

print("=== 4. 读放大落到 IOPS 上 ===")
for name in ("Leveled", "Tiered"):
    reads = READ_QPS * amp[name]["read"]
    print("  %-8s 读 %d QPS x 读放大 %d = %s 次随机读/s（布隆过滤前）"
          % (name, READ_QPS, amp[name]["read"], "{:,}".format(reads)))
print("  写是顺序写，摊到带宽上而不是 IOPS 上，所以它记在第 2 节那一栏。")
print()

print("=== 5. 两种引擎在什么读写比下打平 ===")
print("折算模型：一次随机读的代价记 1，一次顺序写的代价记 1（这是简化，见正文说明）")
print("  Leveled 总代价 = 读 QPS x %d + 写 QPS x %d" % (amp["Leveled"]["read"], amp["Leveled"]["write"]))
print("  Tiered  总代价 = 读 QPS x %d + 写 QPS x %d" % (amp["Tiered"]["read"], amp["Tiered"]["write"]))
num = amp["Leveled"]["write"] - amp["Tiered"]["write"]
den = amp["Tiered"]["read"] - amp["Leveled"]["read"]
if den > 0:
    ratio = float(num) / den
    print("  令两者相等：R/W = %d / %d = %.2f" % (num, den, ratio))
    print("  读写比高于 %.2f（即读更多）时 Leveled 更划算；低于它时 Tiered 更划算。" % ratio)
    for r in (1, 5, 10, 20):
        w = 1.0
        c_leveled = amp["Leveled"]["read"] * r + amp["Leveled"]["write"] * w
        c_tiered = amp["Tiered"]["read"] * r + amp["Tiered"]["write"] * w
        print("    R:W = %d:1 -> Leveled %6.0f，Tiered %6.0f，谁划算：%s"
              % (r, c_leveled, c_tiered,
                 "Leveled" if c_leveled < c_tiered else ("Tiered" if c_tiered < c_leveled else "平手")))
print()

print("=== 6. 布隆过滤器：省的是「查不存在」的读放大 ===")
keys_per_sstable = 16384
fp = bloom_false_positive(keys_per_sstable, BLOOM_BITS_PER_KEY, BLOOM_K)
filter_bytes = keys_per_sstable * BLOOM_BITS_PER_KEY // 8
print("单个 SSTable：%d 个键 -> 布隆指纹 %d B（%d bit/键），假阳性率 %.4f%%"
      % (keys_per_sstable, filter_bytes, BLOOM_BITS_PER_KEY, fp * 100))
for name in ("Leveled", "Tiered"):
    probes = amp[name]["read"]
    print("  %-8s 查不存在的 key：探针 %-3d 个 -> 预期真正读盘 %6.2f 次（无过滤器则 %d 次），省 %.1f 倍"
          % (name, probes, probes * fp, probes, probes / (probes * fp)))
print()
print("=== 7. B+ 树对照 ===")
print("  页级写放大：%d KB 页里改 %d B 的值要整页重写 -> %.0f 倍"
      % (PAGE_BYTES // 1024, VALUE_BYTES, PAGE_BYTES / float(VALUE_BYTES)))
print("  点查：树高 3-4 层，上层页常驻缓存，典型 1 次随机读")
print("  空间放大：1 倍（就地更新，不留历史版本）")
print("  代价：随机写要等这页刷盘，且页级写放大 %.0f 倍在 NVMe 上比 LSM 更贵"
      % (PAGE_BYTES / float(VALUE_BYTES)))
```

输出：

```text
=== 0. 模型参数 ===
值 1024 B，层数 L = 6，层间放大比 T = 10，L0 同时压 4 个文件
数据集 10.00 TB，写 20000 QPS，读 100000 QPS，磁盘可用率 70%，单块 NVMe 写 2.5 GB/s

=== 1. 三种放大：Leveled 与 Tiered 的账 ===
引擎      写放大      读放大      空间放大
Leveled   60          9           10
Tiered    6           60          1

写放大推导（Leveled）：第 i 层的一个文件区间大小 S，第 i+1 层是 T x S；
  T 个第 i 层文件会触发 T 次对第 i+1 层整个区间的重写 -> 每下沉一层，
  每字节被重写 T 次；字节共下沉 6 层 -> 写放大 = 6 x 10 = 60 倍
写放大推导（Tiered）：字节每下沉一层只被重写一次 -> 写放大 = 6 倍

=== 2. 写放大落到磁盘带宽上 ===
用户写 20000 QPS x 1024 B = 19.53 MB/s
  Leveled  实际落盘 1.14 GB    /s =   9.83 Gb/s -> 需要  0.5 块 NVMe（单块写 2.5 GB/s）
  Tiered   实际落盘 117.19 MB  /s =   0.98 Gb/s -> 需要  0.0 块 NVMe（单块写 2.5 GB/s）
  用户写只占 19.53 MB/s，落盘的其余部分全是压实重写出来的。

=== 3. 空间放大落到磁盘容量上 ===
  Leveled  需要 100.00 TB   逻辑容量 -> 按 70% 可用率备盘 142.86 TB  
  Tiered   需要 10.00 TB    逻辑容量 -> 按 70% 可用率备盘 14.29 TB   

=== 4. 读放大落到 IOPS 上 ===
  Leveled  读 100000 QPS x 读放大 9 = 900,000 次随机读/s（布隆过滤前）
  Tiered   读 100000 QPS x 读放大 60 = 6,000,000 次随机读/s（布隆过滤前）
  写是顺序写，摊到带宽上而不是 IOPS 上，所以它记在第 2 节那一栏。

=== 5. 两种引擎在什么读写比下打平 ===
折算模型：一次随机读的代价记 1，一次顺序写的代价记 1（这是简化，见正文说明）
  Leveled 总代价 = 读 QPS x 9 + 写 QPS x 60
  Tiered  总代价 = 读 QPS x 60 + 写 QPS x 6
  令两者相等：R/W = 54 / 51 = 1.06
  读写比高于 1.06（即读更多）时 Leveled 更划算；低于它时 Tiered 更划算。
    R:W = 1:1 -> Leveled     69，Tiered     66，谁划算：Tiered
    R:W = 5:1 -> Leveled    105，Tiered    306，谁划算：Leveled
    R:W = 10:1 -> Leveled    150，Tiered    606，谁划算：Leveled
    R:W = 20:1 -> Leveled    240，Tiered   1206，谁划算：Leveled

=== 6. 布隆过滤器：省的是「查不存在」的读放大 ===
单个 SSTable：16384 个键 -> 布隆指纹 20480 B（10 bit/键），假阳性率 1.1813%
  Leveled  查不存在的 key：探针 9   个 -> 预期真正读盘   0.11 次（无过滤器则 9 次），省 84.7 倍
  Tiered   查不存在的 key：探针 60  个 -> 预期真正读盘   0.71 次（无过滤器则 60 次），省 84.7 倍

=== 7. B+ 树对照 ===
  页级写放大：16 KB 页里改 1024 B 的值要整页重写 -> 16 倍
  点查：树高 3-4 层，上层页常驻缓存，典型 1 次随机读
  空间放大：1 倍（就地更新，不留历史版本）
  代价：随机写要等这页刷盘，且页级写放大 16 倍在 NVMe 上比 LSM 更贵
```

三处结论：

**第一，两种引擎是「写放大 vs 读放大」的取舍，不是优劣。** Leveled（每下沉一层就重写整个相邻区间）：**写放大 60×、读放大 9×、空间放大 10×**；Tiered（每层内按序追加、层满才合并）：**写放大 6×、读放大 60×、空间放大 1×**。注意 Leveled 的空间放大 10× 正是「层间放大比 T=10」的直接后果——**Tiered 的空间最省，Leveled 的写最省**。

**第二，三种放大各自落在不同的资源上，容量规划必须分开做。** 写放大落在**带宽**上：用户写 19,53 MB/s（20,000 QPS × 1 KB），Leveled 实际落盘 **1.14 GB/s**、Tiered 117 MB/s——**用户写只占 19.53 MB/s，落盘的其余部分全是压实重写出来的**。读放大落在**IOPS**上：100,000 QPS 读 × 读放大 → Leveled 90 万次随机读/s、Tiered 600 万次/s（布隆过滤之前）。空间放大落在**容量**上：10 TB 逻辑数据，Leveled 要按 70% 可用率备 142.86 TB、Tiered 只需 14.29 TB。

**第三，两者有一个可计算的交叉点：读写比 R/W = 54/51 ≈ 1.06。** 读比写多时 Leveled 更划算（R:W=5:1 → 105 vs 306），写比读多时 Tiered 更划算（R:W=1:1 → 69 vs 66）。**判据：按负载的读写比选引擎，而不是按「哪个更先进」**——而且读写比会随业务变化，所以真系统常常两种都用（热数据 Leveled、冷数据 Tiered）。

顺带一句：讲义读路径里的**布隆过滤器正是用来削读放大的**——它把「读放大 9 或 60 次随机定位」压到「几乎必然命中、只读 1 次」，代价是极小的假阳性率。

## 四、增量三：扩容要搬多少数据，虚拟节点要开多少

讲义说「服务器增减时自动扩展」「用虚拟节点支持异构」。这两句话都能量化：

```python
"""分区的再平衡代价：一致性哈希 vs 取模分片，以及虚拟节点对均衡的作用。

只依赖标准库；输出确定性（用固定种子自写 LCG，不用 random）。
"""
M = 200_000              # key 总数
VNODE_FACTOR = 100       # 每个物理节点的虚拟节点数


MASK = (1 << 64) - 1


def mix64(x):
    """splitmix64 风格的混合：LCG 的高位雪崩差，直接当哈希会导致负载不收敛。"""
    x = (x + 0x9E3779B97F4A7C15) & MASK
    z = x
    z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & MASK
    z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & MASK
    return z ^ (z >> 31)


class LCG:
    def __init__(self, seed):
        self.s = seed & ((1 << 64) - 1)

    def next(self):
        self.s = (self.s * 6364136223846793005 + 14426950449303515665) & ((1 << 64) - 1)
        return self.s


def consistent_hash_migration(n_nodes, n_new, vnodes):
    """把 key 按 (节点, vnode) 的哈希环归属；扩到 n_new 个节点后统计迁移比例。"""
    old_ring = sorted((hash_point(node, v), node) for node in range(n_nodes) for v in range(vnodes))
    new_ring = sorted(old_ring + [(hash_point(node, v), node)
                                  for node in range(n_nodes, n_new) for v in range(vnodes)])
    old_keys = [owner_of(old_ring, key_hash(k)) for k in range(M)]
    new_keys = [owner_of(new_ring, key_hash(k)) for k in range(M)]
    moved = sum(1 for a, b in zip(old_keys, new_keys) if a != b)
    return moved, old_keys


def hash_point(node, v):
    return mix64(0xC0FFEE + node * 1000003 + v * 9176)


def key_hash(k):
    return mix64(0xABCDEF + k * 2654435761)


def owner_of(ring, h):
    lo, hi = 0, len(ring)
    while lo < hi:
        mid = (lo + hi) // 2
        if ring[mid][0] < h:
            lo = mid + 1
        else:
            hi = mid
    if lo == len(ring):
        return ring[0][1]
    return ring[lo][1]


print("key 数 %s" % format(M, ","))
print()
print("扩容一个节点时，有多少 key 要搬家：")
for n in (4, 8, 16):
    moved, _ = consistent_hash_migration(n, n + 1, VNODE_FACTOR)
    mod_moved = M * n // (n + 1)          # 取模分片：扩容要重分 ~n/(n+1) 的 key
    print("  %2d -> %2d 节点：一致性哈希迁移 %7s 个（%.2f%%） | 取模分片约 %7s 个（%.1f%%）"
          % (n, n + 1, format(moved, ","), 100.0 * moved / M,
             format(mod_moved, ","), 100.0 * mod_moved / M))
print()
print("虚拟节点数量对负载均衡的影响（16 个节点、10 万 key）：")
keys = 100_000
for vnodes in (1, 10, 100, 1000):
    counts = {}
    ring = sorted((hash_point(node, v), node) for node in range(16) for v in range(vnodes))
    for k in range(keys):
        o = owner_of(ring, key_hash(k))
        counts[o] = counts.get(o, 0) + 1
    vals = sorted(counts.values())
    mean = keys / 16
    print("  vnode=%4d/节点 -> 负载 min %6d、max %6d、均值 %6.0f，最大/均值 = %.2fx"
          % (vnodes, vals[0], vals[-1], mean, vals[-1] / mean))
print()
print("判据：")
print("  - **扩容的迁移成本是选分区算法的第一判据**：一致性哈希只迁约 1/(N+1)，")
print("    取模分片要迁 N/(N+1)（16 节点扩容即迁 94% 的 key）。")
print("  - **虚拟节点数决定均衡质量**：vnode=1 时最大/均值可达数倍，vnode 越多越接近 1.0；")
print("    代价是环上点数 x100（查找变长，可用独立的哈希表加速）。")
print("  - 迁移期间要有「双写/回填」窗口：这段时间里同一个 key 有两个归属，读要按新归属路由。")
```

输出：

```text
key 数 200,000

扩容一个节点时，有多少 key 要搬家：
   4 ->  5 节点：一致性哈希迁移  40,016 个（20.01%） | 取模分片约 160,000 个（80.0%）
   8 ->  9 节点：一致性哈希迁移  22,346 个（11.17%） | 取模分片约 177,777 个（88.9%）
  16 -> 17 节点：一致性哈希迁移  10,370 个（5.18%） | 取模分片约 188,235 个（94.1%）

虚拟节点数量对负载均衡的影响（16 个节点、10 万 key）：
  vnode=   1/节点 -> 负载 min     91、max  22076、均值   6250，最大/均值 = 3.53x
  vnode=  10/节点 -> 负载 min   4216、max   9304、均值   6250，最大/均值 = 1.49x
  vnode= 100/节点 -> 负载 min   4726、max   7891、均值   6250，最大/均值 = 1.26x
  vnode=1000/节点 -> 负载 min   6003、max   6591、均值   6250，最大/均值 = 1.05x

判据：
  - **扩容的迁移成本是选分区算法的第一判据**：一致性哈希只迁约 1/(N+1)，
    取模分片要迁 N/(N+1)（16 节点扩容即迁 94% 的 key）。
  - **虚拟节点数决定均衡质量**：vnode=1 时最大/均值可达数倍，vnode 越多越接近 1.0；
    代价是环上点数 x100（查找变长，可用独立的哈希表加速）。
  - 迁移期间要有「双写/回填」窗口：这段时间里同一个 key 有两个归属，读要按新归属路由。
```

三处结论：

**第一，扩容的迁移成本是选分区算法的第一判据。** 一致性哈希加一个节点只迁约 **1/(N+1)** 的 key：4→5 节点迁 **20.01%**、8→9 迁 **11.17%**、16→17 迁 **5.18%**；而取模分片要迁 N/(N+1)：**80% / 88.9% / 94.1%**。**节点越多，取模分片的迁移越接近全量**——这就是一致性哈希被发明出来的直接原因。

**第二，虚拟节点数决定均衡质量，而且收敛得很快。** 16 节点、10 万 key：vnode=1 时负载最大/均值 **3.53×**（有的节点 22,076 个 key，有的只有 91 个）；vnode=10 → 1.49×；vnode=100 → 1.26×；vnode=1000 → **1.05×**。判据：**虚拟节点数是「均衡质量」与「环长度/查找成本」的折中**——环上点数 = 节点数 × vnode 数，而环上查找通常靠独立哈希表加速，所以 vnode 开大些是划算的。

**第三，异构场景下 vnode 比例应按容量分配，但上限由最小节点决定。** 讲义说「虚拟节点数量与服务器容量成正比」；按上面的账推一步：**总 key 数被分成 N 份分给各节点，容量小的节点拿到的 key 比例小，但它处理速度慢——所以集群吞吐的上限是最慢节点的处理能力，而不是平均值**。这与我在《[扩展的每一步都在换瓶颈](/blog/scaling-bottleneck-transfer/)》里算的是同一条：加节点前先确认瓶颈在哪一层。

**第四，迁移期间要有「双写 / 回填」窗口**：这段时间里同一个 key 有两个归属，读必须按新归属路由——**扩容不是瞬间完成的，这个窗口的长度取决于搬 5% 还是 94% 的数据**（上面两张表就是它的长度表）。

## 五、把三个模型套回本章（判据清单）

1. **W+R>N 是必要条件**：N=3、W=R=1 时 9 个读组合里 6 个可能读不到最新写；N=5、W=2、R=3 时有 10 个读组合必读不到。**调 W/R 是延迟取舍，不是「更一致」**。
2. **读写的快慢配比要显式选**：R=1 & W=N 偏读、W=1 & R=N 偏写，代价压在读侧还是写侧。
3. **LSM 三种放大落在三种资源上**：写放大→带宽（Leveled 1.14 GB/s）、读放大→IOPS（Tiered 600 万次/s）、空间放大→容量（Leveled 142.86 TB vs Tiered 14.29 TB）。
4. **按读写比选引擎**：R/W = 1.06 是交叉点；读多 Leveled、写多 Tiered。
5. **布隆过滤器是读放大的解药**：把「9 或 60 次随机定位」压到「几乎必然命中、只读 1 次」。
6. **扩容迁移量 ≈ 1/(N+1)**：16→17 节点迁 5.18%，取模分片迁 94%。
7. **vnode 数量的收益递减**：3.53× → 1.49× → 1.26× → 1.05×（vnode = 1/10/100/1000），代价是环变长。
8. **异构集群的吞吐上限是最慢节点**，不是平均值。
9. **扩容有双写/回填窗口**，窗口长度 = 迁移量。

## 六、这一章不重复已发的内容

- **一致性哈希本身**（虚拟节点、环结构、再平衡）：见《[一致性哈希实测](/blog/consistent-hashing-measured/)》——那篇讲哈希环与分布，本文只算**迁移量与均衡比**。
- **LSM 的写放大与 compaction**：本文的 LSM 部分只算三种放大与打平读写比，更细的 compaction 机制见《[对象存储的两笔账](/blog/object-storage-iops-and-versioning-computed/)》的存储放大部分。
- **布隆过滤器的容量与碰撞**：见《[短链的键要多长](/blog/short-link-key-length-computed/)》。
- **Gossip 与故障检测**：见《[分布式锁](/blog/distributed-locks/)》的租约与失效检测部分。

## 七、这三个模型判不了什么

- **W、R、N 的取值是讲义给的例子，不是业务结论**。真实系统里 N 与 W/R 还要按「跨机房延迟」「每个副本的读 QPS 配额」来配，脚本里的组合枚举只能说明**规则的性质**，不能替你选参数。
- **LSM 的三个放大是按「层数 L=6、层间比 T=10、L0 同压 4 文件」的模型算的**，真实引擎的公式更复杂（leveled 的放大 ≈ T×L、tiered 的读放大随层数指数增长），而且压实的**并发度、后台限速、读缓存命中率**都会改变实际值。**判据：模型给的是量级与交叉点，最终要用真实引擎的基准测试**（这正是讲义建议用 redis-benchmark 之类工具做数据驱动决策的原因）。
- **没算写入路径的提交日志代价**：讲义写路径是「提交日志 + 内存缓存 + 刷 SSTable」，其中**提交日志的 fsync 语义直接决定写延迟**（同步 fsync 还是组提交），这一项本文没算——而它对写吞吐的影响可能大于 LSM 的写放大。
- **没算 sloppy quorum 的副作用**：讲义说临时故障用宽松法定人数顶上，但**它会把副本写到「非预期的节点」上**，后续要靠 hinted handoff 迁回；这会带来额外的网络与状态账。
- **三个模型都没碰向量时钟的元数据成本**：讲义说向量时钟能判定并发，但它的元数据随副本数增长——**在 N=3 时是 3 个计数器，N=100 时就是 100 个**，每条数据都要带着它走。这项开销没算。

## FAQ（八、常见问题）

**W+R>N 到底保证了什么？** 它保证「任意 W 个写副本与任意 R 个读副本**必有交集**」，于是读一定能读到写。穷举验证：N=3、W=R=1 时交集恒为 0，**9 个读组合里 6 个读不到最新写**；N=3、W=R=2 时交集恒 ≥1；N=5、W=2、R=3（W+R=N）时有 **10 个读组合**与任何写集合都不相交。所以它是**必要条件**，违反的后果是静默读到陈旧值。

**Leveled 还是 Tiered？** 看读写比。两者的放大恰好相反：Leveled 写 60×/读 9×/空间 10×，Tiered 写 6×/读 60×/空间 1×。折算后两者在 **R/W ≈ 1.06** 处打平——读多选 Leveled，写多选 Tiered。三种放大分别落在带宽（Leveled 落盘 1.14 GB/s，而用户写只有 19.53 MB/s）、IOPS（Tiered 600 万次随机读/s）和容量（142.86 TB vs 14.29 TB）上。

**扩容要搬多少数据？** 一致性哈希只迁约 **1/(N+1)**：4→5 节点迁 20.01%、8→9 迁 11.17%、16→17 迁 5.18%。取模分片要迁 N/(N+1)，16 节点扩容即 **94.1%**——几乎全量重分。这就是一致性哈希存在的理由。

**虚拟节点该开多少？** 它买的是均衡：16 节点下负载最大/均值从 vnode=1 的 **3.53×** 收敛到 vnode=10 的 1.49×、vnode=100 的 1.26×、vnode=1000 的 **1.05×**，收益递减很快。代价是环上点数 × vnode 数（查找通常靠独立哈希表加速，所以代价可接受）。

**为什么布隆过滤器是必需品？** 因为读放大才是 LSM 的瓶颈（Leveled 9×、Tiered 60×）。布隆过滤器把「读放大 N 次随机定位」压成「几乎必然命中、只读 1 次」，用极小的假阳性率换掉数量级的 IO。

**副本要放几个、定数怎么配？** N 是副本总数（要跨数据中心分散，讲义明确），W 是写确认数、R 是读等待数。R=1 & W=N 偏读（写慢），W=1 & R=N 偏写（读慢）——**代价是延迟压在读侧还是写侧**，而不是一致性更强。

## 出处与许可

- 原书：*System Design Interview — An Insider's Guide*（Alex Xu，Vol 1 & 2, 2nd Ed.）——本章骨架（第 6 章 Design a Key-Value Store）为其目录与要点。
- 英文笔记仓库：[liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)；中文译本仓库：[lukeTheNeuromancer/system-design-notes-zh](https://github.com/lukeTheNeuromancer/system-design-notes-zh)。
- **许可状态**：2026-11-27 实测，两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均返回 404，仓库网页 200，**上游许可未能确认**；原书为商业出版物。故本篇为导读式：只复述章节骨架与要点，不引用译文原文或原书段落，不使用译本配图，正文主体为自写模型与判断。
- LSM 相关的一手参考：[Apache Cassandra 的 SSTable 与 LSM 设计文档](https://cassandra.apache.org/doc/latest/cassandra/architecture/durable_writes.html)（写路径的提交日志与刷盘）。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
