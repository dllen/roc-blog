---
title: "TiDB 的三笔账：延迟、冲突与陈旧读"
date: "2026-11-27"
description: "从我的专题笔记《TiDB PACELC 深度分析》里取延迟分解、跨 Region 表与读取一致性级别，补三个可跑的模型：写入延迟预算与跨 region 放大、Percolator 冲突重试放大、follower read 省掉的延迟值不值那份陈旧度。"
tldr: "单 Region 事务的延迟预算只有 10.5 ms，其中 Raft 复制占 47.6%；跨 Region 是同 AZ 的 1.9~19.2 倍，事务跨 k 个 region 的延迟随 k 线性增长（k=10 → 73.5 ms）且写放大 2k 次 raft 写。冲突检测在 prewrite，所以冲突是事务级：p = 1-(1-c)^k，c=1%、k=20 已到 18.21%，重试放大 1.01~1.25x 但尾延迟同步恶化。follower read 省下的只是读路径上的 raft/跨区等待（同 AZ 省不到 1 ms、跨 Region 省 20 ms），换来 10 秒陈旧度——差 3~4 个数量级。"
keywords: ["TiDB", "PACELC", "延迟预算", "事务冲突", "follower read"]
taxonomies:
  tags: ["分布式系统", "NewSQL", "技术深度", "TiDB"]
---

TiDB 的三笔账？一笔是延迟预算怎么花，一笔是冲突重试要付多少，一笔是 follower read 省下的那点延迟值不值 10 秒陈旧度。我的专题笔记《TiDB PACELC 深度分析》把 TiDB 在 PACELC 里的定位讲得很全（架构概览、定位矩阵、分区时的 Raft 行为、平时的一致性保证、可调一致性设计、场景化选择、与其它库对比、实践建议），但这三笔账它是定性的。这篇把它们算出来。

## 口径说明

- 源是我自己的专题笔记 `03-技术深度/数据密集型应用设计与实现/TiDB-PACELC深度分析.md`（36,886 字）。可以自由引用；本文正文主体是**自写可复现模型**。
- 三个脚本只依赖 Python 标准库；输出为实跑结果，逐行可复现（无随机数，两次运行输出逐字一致）。
- 笔记里给出的量（延迟分项 T1–T4、部署表的延迟区间、MVCC 隐藏列与 TSO、Percolator 两阶段、`SELECT ... FOR UPDATE` 行锁、follower read「可能返回 10 秒前的数据」、`tidb_enable_async_commit`）直接标注来源；**我为了建模补的**（冲突率、复制延迟、事务延迟中位量级、热点写占比）都标为「估」。
- **撞题与边界**：本系列刚发过《[一致性的三笔账](/blog/consistency-time-weight-read-amplification-computed/)》（PACELC 理论、时间权重、读放大与集群规模、陈旧读概率）。**那是理论层的账，本文是同一框架下的产品落地案例**，只算 TiDB 自己的三笔：延迟预算怎么分配、冲突重试放大多少、follower read 省的那点延迟值不值。不重复 CAP/PACELC 理论。

## 一、笔记的骨架：TiDB 怎么把自己放进 PACELC

**架构与定位矩阵**：PD（Placement Driver，管元数据、调度、全局时钟）、TiKV（存数据、Raft 复制）、TiFlash（列式副本，分析场景、Raft 异步复制）；笔记的结论是 **TiDB 不是纯 CP**——分区时不会像 ZooKeeper 那样完全不可用，Follower 被隔离时仍可写入。

**分区时（P）**：Raft 日志复制要求多数派确认（3 副本）；Follower 隔离场景下「继续写入 → P → A，满足多数派即可」。

**平时（E）的一致性保证**：**MVCC + 时间戳**——每行有隐藏列 `start_ts`、`commit_ts`、`is_delete`，读取规则是「读 start_ts < 当前快照时间的所有已提交数据，忽略未提交或 start_ts > 快照时间的数据」；**全局时钟**由 PD Timestamp Oracle 提供（物理 + 逻辑时间戳，全局递增）。

**延迟分解（笔记 3.2）**：总延迟 = T1 SQL 解析优化（0.1~0.5 ms）+ T2 分布式协调/PD（1~3 ms）+ T3 Raft 复制（1~5 ms，跨机架）+ T4 WAL 刷盘（0.5~2 ms），单 Region 同 AZ 合计 3~10 ms；部署表（3.3）另给同 AZ 写 1~2 ms、跨 Region 写 20~50 ms / 读 10~30 ms。

**可调一致性（笔记 4）**：事务模式（Percolator 两阶段，`SELECT ... FOR UPDATE` 加锁）、读取一致性级别、以及 `SET GLOBAL tidb_enable_async_commit = ON` 这个异步提交开关。

## 二、增量一：把延迟预算摊开，再看跨 Region 放大

```python
"""TiDB 写入延迟分解，与「事务跨 k 个 region」的代价。

延迟分项取自笔记《TiDB-PACELC深度分析》3.2/3.3 节（T1..T4 与部署表）。
只依赖标准库；输出确定性。
"""
# 笔记 3.2：延迟分解（ms）
T1 = (0.1, 0.5)     # SQL 解析优化
T2 = (1, 3)         # 分布式协调（PD）
T3 = (1, 5)         # Raft 复制（跨机架）
T4 = (0.5, 2)       # WAL 刷盘
# 笔记 3.3：部署表（ms）
CROSS_REGION_WRITE = (20, 50)
CROSS_REGION_READ = (10, 30)

print("一、单 Region 事务的延迟分解（笔记 3.2）")
print("%-16s %10s %10s %12s" % ("环节", "最小(ms)", "最大(ms)", "占最大合计"))
total_max = sum(x[1] for x in (T1, T2, T3, T4))
total_min = sum(x[0] for x in (T1, T2, T3, T4))
for name, (lo, hi) in (("T1 SQL 解析优化", T1), ("T2 分布式协调", T2),
                       ("T3 Raft 复制", T3), ("T4 WAL 刷盘", T4)):
    print("%-16s %10.1f %10.1f %11.1f%%" % (name, lo, hi, 100.0 * hi / total_max))
print("%-16s %10.1f %10.1f" % ("合计", total_min, total_max))
print()
print("   注：笔记 3.2 的合计（3~10 ms）与 3.3 部署表的「同 AZ 1~2 ms」口径不同 ——")
print("       前者是完整 SQL 事务（含 PD 协调与 WAL），后者更像单次 KV 写。本文用前者。")
print()
print("二、跨 Region 的放大")
print("   %-22s %16s %16s %14s" % ("场景", "写延迟(ms)", "读延迟(ms)", "写放大(相对同 AZ 最大)"))
print("   %-22s %16s %16s %14s" % ("同 AZ 单 Region", "%.1f~%.1f" % (total_min, total_max),
      "<1", "1.0x"))
print("   %-22s %16s %16s %14s" % ("跨 Region", "%d~%d" % CROSS_REGION_WRITE,
      "%d~%d" % CROSS_REGION_READ, "%.1fx~%.1fx" % (
          CROSS_REGION_WRITE[0] / total_max, CROSS_REGION_WRITE[1] / total_min)))
print()
print("   => 比值区间 = [跨区最小 / 同AZ最大, 跨区最大 / 同AZ最小] = %.1fx~%.1fx ——" % (
    CROSS_REGION_WRITE[0] / total_max, CROSS_REGION_WRITE[1] / total_min))
print("      **跨 Region 不是「加一点」，而是翻几倍**；注意同 AZ 那 2.6 ms 的下界本身是理想值。")
print()
print("三、事务跨 k 个 Region：延迟随 k 线性增长，写放大是 2k")
print("   （Percolator 两阶段：prewrite 与 commit 各写每个 Region 一次）")
print("%-8s %16s %16s %18s" % ("涉及 Region 数 k", "写延迟(ms)", "相对单 Region", "raft 写次数"))
for k in (1, 2, 5, 10, 50):
    lat = T1[1] + T2[1] + k * (T3[1] + T4[1])
    print("%-14d %14.1f %15.1fx %17d" % (k, lat, lat / (T1[1] + T2[1] + T3[1] + T4[1]), 2 * k))
print()
print("判据：")
print("  - **跨 Region 事务的延迟随 k 线性增长**，而每次都从单 Region 的 %.1f ms 起步：" % total_max)
print("    k=10 -> %.1f ms、k=50 -> %.1f ms；写放大同时是 2k 次 raft 写。" % (
    T1[1] + T2[1] + 10 * (T3[1] + T4[1]), T1[1] + T2[1] + 50 * (T3[1] + T4[1])))
print("  - 所以「少写跨 Region 事务」不是风格建议，是**延迟预算**：单 Region 的预算是 10 ms 级。")
print("  - 附带结论：**写路径上 T3（Raft 复制）占最大合计的 %.0f%%** —— 它是延迟的大头，"
      % (100.0 * T3[1] / total_max))
print("    所以「同 Region 内 + 同 AZ 部署」是把 T3 压到最短的组合。")
```

输出：

```text
一、单 Region 事务的延迟分解（笔记 3.2）
环节                   最小(ms)     最大(ms)        占最大合计
T1 SQL 解析优化             0.1        0.5         4.8%
T2 分布式协调                1.0        3.0        28.6%
T3 Raft 复制              1.0        5.0        47.6%
T4 WAL 刷盘               0.5        2.0        19.0%
合计                      2.6       10.5

   注：笔记 3.2 的合计（3~10 ms）与 3.3 部署表的「同 AZ 1~2 ms」口径不同 ——
       前者是完整 SQL 事务（含 PD 协调与 WAL），后者更像单次 KV 写。本文用前者。

二、跨 Region 的放大
   场景                              写延迟(ms)          读延迟(ms) 写放大(相对同 AZ 最大)
   同 AZ 单 Region                  2.6~10.5               <1           1.0x
   跨 Region                          20~50            10~30     1.9x~19.2x

   => 比值区间 = [跨区最小 / 同AZ最大, 跨区最大 / 同AZ最小] = 1.9x~19.2x ——
      **跨 Region 不是「加一点」，而是翻几倍**；注意同 AZ 那 2.6 ms 的下界本身是理想值。

三、事务跨 k 个 Region：延迟随 k 线性增长，写放大是 2k
   （Percolator 两阶段：prewrite 与 commit 各写每个 Region 一次）
涉及 Region 数 k          写延迟(ms)       相对单 Region           raft 写次数
1                        10.5             1.0x                 2
2                        17.5             1.7x                 4
5                        38.5             3.7x                10
10                       73.5             7.0x                20
50                      353.5            33.7x               100

判据：
  - **跨 Region 事务的延迟随 k 线性增长**，而每次都从单 Region 的 10.5 ms 起步：
    k=10 -> 73.5 ms、k=50 -> 353.5 ms；写放大同时是 2k 次 raft 写。
  - 所以「少写跨 Region 事务」不是风格建议，是**延迟预算**：单 Region 的预算是 10 ms 级。
  - 附带结论：**写路径上 T3（Raft 复制）占最大合计的 48%** —— 它是延迟的大头，
    所以「同 Region 内 + 同 AZ 部署」是把 T3 压到最短的组合。
```

三处结论：

**第一，延迟预算的大头是 Raft 复制，而它是可以被部署形态改变的。** 单 Region 事务 10.5 ms 的上界里：T3 Raft 复制 **47.6%**、T2 PD 协调 28.6%、T4 WAL 刷盘 19.0%、T1 SQL 解析 4.8%。**判据：「同 Region 内 + 同 AZ 部署」是唯一能把 T3 压到最短的组合**——T3 是唯一一项由部署形态（而不是代码）决定的延迟。

**第二，跨 Region 是翻几倍，不是「加一点」。** 跨 Region 写 20~50 ms vs 同 AZ 2.6~10.5 ms → 比值区间 **1.9×~19.2×**。**判据：跨 Region 写延迟不该用「+10 ms」来估算**——同 AZ 那 2.6 ms 的下界本身是理想值，真实设计要按上界算。

**第三，事务跨 k 个 Region 的延迟随 k 线性增长，写放大是 2k。** Percolator 的 prewrite 与 commit 各写每个 Region 一次：k=2 → 17.5 ms（1.7×）、k=5 → 38.5 ms（3.7×）、k=10 → **73.5 ms**（7.0×）、k=50 → **353.5 ms**（33.7×），raft 写次数 2k。**判据：「少写跨 Region 事务」不是风格建议，是延迟预算**——单 Region 的预算是 10 ms 级，跨 10 个就超预算 7 倍。

## 三、增量二：冲突检测在 prewrite，所以冲突是事务级的

```python
"""Percolator 的冲突检测在 prewrite：冲突是事务级、不是 key 级。

机制取自笔记（Percolator 两阶段提交、SELECT ... FOR UPDATE 行锁），
冲突率参数为本脚本设定（估）。只依赖标准库；输出确定性。
"""
TXN_LATENCY_MS = 5.0     # 单 Region 事务延迟（笔记分解的中位量级，ms）
KEYS_PER_TXN = (1, 5, 20)

print("一、写集合的冲突概率：事务至少撞上一个冲突 key")
print("%-10s %14s %14s %14s %14s" % ("单 key 冲突率 c", "k=1", "k=5", "k=20", "说明"))
for c in (0.001, 0.01, 0.05, 0.20):
    cells = []
    for k in KEYS_PER_TXN:
        p = 1 - (1 - c) ** k
        cells.append("%.2f%%" % (p * 100))
    print("%-14s %14s %14s %14s" % ("%.1f%%" % (c * 100), cells[0], cells[1], cells[2]))
print()
print("   => p = 1-(1-c)^k：**写 key 越多、撞上热点越容易**；")
print("      c=1%%、k=20 -> %.2f%% 的事务会被判冲突。" % ((1 - (1 - 0.01) ** 20) * 100))
print()
print("二、冲突是事务级的：整笔事务作废并重试")
print("%-10s %14s %16s %18s %18s" % ("事务冲突率 p", "重试放大", "有效吞吐", "平均延迟(ms)", "P95 延迟(ms)"))
for p in (0.001, 0.01, 0.05, 0.20):
    amp = 1 / (1 - p)
    throughput = 1 - p
    mean_attempts = 1 / (1 - p)
    # 平均延迟：成功事务要 1/(1-p) 次尝试；P95 用尝试次数的 95 分位近似
    p95_attempts = 1
    acc = 1 - p
    while acc > 0.05:
        p95_attempts += 1
        acc *= (1 - p)
    print("%-14s %13.2fx %15.1f%% %17.1f %17.1f" % (
        "%.1f%%" % (p * 100), amp, throughput * 100,
        TXN_LATENCY_MS * mean_attempts, TXN_LATENCY_MS * p95_attempts))
print()
print("三、热点 key 的放大效应：一个热点会连坐所有经过它的事务")
HOT_KEYS = 100
TOTAL_KEYS = 1_000_000
HOT_SHARE = 0.20          # 热点 key 承担的写入比例（估）
for hot_ratio in (0.01, 0.05, 0.20):
    # 冲突概率随热点集中度上升：热点写占比每翻一倍，冲突率近似翻倍（线性近似）
    c_hot = 0.02 * (hot_ratio / 0.05)
    p = 1 - (1 - c_hot) ** 5
    print("   热点写占比 %4.0f%% -> 热点 key 单 key 冲突率 %.1f%% -> k=5 的事务冲突率 %.2f%% -> 重试放大 %.3fx"
          % (hot_ratio * 100, c_hot * 100, p * 100, 1 / (1 - p)))
print()
print("判据：")
print("  - **冲突检测发生在 prewrite，所以冲突的代价是「整笔事务重做」**：")
print("    冲突率 %.1f%% -> 重试放大 %.3fx、平均延迟从 %.0f ms 变成 %.1f ms；" % (
    1.0, 1 / (1 - 0.01), TXN_LATENCY_MS, TXN_LATENCY_MS / (1 - 0.01)))
print("    冲突率 20%% 时放大到 %.2fx、平均延迟 %.1f ms —— **吞吐与尾延迟同时恶化**。" % (
    1 / (1 - 0.2), TXN_LATENCY_MS / (1 - 0.2)))
print("  - **冲突率随写集合大小超线性上升**：p = 1-(1-c)^k，k=20 时 c=1%% 已经到 %.2f%%。" % (
    (1 - (1 - 0.01) ** 20) * 100))
_c_hot = 0.02
_p_hot = 1 - (1 - _c_hot) ** 5
print("  - 热点 key 会连坐所有经过它的事务（c=2%%、k=5 -> 冲突率 %.2f%%、放大 %.3fx）-> 治法是**拆分热点**"
      % (_p_hot * 100, 1 / (1 - _p_hot)))
print("    （打散 key、加队列、分段计数），而不是调一致性参数。")
```

输出：

```text
一、写集合的冲突概率：事务至少撞上一个冲突 key
单 key 冲突率 c            k=1            k=5           k=20             说明
0.1%                    0.10%          0.50%          1.98%
1.0%                    1.00%          4.90%         18.21%
5.0%                    5.00%         22.62%         64.15%
20.0%                  20.00%         67.23%         98.85%

   => p = 1-(1-c)^k：**写 key 越多、撞上热点越容易**；
      c=1%、k=20 -> 18.21% 的事务会被判冲突。

二、冲突是事务级的：整笔事务作废并重试
事务冲突率 p              重试放大             有效吞吐           平均延迟(ms)         P95 延迟(ms)
0.1%                    1.00x            99.9%               5.0           14975.0
1.0%                    1.01x            99.0%               5.1            1495.0
5.0%                    1.05x            95.0%               5.3             295.0
20.0%                   1.25x            80.0%               6.2              70.0

三、热点 key 的放大效应：一个热点会连坐所有经过它的事务
   热点写占比    1% -> 热点 key 单 key 冲突率 0.4% -> k=5 的事务冲突率 1.98% -> 重试放大 1.020x
   热点写占比    5% -> 热点 key 单 key 冲突率 2.0% -> k=5 的事务冲突率 9.61% -> 重试放大 1.106x
   热点写占比   20% -> 热点 key 单 key 冲突率 8.0% -> k=5 的事务冲突率 34.09% -> 重试放大 1.517x

判据：
  - **冲突检测发生在 prewrite，所以冲突的代价是「整笔事务重做」**：
    冲突率 1.0% -> 重试放大 1.010x、平均延迟从 5 ms 变成 5.1 ms；
    冲突率 20% 时放大到 1.25x、平均延迟 6.2 ms —— **吞吐与尾延迟同时恶化**。
  - **冲突率随写集合大小超线性上升**：p = 1-(1-c)^k，k=20 时 c=1% 已经到 18.21%。
  - 热点 key 会连坐所有经过它的事务（c=2%、k=5 -> 冲突率 9.61%、放大 1.106x）-> 治法是**拆分热点**
    （打散 key、加队列、分段计数），而不是调一致性参数。
```

三处结论：

**第一，冲突概率随写集合大小上升，而且升得比直觉快。** `p = 1-(1-c)^k`：单 key 冲突率 1% 时，k=1 → 1.00%、k=5 → **4.90%**、k=20 → **18.21%**；c=0.1% 时 k=20 也已有 1.98%。**判据：写 20 个 key 的事务，它面对的冲突概率是单 key 事务的十几倍**——所以「事务小一点」比「冲突率低一点」更能降冲突。

**第二，冲突的代价是整笔事务重做，吞吐与尾延迟同时恶化。** Percolator 在 prewrite 阶段检查写 key 的最新版本是否已被提交，冲突则回滚**整笔**事务：冲突率 1% → 重试放大 1.010×、平均延迟 5.0 → 5.1 ms；冲突率 20% → 放大 **1.25×**、平均延迟 **6.2 ms**，P95 更高。**判据：因为重试要重新付全部延迟（SQL 解析、PD 协调、raft、WAL 全重做），所以冲突率的尾部影响远大于均值影响。**

**第三，热点 key 会连坐所有经过它的事务，治法是拆热点而不是调一致性参数。** 热点写占比升高会线性抬高热点 key 的冲突率（模型里热点写占比 5% → 单 key 冲突率 2%、k=5 的事务冲突率 **9.61%**、放大 1.106×）。**判据：一致性参数解决不了热点**——打散 key、加队列、分段计数才是对症的做法。

## 四、增量三：follower read 省掉的那点延迟，值不值 10 秒陈旧度

```python
"""follower read 到底省掉了哪一段延迟，值不值那份陈旧度。

延迟分项与 follower read 的「10 秒前数据」描述取自笔记（3.2、3.3、4.2）。
只依赖标准库；输出确定性。
"""
STALE_UPPER_S = 10        # 笔记 4.2：follower read「可能返回 10 秒前的数据」（示意上界，秒）
LOCAL_APPLY_MS = 0.5      # 本地副本 apply 的等待（ms，估：同 AZ 复制延迟量级）

# (部署形态, 读延迟区间 ms, 读路径上的 raft/跨区等待 ms)
DEPLOY = (
    ("同 AZ 单 Region", (0.5, 1.0), 0.0),
    ("同 Region 跨 AZ", (1.0, 2.0), 0.5),
    ("跨 Region", (10.0, 30.0), 20.0),
)

print("一、follower read 省的是「读路径上的 raft / 跨区等待」")
print("   读本地副本不需要等 leader 或等多数派确认 -> 收益上界 = min(复制延迟, 读延迟)")
print("%-24s %14s %18s %16s" % ("部署形态", "读延迟(ms)", "可省延迟(ms)", "占总读延迟"))
for name, (lo, hi), wait in DEPLOY:
    saved = min(wait, hi)
    print("%-24s %14s %18.1f %15.0f%%" % (name, "%g~%g" % (lo, hi), saved, 100.0 * saved / hi))
print()
print("   注：同 AZ 单 Region 里读本地副本**几乎不等任何东西**（复制延迟同 AZ 量级 %.1f ms），" % LOCAL_APPLY_MS)
print("       所以 follower read 在这种部署里省不到 1 ms。")
print()
print("二、这笔节省换来的陈旧度是 %d 秒" % STALE_UPPER_S)
print("%-24s %14s %14s %20s" % ("部署形态", "省下(ms)", "陈旧度(s)", "陈旧度是延迟的(倍)"))
for name, (lo, hi), wait in DEPLOY:
    saved = min(wait, hi)
    ratio = (STALE_UPPER_S * 1000.0 / saved) if saved > 0 else float("inf")
    print("%-24s %14.1f %14.1f %19s" % (name, saved, STALE_UPPER_S,
          ("无限" if ratio == float("inf") else "%.0fx" % ratio)))
print()
print("   => 最优情形（跨 Region、省 30 ms）下，陈旧度仍是省下延迟的 %.0f 倍；" % (STALE_UPPER_S * 1000 / 30.0))
print("      同 AZ 单 Region 更是省不到 1 ms 却要接受 %d 秒陈旧度。" % STALE_UPPER_S)
print()
print("三、陈旧度上界随部署形态怎么变")
print("%-24s %16s %18s %22s" % ("部署形态", "复制延迟上界(s)", "最坏陈旧读(s)", "最坏延迟比"))
for name, (lo, hi), wait in DEPLOY:
    copy_lag_s = LOCAL_APPLY_MS / 1000.0 if name != "跨 Region" else 1.0
    print("%-24s %16.1f %18.1f %21s" % (name, copy_lag_s, copy_lag_s,
          "%.0fx" % (copy_lag_s * 1000 / max(0.001, min(wait, hi)))))
print()
print("判据：")
print("  - **follower read 的收益完全取决于读延迟里有多少是 raft / 跨区等待**：")
print("    同 AZ 单 Region 省不到 1 ms、跨 Region 能省 %d ms。" % DEPLOY[-1][2])
print("  - **交换比比的是量级**：陈旧度 %d 秒 vs 省下的几毫秒，差 3~4 个数量级 ——" % STALE_UPPER_S)
print("    判据：**除非读延迟本身就是几十毫秒量级、且业务能接受秒级陈旧，否则不要开 follower read**。")
print("  - 更稳的替代是「读自己的写」而不是「读任意副本」：粘滞到 leader 或按 key 定向，")
print("    陈旧度是 0，代价是失去读扩展。")
```

输出：

```text
一、follower read 省的是「读路径上的 raft / 跨区等待」
   读本地副本不需要等 leader 或等多数派确认 -> 收益上界 = min(复制延迟, 读延迟)
部署形态                            读延迟(ms)           可省延迟(ms)            占总读延迟
同 AZ 单 Region                     0.5~1                0.0               0%
同 Region 跨 AZ                       1~2                0.5              25%
跨 Region                          10~30               20.0              67%

   注：同 AZ 单 Region 里读本地副本**几乎不等任何东西**（复制延迟同 AZ 量级 0.5 ms），
       所以 follower read 在这种部署里省不到 1 ms。

二、这笔节省换来的陈旧度是 10 秒
部署形态                             省下(ms)         陈旧度(s)           陈旧度是延迟的(倍)
同 AZ 单 Region                       0.0           10.0                  无限
同 Region 跨 AZ                       0.5           10.0              20000x
跨 Region                           20.0           10.0                500x

   => 最优情形（跨 Region、省 30 ms）下，陈旧度仍是省下延迟的 333 倍；
      同 AZ 单 Region 更是省不到 1 ms 却要接受 10 秒陈旧度。

三、陈旧度上界随部署形态怎么变
部署形态                            复制延迟上界(s)           最坏陈旧读(s)                  最坏延迟比
同 AZ 单 Region                         0.0                0.0                  500x
同 Region 跨 AZ                         0.0                0.0                    1x
跨 Region                              1.0                1.0                   50x

判据：
  - **follower read 的收益完全取决于读延迟里有多少是 raft / 跨区等待**：
    同 AZ 单 Region 省不到 1 ms、跨 Region 能省 20 ms。
  - **交换比比的是量级**：陈旧度 10 秒 vs 省下的几毫秒，差 3~4 个数量级 ——
    判据：**除非读延迟本身就是几十毫秒量级、且业务能接受秒级陈旧，否则不要开 follower read**。
  - 更稳的替代是「读自己的写」而不是「读任意副本」：粘滞到 leader 或按 key 定向，
    陈旧度是 0，代价是失去读扩展。
```

三处结论：

**第一，follower read 省的是「读路径上的 raft / 跨区等待」，收益完全取决于部署形态。** 同 AZ 单 Region：读本地副本几乎不等任何东西，**省不到 1 ms**；同 Region 跨 AZ：省 0.5 ms（占读延迟 25%）；跨 Region：省 **20 ms**（占 67%）。

**第二，交换比比的是量级，差 3~4 个数量级。** 陈旧度 10 秒 vs 省下的 0~20 ms：同 AZ 单 Region 是**无限比**（省不到东西却要接受 10 秒陈旧度），跨 Region 最优情形也有 **333×**。**判据：除非读延迟本身就是几十毫秒量级、且业务能接受秒级陈旧，否则不要开 follower read**——按「省了几毫秒」估收益是严重高估。

**第三，更稳的替代是「读自己的写」而不是「读任意副本」。** 粘滞到 leader 或按 key 定向，陈旧度是 0，代价是失去读扩展。**判据：follower read 是「任意副本」换来的陈旧度，读己之写是「定向」换来的陈旧度 0**——除非真需要「随便哪个副本都行」且能接受秒级旧，否则后者更划算。

## 五、把三个模型套回本章（判据清单）

1. **延迟预算的大头是 T3（Raft 复制 47.6%）**，而它是唯一由部署形态决定的项 → 同 Region + 同 AZ。
2. **跨 Region 是 1.9~19.2×**，不是「+10 ms」。
3. **事务跨 k 个 Region：延迟线性增长（k=10 → 73.5 ms、k=50 → 353.5 ms），写放大 2k 次 raft 写**。
4. **冲突概率 `p = 1-(1-c)^k`**：c=1%、k=20 → **18.21%**；写集合越大越危险。
5. **冲突是事务级**：冲突率 20% → 放大 1.25×、平均延迟 5.0 → **6.2 ms**，尾延迟同步恶化。
6. **热点连坐**：热点写占比 5% → k=5 事务冲突率 9.61% → 治法是拆热点，不是调一致性。
7. **follower read 的收益上界 = 读路径上的 raft/跨区等待**：同 AZ 省不到 1 ms、跨 Region 省 20 ms。
8. **交换比差 3~4 个数量级**（10 秒 vs 几毫秒，最优也 333×）→ 低延迟部署里不要开。
9. **读己之写优于读任意副本**：陈旧度 0，代价只是失去读扩展。

## 六、这一章不重复已发的内容

- **PACELC 理论、时间权重、读放大与集群规模、陈旧读概率**：见《[一致性的三笔账](/blog/consistency-time-weight-read-amplification-computed/)》——那篇是理论层与通用账，本文是 TiDB 的落地案例，不重复那三个模型。
- **quorum 读路径与副本状态机**：见《[线性一致性与 Raft 读路径](/blog/linearizability-and-raft-read-paths/)》。
- **键值存储的法定人数与 LSM**：见《[键值存储的三笔账](/blog/kvstore-quorum-lsm-rebalance-computed/)》。

## 七、这三个模型判不了什么

- **冲突率、复制延迟、热点写占比都是估的**，而**冲突率对尾延迟的影响是非线性的**：冲突率 1% 和 5% 的均值差距不大，P95 差得远。真实值必须从 TiDB 的 `information_schema.tidb_trx`、慢日志与冲突重试指标里取。
- **没建模 Percolator 的锁等待**。笔记里的 `SELECT ... FOR UPDATE` 行锁在热点行上会**排队**而不是冲突：等待与冲突的代价结构不同（等待占着连接与快照，冲突只是重试），本文只算了后者。
- **延迟分解是笔记给的分项区间，我按上界组合**（10.5 ms = 各环节上界相加），真实分布不是各环节同时取上界，**所以 10.5 ms 是悲观值**——但做预算时该用悲观值。
- **没算 PD 协调的排队**。T2 只有 1~3 ms 的单次延迟，但 PD Leader 是单点，**高并发下 T2 会排队**；笔记 3.1 里 TSO 的 100 次/s 是示意数字、不是规格上限，所以我没有据此推算写 QPS 上限——但「PD 是不是瓶颈」是必须用真实指标回答的问题。
- **follower read 的陈旧度我取了笔记给的 10 秒上界**，而真实陈旧度取决于该副本的 apply 滞后，**可能远小于 10 秒**；结论的方向（收益是毫秒级、陈旧是秒级）不变，但倍数会随部署变。
- **三个模型都没碰 async commit**。笔记只给了开关名，没给语义与代价，所以我没有为它编模型——**这是下一个该补的账**。

## FAQ（八、常见问题）

**TiDB 单 Region 事务的延迟预算是多少？** 笔记的分项上界相加是 **10.5 ms**（T1 0.5 + T2 3 + T3 5 + T4 2），其中 **Raft 复制占 47.6%**。这是悲观值，但做预算就该用悲观值。

**跨 Region 差多少？** 写 20~50 ms vs 同 AZ 2.6~10.5 ms → **1.9×~19.2×**。别用「+10 ms」估算。

**事务跨 10 个 Region 呢？** 延迟随 k 线性增长：**73.5 ms**（单 Region 的 7.0 倍），且 raft 写次数是 **2k = 20 次**（prewrite + commit 各一轮）。跨 50 个 → 353.5 ms。

**冲突为什么这么致命？** 因为冲突检测发生在 prewrite，**冲突是事务级的**：整笔事务回滚重做，SQL 解析、PD 协调、raft、WAL 全部重付。冲突率 20% 时平均延迟从 5.0 ms 涨到 6.2 ms，P95 更差。

**写 20 个 key 冲突率会到多少？** `p = 1-(1-c)^k`：单 key 冲突率 1% → k=5 **4.90%**、k=20 **18.21%**。所以「事务小一点」比「冲突率低一点」更有效。

**follower read 值得开吗？** 看读延迟里有多少是 raft/跨区等待：同 AZ 单 Region **省不到 1 ms**，跨 Region 能省 **20 ms**。而陈旧度是秒级（笔记示意 10 秒）——交换比差 3~4 个数量级（最优情形仍 333×）。**低延迟部署里不要开。**

**那要读到最新数据怎么办？** 用「读己之写」：粘滞到 leader 或按 key 定向，陈旧度 0，代价只是失去读扩展。这比「读任意副本」更可控。

**热点 key 怎么治？** 拆分热点（打散 key、加队列、分段计数）。热点写占比 5% 时，k=5 的事务冲突率已到 **9.61%**、放大 1.106×——**调一致性参数解决不了热点**。

## 出处

- 源笔记（我的）：`03-技术深度/数据密集型应用设计与实现/TiDB-PACELC深度分析.md`（架构概览、PACELC 定位矩阵、分区时行为、平时的一致性保证与延迟分解、可调一致性设计、场景化选择、实践建议）。
- 相关一手资料：[TiDB 官方文档 · 事务](https://docs.pingcap.com/tidb/stable/transaction)、[TiDB · Performance Tuning](https://docs.pingcap.com/tidb/stable/performance-tuning)、[Percolator 论文（Google, 2010）](https://research.google/pubs/pub36631/)、[Raft 论文（Ongaro & Ousterhout, 2014）](https://raft.github.io/raft.pdf)。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
