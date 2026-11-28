---
title: "HBase 的三笔账：读放大、GC 与 compaction"
date: "2026-11-27"
description: "从《HBase 原理与实践》第 4 讲「Compaction 机制与性能调优」的讲义笔记里取机制骨架，补三个可跑的模型：读放大随不 compaction 天数的增长、写放大与删除比例的关系、以及 GC 频率与 throttle 的取舍。"
tldr: "HBase 的读放大随「不 compaction 的天数」线性增长：单 region 每天 flush 出 160 个 HFile（flush.size=128MB、每日写 20GB），7 天不 compact 就有 1,120 个文件/读。写放大 = 2.00 倍（读一遍写一遍），但有删除时更高：删除比例 50%、周期 7 天 -> 3.00x，90%、30 天 -> **11.00x**——因为 minor 不回收空间。GC 频率 = 分配率 / Eden 容量，STW 随 QPS 线性增长，而加内存与降分配效果相同（都是线性项）。throttle 2.5GB 是阈值不是上限：compaction 追不上写入就堆 HFile。"
keywords: ["HBase", "compaction", "读放大", "写放大", "IHOP"]
taxonomies:
  tags: ["HBase", "LSM", "技术深度", "课程笔记"]
---

HBase 的三笔账？读放大涨多快、写放大翻几倍、compaction 追不追得上写入。课程讲义把 Compaction 从机制讲到调参（为什么需要它、minor 与 major 的区别、触发条件、策略、线程池、对读写的影响，加上 GC 的 IHOP 与读写调优、HDFS 调优、关键参数表），但三笔账它是定性的。这篇把它们算出来。

## 口径说明

- 源是本地课程材料《HBase 原理与实践》第 4 讲「Compaction 机制与性能调优」的讲义笔记（13,239 字）。课程材料按**导读式**处理：**只复述章节骨架与机制，不引用讲义原文、不搬代码**，正文主体是**自写可复现模型**。
- 三个脚本只依赖 Python 标准库；输出为实跑结果，逐行可复现（无随机数，两次运行输出逐字一致）。
- 讲义里给出的量（`hbase.hregion.memstore.flush.size` = 128 MB、`hbase.regionserver.thread.compaction.throttle` = 2.5 GB、`hbase.client.write.buffer` = 2 MB、IHOP = 65% = MemStore 45% + L1-cache 10% + Buffer 10%、合理 MemStore 128~256 MB、请求处理的短寿对象约占 30%、Major Compaction 后数据本地化率可达 100%）直接标注来源；**我为了建模补的**（单 region 每日写入量、堆大小、QPS、每请求分配量、存活版本数、删除比例、region 数）都标为「估」。
- **撞题与边界**：已发《[键值存储的三笔账](/blog/kvstore-quorum-lsm-rebalance-computed/)》里有一个通用 LSM 玩具模型（Leveled 压实 444 次、落盘 14.16 TB、写放大 14.5 倍）。**那篇是通用 LSM 的抽象模型，本文是 HBase 特有的三个维度**：region 划分带来的「文件数 = 天数」关系、minor/major 的空间回收分工、以及 IHOP/throttle 这两个 HBase 专有参数。不重复那篇的模型。

## 一、讲义的骨架：Compaction 在 HBase 里解决什么

**为什么需要 Compaction**：写入路径是「WAL → MemStore → flush 成 HFile」；MemStore 默认 128 MB 刷盘（`flush.size`），刷一次就多一个 HFile。文件一多，**一次读要打开多个 HFile**（读放大），而且小文件本身对 HDFS 不友好——所以要合并，而合并就是写放大。讲义明确区分两种：

- **Minor Compaction**：合并若干个较小的 HFile 成一个较大的，不清理过期版本；
- **Major Compaction**：合并 **region 内全部** HFile 成一个，**并清理已被删除或过期的数据**。

**触发条件与策略**：minor 通常由「HFile 数超过阈值」触发，major 则由手工或后台按周期触发；讲义提到 major 会清理 delete marker 与过期版本，但**通常禁用自动触发**（因为它贵）。压缩还有线程池与优先级（写路径优先于读路径的压缩）。

**GC 调优**：HBase 的 GC 痛点不是数据本身，而是**请求处理过程中产生的短寿对象**（讲义给的量级是约 30%）；堆的初始占用由 IHOP 控制，设为 **65%** = MemStore 45% + L1-cache 约 10% + 写 Buffer 10%。

**读写与 HDFS 调优**：读侧靠 Bloom filter、BlockCache 与预读；写侧靠合理 MemStore 大小（128~256 MB）；Major Compaction 之后数据本地化率可达 100%。关键参数里 `hbase.client.write.buffer` = 2 MB、`compaction.throttle` = 2.5 GB（讲义标注为「大小合并阈值」）。

## 二、增量一：读放大随「不 compaction 的天数」线性增长

```python
"""HBase 的读放大：不 compaction 的天数是读放大的线性因子。

数字取自讲义（flush.size=128MB、minor/major compaction 的区别），其余为本脚本设定（估）。
只依赖标准库；输出确定性。
"""
FLUSH_MB = 128            # hbase.hregion.memstore.flush.size（讲义）
REGION_WRITE_GB_DAY = 20  # 单 region 每日写入量（估）
VERSIONS = 3              # 同一 key 的存活版本数（含 delete marker，估）

print("一、flush 产生多少 HFile")
files_per_day = REGION_WRITE_GB_DAY * 1024 / FLUSH_MB
print("   单 region 每日写入 %d GB，flush 大小 %d MB -> 每天产生 %.0f 个 HFile" % (
    REGION_WRITE_GB_DAY, FLUSH_MB, files_per_day))
print()
print("二、不 compaction 时，读放大的增长")
print("%-14s %14s %18s %20s %18s" % ("不 compact 天数", "HFile 数", "读放大(文件数)", "含版本后放大", "单文件均值"))
for days in (1, 3, 7, 14, 30):
    n = files_per_day * days
    print("%-14d %14.0f %18.0f %19.0f %17.1f MB" % (
        days, n, n, n * VERSIONS, REGION_WRITE_GB_DAY * 1024 * days / n))
print()
print("   => **读放大随「不 compact 的天数」线性增长**；每多放一天，",
      "一次读要打开的 HFile 就多一倍。")
print("      判据：**minor compaction 的触发条件要按「文件数上限」设计，而不是按时间**。")
print()
print("三、一次 major compaction 的代价")
print("%-14s %14s %16s %18s %18s" % ("不 compact 天数", "HFile 数", "读入(MB)", "写出(MB)", "写放大(无删除)"))
for days in (1, 7, 30):
    n = files_per_day * days
    read_mb = n * FLUSH_MB
    write_mb = REGION_WRITE_GB_DAY * 1024 * days
    wa = (read_mb + write_mb) / write_mb
    print("%-14d %14.0f %16s %18s %17.2fx" % (
        days, n, format(int(read_mb), ","), format(int(write_mb), ","), wa))
print()
print("   => **读入量约等于写入量，所以「读一遍 + 写一遍」= 写放大 2.00 倍**（周期越长越接近这个值）。")
print()
print("四、删除与 TTL 让写放大超过 2 倍")
print("%-14s %16s %16s %16s %18s" % ("周期 T", "删除比例 d", "读入(MB)", "写出(MB)", "写放大"))
for T, d in ((1, 0.0), (7, 0.2), (7, 0.5), (30, 0.9)):
    n = files_per_day * T
    read_mb = n * FLUSH_MB
    live_mb = REGION_WRITE_GB_DAY * 1024 * T * (1 - d)
    write_mb = live_mb
    wa = (read_mb + write_mb) / live_mb
    print("%-14s %16.0f%% %16s %16s %17.2fx" % (
        "%d 天" % T, d * 100, format(int(read_mb), ","), format(int(write_mb), ","), wa))
print()
print("   => **minor compaction 不回收空间，只有 major 才回收**；")
print("      所以删除比例 d 越高、major 周期越长，**写放大与空间放大越糟**。")
print("      判据：**有大量删除/TTL 的表，major compaction 周期要短**；")
print("      代价是 compaction 的 IO（读一遍死数据也读不回）。")
```

输出：

```text
一、flush 产生多少 HFile
   单 region 每日写入 20 GB，flush 大小 128 MB -> 每天产生 160 个 HFile

二、不 compaction 时，读放大的增长
不 compact 天数          HFile 数           读放大(文件数)               含版本后放大              单文件均值
1                         160                160                 480             128.0 MB
3                         480                480                1440             128.0 MB
7                        1120               1120                3360             128.0 MB
14                       2240               2240                6720             128.0 MB
30                       4800               4800               14400             128.0 MB

   => **读放大随「不 compact 的天数」线性增长**；每多放一天， 一次读要打开的 HFile 就多一倍。
      判据：**minor compaction 的触发条件要按「文件数上限」设计，而不是按时间**。

三、一次 major compaction 的代价
不 compact 天数          HFile 数           读入(MB)             写出(MB)           写放大(无删除)
1                         160           20,480             20,480              2.00x
7                        1120          143,360            143,360              2.00x
30                       4800          614,400            614,400              2.00x

   => **读入量约等于写入量，所以「读一遍 + 写一遍」= 写放大 2.00 倍**（周期越长越接近这个值）。

四、删除与 TTL 让写放大超过 2 倍
周期 T                     删除比例 d           读入(MB)           写出(MB)                写放大
1 天                           0%           20,480           20,480              2.00x
7 天                          20%          143,360          114,688              2.25x
7 天                          50%          143,360           71,680              3.00x
30 天                         90%          614,400           61,439             11.00x

   => **minor compaction 不回收空间，只有 major 才回收**；
      所以删除比例 d 越高、major 周期越长，**写放大与空间放大越糟**。
      判据：**有大量删除/TTL 的表，major compaction 周期要短**；
      代价是 compaction 的 IO（读一遍死数据也读不回）。
```

三处结论：

**第一，读放大是「天数」的直接函数。** 单 region 每日写入 20 GB、flush 128 MB → 每天产生 **160 个 HFile**；不 compact 7 天就是 **1,120 个文件/读**，30 天是 **4,800 个**。**判据：minor compaction 的触发条件要按「文件数上限」设计，而不是按时间**——因为文件数才是读放大的直接因变量。

**第二，写放大在没有删除时恰好是 2.00 倍。** 一次 major 要把 N 个 HFile 读一遍、再写一遍：读入量约等于写入量，所以 (读 + 写) / 有效数据 = **2.00x**，且周期越长越接近这个值。**判据：major compaction 的固有成本是「把数据重写一遍」**，这跟 LSM 家族的其他实现同源，但 HBase 把它压在 region 内部、可以用 region 数量和周期来调。

**第三，删除与 TTL 让写放大远超 2 倍，而只有 major 能回收。** major 周期 7 天、删除比例 50% → 读入 143 GB、写出 72 GB → **写放大 3.00x**；周期 30 天、删除 90% → **11.00x**。**判据：有大量删除或 TTL 的表，major compaction 周期必须短**——代价是 compaction 的 IO（死数据读进来也写不回去）。这正是讲义说「通常禁用自动 major」的原因：不是不该做，而是**不能按固定周期做，要按删除比例做**。

## 三、增量二：GC 频率是「分配率 / Eden 容量」

```python
"""HBase RegionServer 的 GC：频率由「分配率 / Eden 容量」决定。

数字取自讲义（IHOP=65% = MemStore 45% + L1-cache 10% + Buffer 10%、短寿对象约占 30%），
其余为估。只依赖标准库；输出确定性。
"""
HEAP_GB = 32              # RegionServer 堆（估）
IHOP = 0.65               # 初始堆占用百分比（讲义）
EDEN_SHARE = 0.30         # Eden 占堆的比例（估）
QPS = 20_000              # 请求 QPS（估）
ALLOC_PER_REQ_KB = 20     # 每请求分配的临时对象（估）
SHORT_LIVED = 0.30        # 短寿对象占比（讲义）
STW_MS = 10               # 每次 young GC 的 STW（估）

print("一、堆与 Eden 的分配")
eden_gb = HEAP_GB * EDEN_SHARE
print("   堆 %d GB，IHOP %d%% -> 初始占用 %.1f GB（MemStore 45%% + L1-cache 10%% + Buffer 10%%）" % (
    HEAP_GB, IHOP * 100, HEAP_GB * IHOP))
print("   Eden 约 %.1f GB（堆的 %.0f%%）" % (eden_gb, EDEN_SHARE * 100))
print()
print("二、GC 频率 = 分配率 / Eden 容量")
print("%-10s %16s %14s %16s %18s" % ("QPS", "分配率(GB/s)", "GC 间隔(s)", "GC 次数/小时", "STW 占比"))
for qps in (2_000, 10_000, 20_000, 50_000, 100_000):
    alloc_gb_s = qps * ALLOC_PER_REQ_KB / 1024 / 1024
    interval = eden_gb / alloc_gb_s
    per_hour = 3600 / interval
    stw = per_hour * STW_MS / 1000 / 3600 * 100
    print("%-10s %16.2f %14.1f %16.0f %17.3f%%" % (
        format(qps, ","), alloc_gb_s, interval, per_hour, stw))
print()
print("   => QPS 翻 10 倍，STW 占比也翻 10 倍 —— **GC 压力随 QPS 线性增长**。")
print()
print("三、加内存 vs 降分配：同样效果，哪个便宜")
base_qps = 20_000
def stw_share(heap_gb, alloc_per_req_kb, qps=base_qps):
    eden = heap_gb * EDEN_SHARE
    alloc = qps * alloc_per_req_kb / 1024 / 1024
    interval = eden / alloc
    return 3600 / interval * STW_MS / 1000 / 3600 * 100
base = stw_share(HEAP_GB, ALLOC_PER_REQ_KB)
mem2x = stw_share(HEAP_GB * 2, ALLOC_PER_REQ_KB)
alloc_half = stw_share(HEAP_GB, ALLOC_PER_REQ_KB / 2)
print("   基线（堆 %d GB、每请求 %d KB）：STW %.3f%%/小时" % (HEAP_GB, ALLOC_PER_REQ_KB, base))
print("   堆加到 %d GB：          STW %.3f%%/小时（降 %.0f%%）" % (HEAP_GB * 2, mem2x, 100 * (1 - mem2x / base)))
print("   每请求分配减半：        STW %.3f%%/小时（降 %.0f%%）" % (alloc_half, 100 * (1 - alloc_half / base)))
print()
print("   => 两者效果相同（都是线性项），但**加内存是花钱买机器，降分配是改代码**。")
print("      判据：**同等 STW 收益下，先改分配再动内存**。")
print()
print("四、短寿对象的份额决定了这笔账的大小")
print("%-18s %18s %20s" % ("短寿对象占比", "有效分配率(GB/s)", "GC 间隔(s)"))
for share in (0.10, 0.30, 0.60, 0.90):
    alloc = base_qps * ALLOC_PER_REQ_KB / 1024 / 1024 * share
    print("%-18s %18.2f %19.1f" % ("%.0f%%" % (share * 100), alloc, eden_gb / alloc))
print()
print("   => 讲义给的 30% 意味着**七成的分配是数据本身、只有三成是请求处理时的临时对象**；")
print("      把这 30% 压下去，GC 间隔就线性拉长 —— 这是 HBase GC 调优的真实靶子。")
```

输出：

```text
一、堆与 Eden 的分配
   堆 32 GB，IHOP 65% -> 初始占用 20.8 GB（MemStore 45% + L1-cache 10% + Buffer 10%）
   Eden 约 9.6 GB（堆的 30%）

二、GC 频率 = 分配率 / Eden 容量
QPS               分配率(GB/s)       GC 间隔(s)         GC 次数/小时             STW 占比
2,000                  0.04          251.7               14             0.004%
10,000                 0.19           50.3               72             0.020%
20,000                 0.38           25.2              143             0.040%
50,000                 0.95           10.1              358             0.099%
100,000                1.91            5.0              715             0.199%

   => QPS 翻 10 倍，STW 占比也翻 10 倍 —— **GC 压力随 QPS 线性增长**。

三、加内存 vs 降分配：同样效果，哪个便宜
   基线（堆 32 GB、每请求 20 KB）：STW 0.040%/小时
   堆加到 64 GB：          STW 0.020%/小时（降 50%）
   每请求分配减半：        STW 0.020%/小时（降 50%）

   => 两者效果相同（都是线性项），但**加内存是花钱买机器，降分配是改代码**。
      判据：**同等 STW 收益下，先改分配再动内存**。

四、短寿对象的份额决定了这笔账的大小
短寿对象占比                    有效分配率(GB/s)             GC 间隔(s)
10%                              0.04               251.7
30%                              0.11                83.9
60%                              0.23                41.9
90%                              0.34                28.0

   => 讲义给的 30% 意味着**七成的分配是数据本身、只有三成是请求处理时的临时对象**；
      把这 30% 压下去，GC 间隔就线性拉长 —— 这是 HBase GC 调优的真实靶子。
```

三处结论：

**第一，GC 频率由两个量决定：分配率与 Eden 容量。** 堆 32 GB、Eden 约 9.6 GB 时：2,000 QPS → GC 间隔 251.7 s；20,000 QPS → 25.2 s；100,000 QPS → **5.0 s**（每小时 715 次）。**判据：STW 占比随 QPS 线性增长**（0.00% → 0.20%/小时），所以高 QPS 下的 GC 问题不是「JVM 配得不好」，是**每请求的临时分配被 QPS 放大了**。

**第二，加内存与降分配的效果完全一样，因为两者都是线性项。** 基线 STW 0.040%/小时；堆加到 64 GB → 0.020%（降 50%）；每请求分配从 20 KB 减到 10 KB → 0.020%（同样降 50%）。**判据：同等 STW 收益下，先改分配、再动内存**——一个是改代码，一个是花钱买机器。

**第三，讲义给的 30% 就是这笔账的靶子。** 短命对象占比从 10% 升到 90%，有效分配率从 0.04 升到 0.34 GB/s、GC 间隔从 251.7 s 缩到 28.0 s。**判据：七成分配是数据本身，只有三成是请求处理时的临时对象**——把这三成压下去，GC 间隔线性拉长；这比「调 GC 参数」更对症。

## 四、增量三：throttle 的唯一正确依据是「追得上写入」

```python
"""compaction 追不追得上写入：IO 摊薄与读放大的同一个旋钮。

数字取自讲义（flush.size=128MB、throttle 2.5GB、Major Compaction 后本地化率可达 100%），
其余为估。只依赖标准库；输出确定性。
"""
FLUSH_MB = 128
THROTTLE_GB = 2.5
REGION_WRITE_GB_DAY = 20
REGIONS = 10               # 表的 region 数（估）

print("一、每天的 IO 账（单 region）")
files_day = REGION_WRITE_GB_DAY * 1024 / FLUSH_MB
write_gb = REGION_WRITE_GB_DAY
print("   写入 %d GB/天 -> flush 出 %.0f 个 HFile（每个 %d MB）" % (write_gb, files_day, FLUSH_MB))
print("   compaction 要读 %.0f MB、写出 %.0f MB -> **compaction 的 IO 是写入的 %.2f 倍**" % (
    files_day * FLUSH_MB, write_gb * 1024, (files_day * FLUSH_MB + write_gb * 1024) / (write_gb * 1024)))
print()
print("二、major compaction 周期 T 的两端代价")
print("%-10s %16s %18s %20s %22s" % ("周期 T", "每天摊薄 IO(GB)", "相对写入", "读放大(文件数)", "每天 compaction IO"))
for T in (1, 3, 7, 14, 30):
    per_day_compaction = REGION_WRITE_GB_DAY * (1024 * 2) / T / 1024   # 读写两遍摊到每天
    io_ratio = 1 + 2.0 / T
    read_amp = files_day * T
    print("%-10s %16.1f %17.2fx %19.0f %21.1f GB" % (
        "%d 天" % T, per_day_compaction, io_ratio, read_amp, per_day_compaction))
print()
print("   => **T 短 -> IO 压力大但读放大低；T 长 -> IO 省了但读放大线性涨**。")
print()
print("三、throttle 2.5GB 的含义：单次 compaction 写多少")
print("   一次 major compaction 要写出该 region 的全部数据 = %d GB" % REGION_WRITE_GB_DAY)
n_throttle = REGION_WRITE_GB_DAY / THROTTLE_GB
print("   throttle 上限 %d GB -> 这一次 compaction 要经过 %.1f 个 throttle 档位" % (THROTTLE_GB, n_throttle))
print()
print("   => 讲义里 throttle 是「大小合并阈值」：待 compact 的数据量超过 %.1f GB 档位后**开始限速**。" % THROTTLE_GB)
print("      单次 major 要处理 %.0f GB，远超档位 -> 必然进入限速区；" % REGION_WRITE_GB_DAY)
print("      判据：**throttle 调小会让 compaction 追不上写入**，")
print("      追不上就意味着 HFile 堆起来、读放大上升 —— 这是 throttle 唯一的正确调法依据。")
print()
print("四、整表尺度")
for T in (1, 7):
    io_total = REGIONS * REGION_WRITE_GB_DAY * (1 + 2.0 / T)
    read_total = files_day * T
    print("   T=%2d 天：全表 compaction IO %s GB/天；最坏读放大 %.0f 个文件/读" % (
        T, format(int(io_total), ","), read_total))
print()
print("判据：")
print("  - **compaction 的 IO 是写入的 2 倍**（读一遍 + 写一遍）-> compaction 带宽不够时，")
print("    写路径一定被拖累，这就是 throttle 存在的理由。")
print("  - **周期 T 是唯一的旋钮**：IO 摊薄是 1 + 2/T（1 天 -> 3.0x，7 天 -> 1.29x），")
print("    读放大是 T x 每天的 HFile 数（T=7 -> 1,120 个文件/读）-> 两头一起动。")
print("  - **throttle 调小的唯一正确依据是「追得上写入」**，不是「让 compaction 快一点」；")
print("    调小的直接后果是 HFile 堆积 -> 读放大上升。")
```

输出：

```text
一、每天的 IO 账（单 region）
   写入 20 GB/天 -> flush 出 160 个 HFile（每个 128 MB）
   compaction 要读 20480 MB、写出 20480 MB -> **compaction 的 IO 是写入的 2.00 倍**

二、major compaction 周期 T 的两端代价
周期 T            每天摊薄 IO(GB)               相对写入             读放大(文件数)       每天 compaction IO
1 天                    40.0              3.00x                 160                  40.0 GB
3 天                    13.3              1.67x                 480                  13.3 GB
7 天                     5.7              1.29x                1120                   5.7 GB
14 天                    2.9              1.14x                2240                   2.9 GB
30 天                    1.3              1.07x                4800                   1.3 GB

   => **T 短 -> IO 压力大但读放大低；T 长 -> IO 省了但读放大线性涨**。

三、throttle 2.5GB 的含义：单次 compaction 写多少
   一次 major compaction 要写出该 region 的全部数据 = 20 GB
   throttle 上限 2 GB -> 这一次 compaction 要经过 8.0 个 throttle 档位

   => 讲义里 throttle 是「大小合并阈值」：待 compact 的数据量超过 2.5 GB 档位后**开始限速**。
      单次 major 要处理 20 GB，远超档位 -> 必然进入限速区；
      判据：**throttle 调小会让 compaction 追不上写入**，
      追不上就意味着 HFile 堆起来、读放大上升 —— 这是 throttle 唯一的正确调法依据。

四、整表尺度
   T= 1 天：全表 compaction IO 600 GB/天；最坏读放大 160 个文件/读
   T= 7 天：全表 compaction IO 257 GB/天；最坏读放大 1120 个文件/读

判据：
  - **compaction 的 IO 是写入的 2 倍**（读一遍 + 写一遍）-> compaction 带宽不够时，
    写路径一定被拖累，这就是 throttle 存在的理由。
  - **周期 T 是唯一的旋钮**：IO 摊薄是 1 + 2/T（1 天 -> 3.0x，7 天 -> 1.29x），
    读放大是 T x 每天的 HFile 数（T=7 -> 1,120 个文件/读）-> 两头一起动。
  - **throttle 调小的唯一正确依据是「追得上写入」**，不是「让 compaction 快一点」；
    调小的直接后果是 HFile 堆积 -> 读放大上升。
```

三处结论：

**第一，compaction 的 IO 是写入的 2 倍。** 每个字节要被读一遍、写一遍，所以 compaction 的 IO 需求 = **2 × 写入量**。**判据：compaction 带宽不够时，写路径一定被拖累**——这就是 throttle 存在的理由（讲义里 throttle = 2.5 GB，标注为「大小合并阈值」）。

**第二，周期 T 是唯一的旋钮，两头一起动。** IO 摊薄 = 1 + 2/T：T=1 天 → **3.0×**、T=7 天 → 1.29×；读放大 = T × 每天的 HFile 数：T=7 → **1,120 个文件/读**。整表尺度（10 个 region）：T=1 天 → 每天 600 GB compaction IO、读放大 160；T=7 天 → 257 GB、读放大 1,120。**判据：T 短则 IO 重但读快，T 长则 IO 省但读慢**——这就是为什么 major compaction 的周期不该照抄，而要按删除比例与写入速率定。

**第三，throttle 是阈值不是上限，调小的唯一依据是「追得上」。** 单次 major 要处理 20 GB，远超 2.5 GB 档位 → 必然进入限速区。**判据：throttle 调小 → compaction 变慢 → 追不上写入 → HFile 堆积 → 读放大上升**。所以「把 throttle 调小让 compaction 快点」是反效果；throttle 该按「compaction 的处理能力 vs 写入速率」来配。

## 五、把三个模型套回本章（判据清单）

1. **读放大 = 不 compaction 的天数 × 每天 flush 出的文件数**：每天 160 个 → 7 天 1,120、30 天 4,800。
2. **minor compaction 的触发条件按「文件数上限」设计，不按时间**。
3. **无删除时写放大恰为 2.00 倍**（读一遍 + 写一遍）。
4. **删除让写放大远超 2 倍**：d=50%、T=7 天 → 3.00x；d=90%、T=30 天 → **11.00x**；**只有 major 回收空间**。
5. **GC 频率 = 分配率 / Eden 容量**：20,000 QPS → 间隔 25.2 s、715 次/小时（100k QPS 时 5.0 s）。
6. **STW 随 QPS 线性增长**；**加内存与降分配效果相同**（都是线性项）→ 先改分配。
7. **短命对象占比就是靶子**：讲义的 30% → 压下去 GC 间隔线性拉长。
8. **compaction IO = 写入的 2 倍**；周期 T 的 IO 摊薄 = 1 + 2/T（T=1 → 3.0x，T=7 → 1.29x）。
9. **throttle 是阈值不是上限**：调小的唯一依据是「compaction 追得上写入」，否则 HFile 堆积、读放大上升。

## 六、这一章不重复已发的内容

- **通用 LSM 的压实与写放大玩具模型**：见《[键值存储的三笔账](/blog/kvstore-quorum-lsm-rebalance-computed/)》——那篇是抽象 LSM；本文讲 HBase 特有的 region 维度、minor/major 的空间回收分工、IHOP 与 throttle。
- **HBase 2.5 版的读写顺序**（锁在 WAL 之前、MemStore 与 MVCC 的时序）：见《[HBase 读写顺序](/blog/hbase-read-write-order-in-2-5/)》——本文只讲 compaction 与 GC。
- **日志系统里用 HBase 的角色**（Filebeat/Kafka/Flink/ES/ClickHouse/HBase）：见《[日志系统](/blog/log-system-filebeat-kafka-flink-es-clickhouse-hbase/)》。

## 七、这三个模型判不了什么

- **单 region 每日 20 GB、堆 32 GB、20,000 QPS、每请求 20 KB、删除比例、region 数全是估的**。其中**每日写入量最敏感**：它同时决定每天的 HFile 数（读放大的斜率）与 compaction 的 IO 量，估错 3 倍，读放大的结论就差 3 倍。
- **写放大只算了「读一遍 + 写一遍」，没算「读放大对读路径的额外 IO」**：读放大 1,120 时，一次读要打开 1,120 个文件——**读侧的 IO 成本甚至可能超过写侧**，本模型没量这一项。
- **没算 Bloom filter 的过滤作用**。HBase 的读放大不是「每个 HFile 都要完整读一遍」——Bloom filter 会否掉大部分不相关的文件。**本文的读放大是上界**，真实代价更接近「候选文件数」而非「全部文件数」。这是本模型最大的乐观偏差。
- **GC 模型把 Eden 固定为堆的 30%、STW 固定 10 ms**，而真实 JVM 的 GC 行为受存活率、对象年龄分布、G1 的region 划分影响很大；heap 加倍也不保证 Eden 精确加倍（自适应策略会改）。所以「加内存与降分配等效」是**一阶近似**。
- **短命对象 30% 是讲义给的量级**，不是本机实测；不同 RegionServer 版本、不同 handler 路径差别很大。
- **throttle 的语义按讲义的「大小合并阈值」建模**，实际 HBase 的节流逻辑还涉及并发 compaction 数与优先级队列，比这里复杂；本文只用了「超过档位开始限速」这一层。
- **三个模型都没碰 HBase 特有的 region 切分**：region 数量本身由数据量与请求分布决定，切得太碎会让每 region 的文件数少但 compaction 次数多（每次 compaction 的固定开销 × 次数）。**这是「region 数量 → compaction 次数」的另一笔账**，值得单独算。

## FAQ（八、常见问题）

**读放大会涨多快？** 线性：每天 flush 160 个 HFile（20 GB/天、flush 128 MB），不 compact 7 天就是 **1,120 个文件/读**，30 天 **4,800 个**。**所以 minor 的触发条件要按文件数上限设，不按时间。**

**写放大是多少？** 无删除时恰 **2.00 倍**（读一遍 + 写一遍）。有删除就更高：删除 50%、周期 7 天 → **3.00x**；删除 90%、周期 30 天 → **11.00x**。

**为什么删除让写放大变差？** 因为 **minor compaction 不回收空间，只有 major 才清理 delete marker 与过期版本**——死数据照样要被读进来，却写不回去。

**GC 频率怎么算？** **分配率 / Eden 容量**：堆 32 GB、Eden 9.6 GB 时，20,000 QPS 每 25.2 s 一次 GC、每小时 143 次；100,000 QPS 每 5.0 s、715 次。STW 占比随 QPS 线性增长。

**GC 调优该加内存还是改代码？** 效果一样（都是线性项）：堆翻倍 → STW 降 50%；每请求分配减半 → 同样降 50%。**先改分配**，因为一个改代码一个花钱。

**短命对象占多少？** 讲义给的量级是约 **30%**（其余是数据本身）。这个比例就是靶子：压到 10%，GC 间隔从 83.9 s 拉长到 251.7 s。

**throttle 2.5GB 是什么意思？** 是**阈值不是上限**——待 compact 的数据量超过它就开始限速。单次 major 要处理 20 GB，必然进入限速区。

**那 throttle 该调大还是调小？** 看「compaction 追不追得上写入」。调小 → compaction 变慢 → HFile 堆积 → 读放大上升。**「调小让 compaction 快点」是反效果**。

**major compaction 周期定多少？** 由删除比例定，不是照抄：T=1 天 → compaction IO 是写入的 3.0 倍、读放大 160；T=7 天 → IO 1.29 倍、读放大 1,120。**删除多的表要短周期**（读侧优先），删除少的表可以长周期（IO 优先）。

## 出处

- 源（本地课程材料，讲义笔记）：《HBase 原理与实践》第 4 讲「Compaction 机制与性能调优」——为什么需要 compaction、minor 与 major 的区别与清理范围、触发条件与策略、压缩线程池、对读写的影响、GC 与 IHOP 调优、读写性能优化、HDFS 调优、设计权衡表、关键配置参数。本文按导读式处理：只复述骨架，代码与数字全部自写。
- 相关一手资料：[Apache HBase · Compaction 官方文档](https://hbase.apache.org/book.html#compaction)、[Apache HBase · 内存配置与 IHOP](https://hbase.apache.org/book.html#memory)、[HBase 官方 · 性能调优章节](https://hbase.apache.org/book.html#perf_tuning)。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
