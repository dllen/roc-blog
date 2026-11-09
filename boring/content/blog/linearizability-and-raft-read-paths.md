---
title: "线性一致性：共识给不了，得自己配"
date: 2026-11-08
update_date: 2026-11-08
description: "共识只保证日志顺序一致，不保证读到最新值。要拿到线性一致，得在共识之上再配一套读写协议：ReadIndex 用一次心跳确认领导权，Lease Read 用租期换往返，follower read 换扩展性但要求 leader 退掉 wait-free。"
tldr: "Raft 的写天然线性一致，读不是。ReadIndex 用一次心跳往返换正确性，Lease Read 省掉这轮往返但押注时钟，follower read 让读性能能横向扩——代价是 leader 不再能直接读状态机。"
keywords: ["线性一致性", "顺序一致性", "ReadIndex", "Lease Read", "follower read", "ZooKeeper 一致性"]
taxonomies:
  tags: ["分布式系统", "一致性", "Raft", "共识算法"]
---

上一篇文章讨论[跨机器协作](/blog/cross-machine-coordination-layer/)时留了一个坑：Raft 保证了日志顺序一致，但客户端「刚写完立刻读」可能读到旧值。很多资料一句话带过，说「线性一致性读需要额外的读写协议」——这句话没错，但没告诉你那个协议长什么样、要付什么代价、哪些组合会互相打架。线性一致性是分布式系统里最常被引用、也最常被误解的一个词，它和顺序一致性的差别只有一条真实时间约束，但落到 Raft 上，就变成了 ReadIndex、Lease Read、follower read 三种读路径之间的取舍。这篇文章把那套协议拆开。

## 一、一致性模型：三个层次要分清

分布式系统里的一致性不是单选题，它是分层的。先把最常被混用的两个概念分开。

**顺序一致性（sequential consistency）**：所有读写操作可以被重排成一个全局线性序列，满足两个条件——

- 条件 I：重排后每个读操作返回的值，等于它前面对同一对象的最近一次写所写入的值；
- 条件 II：每个进程内部各操作的先后顺序，在重排后的序列中保持不变。

**线性一致性（linearizability）**：在顺序一致性的两个条件之上，再加一条——

- 条件 III：不同进程的操作，如果在**真实时间上不重叠**，它们的先后顺序必须在重排序列中保持。

条件 III 就是全部差别。顺序一致性允许「读到一个旧值」——只要没有别的写插在中间；线性一致性隐含了**时效性保证（recency guarantee）**：你永远能读到最新值。

一句话对照：

| | 顺序一致 | 线性一致 |
|---|---|---|
| 进程内顺序 | 保持 | 保持 |
| 真实时间不重叠的操作 | **不要求** | **必须保持** |
| 能读到旧值吗 | 可能 | 不能 |

弱一致性则是另一条轴：不承诺立即读到最新写，只承诺在某个时间级别之后会收敛（最终一致性）。

## 二、一致性和共识不是一回事

这是最容易混淆的一处。

**一致性**描述的是结果状态——多个副本对外呈现的数据是什么样子。**共识**描述的是过程——多个节点之间怎样对某个状态达成一致。

所以：**达成共识并不意味着保障了一致性。** 共识是一种手段，它能实现某种程度的一致性，仅此而已。

这个区分在实践中很重要，因为共识算法（Raft、Paxos、Zab）解决的是「谁决定顺序」的问题，而不是「读到的值是不是最新的」的问题。

### ZooKeeper 的真实保证

ZooKeeper 官方文档在这一点上写得比多数二手资料准确。ZooKeeper 的**写操作是线性一致的**，但**读操作不是**：

> Read operations in ZooKeeper are *not linearizable* since they can return potentially stale data. ZooKeeper does this because it prioritizes performance over consistency for the read use case. However, reads in ZooKeeper are *sequentially consistent*... The stronger guarantee of linearizability is provided if an actual quorum operation (e.g., a `write`) is performed before a `read`.

整体保证被形式化为 **OSC(U)**（有序顺序一致性），位置介于顺序一致性和线性一致性之间。

「写线性一致、读顺序一致」这个组合是 ZooKeeper 的有意取舍：读路径优先保证性能。如果你的业务要求读也线性一致，就得自己在客户端补协议——比如写后立刻读，或者用 `sync` 之后读。

## 三、Raft 的读为什么默认不安全

Raft 的写路径没有这个问题。写必须经过 leader，leader 复制给多数派、多数派持久化后才提交并返回给客户端。提交之后 leader 才应答，所以客户端拿到成功回执时，这个写已经在多数派上了。

但读默认从 leader 的状态机直接返回，问题在于：**leader 这个身份本身会失效。**

设想一个网络分区：leader S1 被隔离到少数派，多数派选出了新 leader S2，S2 接受了新写入 W。此时 S1 还在自己的选举超时窗口内，它不知道自己也已经不是 leader 了——它无法主动退位，因为收不到多数派的心跳回应。如果客户端这时候向 S1 发起读请求，S1 会从自己的状态机返回旧值。

客户端看到的是「我刚写完，读出来却没有」。这不是 Raft 的 bug，是「已提交」的定义问题。

还有一个更隐蔽的坑：**新 leader 的状态机可能落后于它的日志。** 当选 leader 只保证它有全部已提交的日志条目（Leader Completeness Property），不保证它已经把这些条目 apply 到状态机。所以在它 apply 完之前直接读状态机，同样可能读到旧值。

## 四、ReadIndex：用一次心跳换正确性

ReadIndex 是 Raft 论文（[In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf) 第 8 节，以及 [Ongardie 扩展论文](https://github.com/ongardie/dissertation) 第 6.4 节）给出的标准做法。

**leader 侧的流程：**

1. 记录当前的 commit index，称为 ReadIndex；
2. 向 follower 发起一次心跳，如果大多数节点回复了，就能确定自己仍是 leader；
3. 等待状态机至少 apply 到 ReadIndex 记录的日志位置；
4. 执行读请求，返回结果。

**follower 侧的流程：**

1. 向 leader 请求其 commitIndex 作为本次查询的 ReadIndex；
2. leader 向 follower 发起一次心跳，若大多数节点回复，就能确定 leader 仍是 leader；
3. leader 把本地 commitIndex 返回给 follower；
4. follower 等待自己的状态机至少 apply 到 ReadIndex；
5. 执行读请求，返回结果。

第 2 步是整套机制的关键。设想：leader 在读之前和集群交换了心跳，但在响应客户端**之前**被分区，多数派选出了新 leader 并写入了新数据。这时老 leader 从自己的状态机读到的是旧值——**线性一致性被破坏了**。心跳的作用就是在读之前把「我还是 leader 吗」这个问题问一遍。

注意第 3 步同样不能省：leader 必须确认自己已经 apply 到 commitIndex，否则它可能返回自己还没 apply 的旧状态。

## 五、Lease Read：省掉往返，押注时钟

Lease Read 和 ReadIndex 类似，但更进一步省去了网络交互。

基本思路：leader 取一个比选举超时更小的租期，在租期内保证自己是唯一 leader。租期内不会有新 leader 产生，所以直接读状态机一定不会读到旧数据。

因此 Lease Read 可以跳过 ReadIndex 流程的第 2 步——不需要那次心跳往返。

代价写在两处：

**正确性和时间挂钩。** 租期长度依赖时钟假设。论文原文的措辞是它「relies on timing for safety (it assumes bounded clock skew)」。时钟漂移严重、或某个副本的单调时钟跑得比别的快，这套机制就失效了。GC 停顿、fsync 卡顿、虚拟机 steal 时间都会侵蚀这个假设。

**新 leader 必须先 apply 当前任期第一条日志。** 这是 PingCAP 的 CTO 在讨论里补充的一个前提：LeaseRead 生效前，leader 的状态机必须已经 apply 了当前 term 的第一个 Log。新当选的 leader 虽然有全部 committed 日志，但状态机可能落后于旧 leader——apply 掉本 term 第一条日志，才能保证新 leader 的状态机一定新于旧 leader，之后不会出现 stale read。

**还有一个容易踩的边界**：ReadIndex 的第 2 步（心跳确认领导权）可以省，但第 1 步和第 3 步不能省，除非你的读写都走 leader——那样系统表现得像只有一个副本，可以退化成 wait-free（详见下一节）。

## 六、follower read 与 wait-free 的冲突

开启 follower read 之后，读请求可以由任意节点服务，性能能随节点数横向扩展。但这里有一个反直觉的结论：**一旦开了 follower read，leader 就不能再用 wait-free 的方式直接读状态机了。**

先说 wait-free 是什么意思：leader 不取 commit index、不等状态机 apply 到位，收到读请求立刻返回本地状态机。这只有在读写都走 leader 时才安全——那时整个系统表现得像单副本，leader 的状态机就是唯一真相。

follower read 打开后就不然了。设想 leader 的磁盘是 HDD、follower 是 SSD：日志本来都是 `[1,2]`，某次写 W3 被 leader 广播、提交，此时 leader 日志 `[1,2,3]`、commitIndex 3、但 applyIndex 还是 2（HDD 慢），而 follower 的 applyIndex 已经到 3。

1. 客户端读，路由到 follower。follower 走 ReadIndex 拿到 commitIndex 3，确认自己的 applyIndex ≥ 3，从状态机读出**包含 W3** 的值，返回。
2. 客户端再读，这次路由到 leader。如果 leader 走 wait-free，只能查 applyIndex 为 2 的状态机，返回**不包含 W3** 的旧值。

这两次读和那次写是并发关系，单看每一次似乎都不违反线性一致性。但线性一致性还要求：一旦某个读感知到了某个写，与这个读有全局偏序关系的后续读都应当感知到它。第一次读已经看到了 W3，第二次读就必须看到。

**结论是：**不做 follower read 优化时，读性能无法随节点数线性提升，但 leader 可以 wait-free 直接读；做了 follower read 优化，读性能能线性提升，但 leader 必须严格走 ReadIndex 或 Lease Read，不能再直接读状态机。

顺带一提，这个结论也解释了为什么很多系统默认不做 follower read——它把读延迟从「本机读」变成了「至少一次网络往返」，换来的横向扩展只有在读负载确实是瓶颈时才划算。

## 七、什么时候你根本不需要线性一致

线性一致不是免费的，而且**不是所有业务都需要它**。

一致性谱系从强到弱是：线性一致（读必见最新写）→ 顺序一致（顺序相同但不保证最新）→ 因果一致 → 最终一致。越强越贵。

实践中可以这样判断：

| 场景 | 需要什么 |
|---|---|
| 支付、订单、库存扣减 | 线性一致（或用数据库事务保证） |
| 配置中心读 | 顺序一致通常够——配置本来就允许短暂陈旧 |
| 排行榜、推荐流 | 最终一致 |
| 单用户自己的数据 | 大概率顺序一致就够 |

Raft 论文里还有一条更省的办法：**读也走日志**。读请求也写一条日志并等多数派确认，最简单也最安全，代价是吞吐——每次读都要走一遍完整的共识流程。几乎没人这么用，但知道它在选项里有助于理解其他方案的取舍空间。

## FAQ

**Q：为什么 ZooKeeper 的读不是线性一致的？**
A：这是有意的取舍，不是实现缺陷。官方文档写明读操作可能返回陈旧数据，原因是 ZooKeeper 在读场景下优先保证性能。写操作是线性一致的；如果先执行过一次 quorum 操作（比如写），之后的读会获得更强的保证。

**Q：etcd / TiKV 的读是线性一致的吗？**
A：是，但需要显式选择。etcd 的默认线性一致读走 ReadIndex 协议（[官方设计文档](https://etcd.io/docs/v3.5/learning/design/)有说明）；TiKV 在此之上实现了 Lease Read，用租期省掉一次心跳往返，代价是引入时钟假设。

**Q：ReadIndex 需要写日志吗？**
A：不需要，这正是它相对「读也走日志」的优势。它只在内存里记一个 commit index，不产生新的日志条目，不影响吞吐。

**Q：follower read 一定比 leader read 快吗？**
A：不一定。follower read 多了一次网络往返（向 leader 要 ReadIndex），它的价值在于**把读负载分摊到多个节点**，从而提升集群总吞吐。单次读延迟通常是更高的。

## 相关阅读

- 上一层的框架：[系统设计的三层](/blog/system-design-three-layer-reliability/) — 一致性在这套框架里的位置
- 同一层的深挖：[跨机器协作：网络会骗你](/blog/cross-machine-coordination-layer/) — 共识为什么推不出线性一致读
- 锁的用法：[分布式锁实践与对比](/blog/distributed-locks/) — Redis、ZooKeeper、etcd、数据库四种方案与 fencing token
- Raft 实现阅读：[Raft 与线性一致性](/blog/paper-reading/raft-iml-js/) — 从 JavaScript 实现反推 Raft 的机制
- 共识协议细节：[Kafka KRaft 共识](/blog/kafka/10-kraft-consensus/)
- 论文：[In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf)（§8 Linearizability）、[Ongardie 扩展论文](https://github.com/ongardie/dissertation) §6.4
- ZooKeeper 官方文档：[ZooKeeper Internals · Consistency Guarantees](https://zookeeper.apache.org/doc/r3.9.4/zookeeperInternals.html)
