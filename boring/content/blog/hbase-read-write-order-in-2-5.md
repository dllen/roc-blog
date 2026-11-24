---
title: "HBase 读写流程：讲义的两处顺序在 2.5 上已经变了"
date: 2026-11-24
update_date: 2026-11-24
description: "《HBase 原理与实践》讲义把读取路径画成「BlockCache → MemStore → HFile」三级阶梯，把取行锁排在 WAL 之后。核对 2.5.5 源码：get 走合并 Scanner，写入顺序是取锁 → WAL append+sync → MemStore → 完成 MVCC → 解锁。"
tldr: "讲义印的顺序是某个版本的事实，不是 HBase 的恒定性质。而且「先查 BlockCache」不只是慢——它会读出旧值：BlockCache 里根本没有 MemStore 的最新写。"
keywords: ["HBase 读路径", "HBase 写入顺序", "MVCC 可见性", "讲义核对源码"]
taxonomies:
  tags: ["HBase", "源码核对", "存储", "课程笔记"]
---

《HBase 原理与实践》第三章的讲义笔记里，HBase 读写路径被画成一张三级阶梯：**BlockCache 没有 → MemStore 没有 → 才去读 HFile**；而同一章的面试问答里，写法却是「先检查 MemStore（最新数据）→ 再看 BlockCache → 最后扫 HFile」。同一份材料里，读取顺序出现了两个版本。

这篇要说的是：这两处都不是 HBase 今天的做法，而且**「BlockCache 优先」那个版本不只是慢，它会读出旧值**。核对方式是直接读 HBase 源码（rel/2.5.5，2026-11-24 抓取），HBase 读路径在 2.x 已经不再是三级阶梯，写入路径的锁序也变了。

## 一、错在哪：BlockCache 里根本没有「最新写」

先把机制说清楚，再看代码。

- **MemStore** 是 Region 进程内的内存写缓冲，刚写进去的数据只在这里，还没 flush 成 HFile。
- **HFile** 是落盘的不可变文件，MemStore 刷写时才产生。
- **BlockCache** 缓存的是 **HFile 的 block**（以及索引 block），它由读路径在读 HFile 时填充。

也就是说：**BlockCache 是 HFile 那一层的加速缓存，它不装 MemStore 的数据。** 如果一个 cell 刚写进 MemStore，那么 BlockCache 里不可能有它的最新版本——那里最多是同一个 row 的旧版本（如果之前被 flush 过并且被读过）。

于是「先查 BlockCache，命中就直接返回」这个顺序，在「刚写完立刻读」的场景下会返回旧值。讲义那张流程图里 `BlockCache? ──Yes──► 直接返回` 这一支，缺一个前提：**它假设被缓存的 block 是最新的**。这个假设在有未 flush 写入时不成立。

## 二、源码证据：2.5 的 get 就是一次 Scan

读 HBase 的 Region 端实现，最直接的入口是 `HRegion.get`：

```java
// HRegion.java, rel/2.5.5, L7358-7404
@Override
public List<Cell> get(Get get, boolean withCoprocessor) throws IOException {
  return get(get, withCoprocessor, HConstants.NO_NONCE, HConstants.NO_NONCE);
}

private List<Cell> getInternal(Get get, boolean withCoprocessor, long nonceGroup, long nonce)
    throws IOException {
  List<Cell> results = new ArrayList<>();
  ...
  Scan scan = new Scan(get);
  ...
  try (RegionScanner scanner = getScanner(scan, null, nonceGroup, nonce)) {
    List<Cell> tmp = new ArrayList<>();
    scanner.next(tmp);
    ...
  }
  ...
  return results;
}
```

（[完整源码](https://github.com/apache/hbase/blob/rel/2.5.5/hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java#L7369-L7404)）

同一形态在 `rel/2.4.17` 里也成立——那段代码内联在 `public List<Cell> get(...)` 里（L8028 起），`new Scan(get)`、`getScanner(...)`、`scanner.next(tmp)` 三个关键调用一字不差，只是没有拆成独立的 `getInternal` 方法。所以这个读法不是某个新版本的新花样，而是 2.x 的一贯做法。

关键只有一句：`get` 被实现成 `new Scan(get)` 然后交给 `getScanner(...)` 扫。也就是说——

**Region 级的取数只有一条路径：合并 Scanner。** MemStore 与各个 HFile 的内容由 Scanner 体系合并后一起扫，版本可见性由 MVCC（时间戳 / sequenceId）在合并过程中裁决。BlockCache 在这条路径里的位置是 **HFile 读 block 时的缓存命中判断**，它不是流程的第一步，也不是一个可以「命中即返回」的独立分支。

所以讲义那张三级阶梯，描述的不是 2.x 的实现，甚至不是任何现代版本 HBase 的实现；它更像是从「内存 → 缓存 → 磁盘」这种朴素存储模型类比出来的图。

## 三、可运行的最小模型：两种顺序差在哪

把上面那个机制写成代码，两种读取策略的结果差别是可判定的（代码为自写演示）：

```python
from dataclasses import dataclass


@dataclass
class Cell:
    row: str
    ts: int
    value: str


# 场景：用户刚更新了余额（只写进 MemStore，还没 flush 成 HFile）
MEMSTORE = [Cell("u1", 100, "余额=100（最新写，只在内存）")]
# 旧版本已经刷盘成 HFile，并且它的 block 此刻正好在 BlockCache 里
HFILE_BLOCK = [Cell("u1", 90, "余额=90（旧版本，已刷盘）")]
BLOCK_CACHE = {"u1": HFILE_BLOCK}   # BlockCache 只缓存 HFile 的 block


def read_by_ladder():
    """讲义流程图的顺序：BlockCache? → MemStore? → HFile。"""
    if "u1" in BLOCK_CACHE:
        return BLOCK_CACHE["u1"][0].value, "命中 BlockCache"
    if MEMSTORE:
        return MEMSTORE[0].value, "命中 MemStore"
    return HFILE_BLOCK[0].value, "读 HFile"


def read_by_merged_scan():
    """2.5 的实现：get 走 Scanner，MemStore 与 HFile 结果合并后取最新版本。"""
    candidates = MEMSTORE + HFILE_BLOCK
    newest = max(candidates, key=lambda c: c.ts)
    return newest.value, "合并扫描取最新版本"


if __name__ == "__main__":
    print("== 讲义流程图顺序（BlockCache → MemStore → HFile）==")
    value, why = read_by_ladder()
    print("  读到:", value, "| 路径:", why)

    print("== 2.5 实际（合并 Scanner，取最新版本）==")
    value2, why2 = read_by_merged_scan()
    print("  读到:", value2, "| 路径:", why2)

    print("== 结论 ==")
    print("  讲义顺序漏读最新写入:", read_by_ladder()[0] != MEMSTORE[0].value)
    print("  合并扫描读到最新写入:", read_by_merged_scan()[0] == MEMSTORE[0].value)
```

```text
== 讲义流程图顺序（BlockCache → MemStore → HFile）==
  读到: 余额=90（旧版本，已刷盘） | 路径: 命中 BlockCache
== 2.5 实际（合并 Scanner，取最新版本）==
  读到: 余额=100（最新写，只在内存） | 路径: 合并扫描取最新版本
== 结论 ==
  讲义顺序漏读最新写入: True
  合并扫描读到最新写入: True
```

两行结论读起来像绕口令，其实是一件事的两面：按讲义那张阶梯读，**会读到旧值**（90 而不是 100）；按 2.5 的实际做法读，才拿到最新写。

顺带说清楚这个模型没有覆盖什么：真实的 BlockCache 有淘汰、有多副本、有 block 粒度，真实的 Scanner 有 MVCC 可见性判断、有 Column Family 拆分、有 Bloom Filter 预过滤。模型只保留一条因果——**BlockCache 的内容来自 HFile，因此它回答不了「刚写进去的那一版在哪」这个问题**。而这个问题在 HBase 里只有一个答案：在 MemStore 里，所以 MemStore 必须在同一次扫描里参与合并。

## 四、第二处漂移：写入路径的锁序也变了

讲义给的写入链路是：写 WAL → 写 MemStore → 获取行锁 → 检查时间戳 → 释放行锁 → Sync WAL → 打开 MVCC。这套顺序对应的是更早时期 HBase 的做法（WAL 先 append 进 OS 页缓存，MemStore 写入后释放行锁，随后才 sync 刷盘，最后打开 MVCC）。**需要说明的是：我核的是 2.4.17 与 2.5.5，两版的这个顺序完全一致；更早的 0.9x 分支我没有核，所以「更早的做法」这半句属于推断，不作为核对结论。**

HBase 2.5.5 的 `HRegion` 里，写路径被写成了带编号的步骤注释（[源码](https://github.com/apache/hbase/blob/rel/2.5.5/hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java#L7531-L7634)）：

```java
// STEP 1. Run pre-process hook
// STEP 2. Acquire the row lock(s)
// STEP 3. Region lock
// STEP 4. Let the processor scan the rows, generate mutations and add waledits
// STEP 5. Call the preBatchMutate hook
// STEP 6. Append and sync if walEdit has data to write out.
// STEP 7. Apply to memstore
// STEP 8. call postBatchMutate hook
// STEP 9. Complete mvcc.
// STEP 10. Release region lock
// STEP 11. Release row lock(s)
```

对照下来有两处不同，而且都影响正确性：

**锁在 WAL 之前。** 2.5 是「取行锁 → 写 WAL 并 sync → 写 MemStore → 完成 MVCC → 释放行锁」。讲义的顺序是先写 WAL 和 MemStore、再取行锁，意味着同一行的并发写可能在 MemStore 里交错，而行锁并没有覆盖这段。锁先取，就把「同一行的写被串行化」这件事覆盖到了 WAL 落盘之前。

**sync 和 append 合并成一步，且都在锁内。** 讲义把 `Sync WAL` 单独排在释放行锁之后；2.5 把它并入 STEP 6（append and sync），仍在持有行锁的区间内。

这也解释了讲义里那两个「Branch」到底是什么。讲义说 Branch-1 是「先释放行锁，再 Sync WAL，最后打开 MVCC」，Branch-2 是「解耦行锁和 WAL Sync，允许更高并发写入」——这描述的是**并发度上的取舍**（锁持有时间越短，并发写吞吐越高），而不是 MVCC 可见性的打开顺序。两个概念被并列写在同一节里，容易读成「顺序有两种正确写法」。实际上：可见性（MVCC complete）总是在数据写入 memstore 之后、响应返回之前完成，这一点各版本一致；变的是锁与 sync 的相对位置。

## 五、这堂课的收获不是 HBase，是核对方法

这类讲义笔记有个共同风险：**把「某个版本的事实」写成了「系统的固有性质」**。HBase 的读路径阶梯和写入锁序都属于这类——它们在某个版本成立，换个版本就变，而讲义不会标注版本。

所以核对方法可以固定成三步：

1. **机制和顺序分开看。** 「MemStore 优先于 HFile」「BlockCache 缓存 HFile 的 block」是机制，基本不变；「先查 A 再查 B」「先 append 再 sync」是顺序，会随版本变。讲义里被画成流程图的，多半是顺序。
2. **顺序类的陈述回源码核，并标版本。** 本文所有结论都对着 `rel/2.5.5` 的行号写；换版本就要重新核。我把 `rel/2.4.17` 也拉下来对了一遍：**行号有出入**（批量写路径的 STEP 1 在 2.4.17 是 L8194，2.5.5 是 L7531），**但关键结构一致**——`get` 同样是 `new Scan(get)` 交给 `getScanner`（2.4 里这段代码内联在 `public get` 里，还没拆出 `getInternal`），写路径同样是 11 步、顺序一字不差（见下文第四节的对照）。
3. **版本漂移本身就是内容。** 「讲义说 A，源码是 B」是一个可写、可验证的发现，而不是需要绕开的尴尬。把它写成文章，比复述讲义那 375 行更有增量。

顺带说一个我在核对时注意到的细节：讲义里 Coprocessor 那节的警告（钩子在数据路径上执行、用不好严重影响性能）是对的，方向没问题；但它同样没标版本——Coprocessor 的实现机制在 2.x 换过（Observer 接口的迁移），真要写文章还得再核一遍。这本讲义适合当提纲，不适合当实现规格。

## 与已发文章的关系

- [线性一致性：共识给不了，得自己配](/blog/linearizability-and-raft-read-paths/)：同样是读路径与可见性——Raft 那篇讲的是「怎么让读拿到最新状态」，HBase 这篇讲的是「怎么让读拿到最新版本」，两者都在回答同一个问题的不同层。
- [分布式锁实践与对比：Redis、ZooKeeper、etcd、数据库](/blog/distributed-locks/)：HBase 的行锁是「单机进程内的锁 + 单调序列号」，与分布式锁不在一个量级；两相对照能看清锁与一致性各自的边界。
- [高性能开发参考手册](/blog/high-performance-low-latency-handbook/)：缓存层、读写路径、延迟预算的通用清单，本文相当于把它落到一个具体存储引擎上做了一次核对。

## 出处

- 源笔记：`02-课程体系/Hbase原理与实践/03.HBase 写入与读取流程.md`（《HBase 原理与实践》第三章读书笔记）
- 一手源码：[apache/hbase `rel/2.5.5` 的 `HRegion.java`](https://github.com/apache/hbase/blob/rel/2.5.5/hbase-server/src/main/java/org/apache/hadoop/hbase/regionserver/HRegion.java)（2026-11-24 抓取；对照了 `rel/2.4.17`：get 的 Scan 形态与写路径 11 步顺序两版一致，仅行号不同）
- 本文代码为自写演示，用于隔离「BlockCache 只装 HFile 的 block」这一条因果，不复刻 HBase 实现；引用的行号对应上述 tag，其他版本需自行核对。
