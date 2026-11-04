---
title: "Kafka 源码的十年：不变的核心与读源码的方法"
date: 2026-11-04
update_date: 2026-11-04
description: "对比 2017 年的 Kafka 0.10 与今天的 4.x：消息格式、控制器、再均衡协议都换过两轮，但三条核心不变量——offset 是序号、高水位是 ISR 内最小 LEO、顺序靠队列而不是 TCP——一个字都没变。顺带给出 Kafka 与 PacificA 在副本落后时的路线差异，以及读源码的三个抓手。"
tldr: "Kafka 这十年换的是周边，不换的是核心：一条日志、两个水位、一个队列。抓住这三样，读哪个版本都不吃亏。"
keywords: ["Kafka", "源码阅读", "跨版本对照", "Kafka 0.10", "高水位", "副本复制取舍"]
taxonomies:
  tags: ["Kafka", "源码分析", "分布式系统", "消息队列"]
---

这个仓库里已经有一套十六篇的 [Kafka 源码阅读系列](/blog/kafka/)，从 Producer 初始化一路读到事务，覆盖得很细。所以这篇不重复那些模块级细节，只补三件系列里没有的东西：

1. **跨版本对照**——用 2017 年的 Kafka 0.10 做锚点，看清十年里到底换掉了什么、什么一直没动；
2. **一个被长期忽略的取舍**——副本落后时，Kafka 选择踢出副本而不是阻塞写入，这条路和 PacificA 正好相反；
3. **一套可迁移的读源码方法**——从 backtrace 反推职责、先找「水位」字段、把绕的时序当第一公民。

如果你是第一次读 Kafka 源码，先按系列顺序读；如果你读的是新版源码但总被「这个设计为什么这样」卡住，这篇是给这种卡住准备的。

## 一、为什么 0.10 是最好的锚点

Kafka 0.10 是个化石标本，但它恰好是**剥掉历史包袱之后的最小可用形态**。

它的目录里没有 controller 服务、没有 quorum 共识组、没有 tiered storage、没有事务状态机；复制只有 leader/follower 两档；消息格式还是「每条消息 12 字节开销」的老式 message set。类名也直白——`ReplicaManager`、`Partition`、`LogManager`、`KafkaRequestHandler`，看一眼就知道职责边界在哪。

拿它当锚点的好处是：**你能看清哪些是本质，哪些是后来加的负担。**

十年里 Kafka 换过两次消息格式、换过一次元数据存储、换过一次消费者再均衡协议、换过一次 RPC 组织方式。而底层那条「日志 + 两个水位 + 一个队列」一直没变。后面第三节会把这件事说透。

## 二、三条十年未变的不变量

### 不变量一：offset 是序号，不是位置

Kafka 的 offset 是消息在日志中的**序号**，不是它在文件里的字节位置。这是 Kafka 论文里的原话：

> a message stored in Kafka doesn't have an explicit message id. Instead, each message is addressed by its logical offset in the log. This avoids the overhead of maintaining auxiliary, seek-intensive random-access index structures that map the message ids to the actual message locations.

论文接着说「message id 和 offset 后面可以互换」，这句是简化。源码里 `LogOffsetMetadata` 同时带三个量：

```scala
case class LogOffsetMetadata(messageOffset: Long,
                             segmentBaseOffset: Long = LogOffsetMetadata.UnknownSegBaseOffset,
                             relativePositionInSegment: Int = LogOffsetMetadata.UnknownFilePosition)
```

`messageOffset` 是序号，`segmentBaseOffset` + `relativePositionInSegment` 才是物理位置。三个量一起带着走，是因为「序号 → 位置」的换算依赖当前日志的切分状态，而切分会随着 segment 滚动而变。

**为什么十年没变**：这条不变量是存储效率的来源。消息本身不带 ID，就不需要维护「ID → 位置」的随机访问索引结构；索引文件因此可以做得极稀疏（每 4KB 一项），而且能 mmap 进内存。换成「带 ID 的消息」意味着每个分区都要多维护一棵随机访问索引——这是 Kafka 明确不付的成本。

存储层的完整拆解在 [Kafka 源码阅读：07. 日志存储](/blog/kafka/07-log-storage/)，这里只说结论。

### 不变量二：高水位是 ISR 内所有副本 LEO 的最小值

Kafka 有两个水位，十年后名字都没变：

- **LEO（logEndOffset）= 准备点**：这条消息已经落在本地盘上了；
- **HW（highWatermark）= 提交点**：这条消息已经可以对外读取了。

推进 HW 的代码只有一行：

```scala
val allLogEndOffsets = inSyncReplicas.map(_.logEndOffset)
val newHighWatermark = allLogEndOffsets.min(new LogOffsetMetadata.OffsetOrdering)
```

**HW = ISR 内所有副本 LEO 的最小值。** ISR 扩张的条件同样只有一行：

```scala
if (!inSyncReplicas.contains(replica) &&
    assignedReplicas.map(_.brokerId).contains(replicaId) &&
    replica.logEndOffset.offsetDiff(leaderHW) >= 0) {
  val newInSyncReplicas = inSyncReplicas + replica
  updateIsr(newInSyncReplicas)
}
```

**一个副本必须追上了当前 HW，才配进 ISR。** ISR 不是「分到数据的副本集合」，是「有资格参与提交点计算的集合」。

这两个数字必须分开，否则整个模型推不下去。follower 侧的处理最能说明问题：

```scala
replica.log.get.append(messageSet, assignOffsets = false)
val followerHighWatermark = replica.logEndOffset.messageOffset.min(partitionData.highWatermark)
replica.highWatermark = new LogOffsetMetadata(followerHighWatermark)
```

follower 的 HW = min(自己的 LEO, leader 宣告的 HW)。**它不盲目信任 leader 报来的水位**，取两者较小值——自己没落盘的消息，哪怕 leader 说「已经提交了」，也不算数。

复制机制的完整展开在 [Kafka 源码阅读：14. 副本同步机制](/blog/kafka/14-replication/)。

### 不变量三：顺序保证来自队列，不来自 TCP

这条最容易被忽略，也是 Kafka 源码里最绕的一段。

Kafka 的网络层是经典的 Reactor 三段式：Acceptor 收连接 → Processor 读请求 → RequestChannel 队列 → IO 线程处理 → 响应队列 → Processor 写回。细节在 [Kafka 源码阅读：06. 网络层设计](/blog/kafka/06-network-layer/)。

绕的地方在于：Processor 从某个连接读到请求后，会**把这个 channel 静音（mute）**，处理完再解除静音（unmute）。完整时序九步：

```
1. KafkaChannel 的 OP_READ 就绪
2. 网络线程读出请求，推进 RequestChannel
3. 【mute】静音该 channel
4. IO 线程从 RequestChannel 取出请求并处理
5. IO 线程把响应推进 RequestChannel
6. 网络线程从 RequestChannel 取出响应
7. 网络线程把响应写回 KafkaChannel
8. 完成发送
9. 【unmute】解除静音
```

**这九步的全部目的只有一个：保证同一个连接上的请求按序处理、响应按序返回。**

为什么非这么做不可？TCP 只保证字节流有序，**不保证请求与响应的配对关系**——即使两个响应的字节顺序完全正确，也可能对应到错误的请求。如果网络线程边读边处理，同一连接上的两个请求可能被两个不同的 IO 线程并发处理，配对就乱了。

mute/unmute 的本质是：**把「配对」这件事从字节流层挪到队列层**。一个连接在任一时刻最多只有一个在途请求，顺序问题就不存在了。

代价也在这里：**队头阻塞**。一个慢请求会卡住同连接上的后续请求。而每个 Processor 独占的响应队列是**无界**的——下游处理不过来时，队列会一直涨。

这是一个「用实现复杂度换正确性」的交易：Kafka 选了正确性，代价写在代码里。

## 三、换掉的周边

十年里换掉的东西，官方文档讲得比任何二手解读都清楚。以下版本事实核自 [Apache Kafka 官方 upgrade guide](https://kafka.apache.org/40/documentation/) 与 [KIP-848 的 wiki 页](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848%3A+The+Next+Generation+of+the+Consumer+Rebalance+Protocol)，抓取于 2026-11-04。

| 维度 | 2017 年（0.10） | 今天（4.x） | 变了吗 |
|---|---|---|---|
| 消息格式 | Message + MessageSet，每条 12 字节开销 | 0.11.0.0 引入新的消息格式版本与 wire protocol 变更 | 变了 |
| 元数据管理 | ZooKeeper | **4.0 只支持 KRaft 模式，ZooKeeper 模式已移除**；3.3 是 KRaft 首个「生产就绪」版本 | 变了 |
| 消费者再均衡 | 经典协议 | **KIP-848 的服务端 assignor 协议在 4.0 已 GA**，升级完成后服务端自动启用 | 变了 |
| RPC 组织 | 单一 `KafkaApis` | KIP-714 把 broker 与 controller 的 RPC/协议拆开 | 变了 |
| 幂等生产者 | 没有 | `enable.idempotence` 在 4.0 起**不再因 `max.in.flight > 5` 自动回退** | 变了 |
| 复制模型 | HW = ISR 最小 LEO，follower 拉 | 一样 | **没变** |
| offset 语义 | 日志序号 | 一样 | **没变** |
| 索引 | 每 4KB 一项的稀疏索引 + mmap | 一样 | **没变** |
| 顺序保证 | mute/unmute + 队列配对 | 队列配对的思想未变 | **没变** |

**读这张表的正确方式**：Kafka 换掉的都是**周边**——消息怎么编码、元数据放哪、消费者怎么分组、RPC 怎么分层。没换的是**核心**——一条只追加的日志、两个水位、一个把顺序问题挪到队列层的技巧。

所以拿 0.10 的源码理解 Kafka 是划算的：你省掉了所有「为什么现在长这样」的历史包袱，直接看到「为什么它必须是这样」。

## 四、一个没被换掉的取舍：落后副本踢出还是阻塞写入

副本跟不上时怎么办，两条路线都能保证一致性，选哪条是**吞吐**问题。

**PacificA** 的选择是硬阻塞：副本位置不一致就没法继续推进提交点，必须等对齐（[PacificA 的论文与实现](https://github.com/pacifica/pacifica)）。

**Kafka** 的选择相反：把落后副本**踢出 ISR**，让剩下的一致副本继续推进。代价是那个副本上的消息——**已经落盘了，但暂时对消费者不可见**，直到它追上来重新进 ISR。

这个取舍藏在两个细节里，都不在「HW = min(LEO)」这句话表面：

**其一，`min.insync.replicas` 不满足时，消息其实已经写进去了。** 生产路径上这个错误码叫 `NOT_ENOUGH_REPLICAS_AFTER_APPEND`——「追加之后副本不足」：

```scala
if (leaderReplica.highWatermark.messageOffset >= requiredOffset) {
  if (minIsr <= curInSyncReplicas.size) (true, Errors.NONE.code)
  else (true, Errors.NOT_ENOUGH_REPLICAS_AFTER_APPEND.code)
} else (false, Errors.NONE.code)
```

消息写进本地盘了，但因为同步副本不够，**不给确认**。`acks=all` 的语义在这里落地：它不是「等所有副本」，而是「等 ISR 里的副本，且 ISR 本身要满足最小规模」。

**其二，判定用的是 LEO，不是 HW。** 副本只要把数据写到自己盘上就算数，不必等它成为提交点的一部分。

把这两条和上一节的 HW 规则放在一起，Kafka 的复制模型就完整了：**ISR 是流动的资格名单，HW 是这份名单上的共识，落后者掉队但不掉数据。**

为什么 Kafka 选吞吐优先？因为对绝大多数日志类负载，「写入被最慢副本卡住」的代价远大于「偶尔有消息晚一点可见」。而 PacificA 那种强对齐更适合需要跨副本一致读写的存储场景——这是两种产品定位，不是对错之分。

延迟账也要算清楚：follower 拉数据意味着**提交点推进要等下一次 fetch 汇报**，一轮往返加上汇报滞后，大约 1.5 个 RTT。Kafka 用这点延迟换来了「写入不被慢副本阻塞」。

延迟应答的实现细节在 [Kafka 源码阅读：08. 延时操作 Purgatory](/blog/kafka/08-purgatory/)，消费侧的取舍在 [Kafka 源码阅读：14. 副本同步机制](/blog/kafka/14-replication/)。

## 五、读源码的三个抓手

这篇讲的东西大部分是结论，真正可复用的是读法。

**第一，从 backtrace 反推调用链。** 读源码时最值钱的不是架构图，而是**一段调用栈**：

```
KafkaRequestHandler.run
  → KafkaApis.handleProduceRequest
  → ReplicaManager.appendMessages
  → DelayedOperationPurgatory.tryCompleteElseWatch
  → DelayedProduce.tryComplete
  → Partition.checkEnoughReplicasReachOffset
```

拿到一条栈，**每个类名都在告诉你一个职责边界**。`DelayedOperationPurgatory` 这个名字直接说明「应答被延迟了」；`checkEnoughReplicasReachOffset` 说明判定发生在**分区层**而不是副本层——这一个信息就决定了你该去哪个文件读。

比从头翻文件快十倍。

**第二，先找「水位」类字段。** 分布式系统的状态几乎都是靠几个标量推进的：HW、LEO、epoch、offset、sequence number。

找到它们，状态机就浮出来了。Kafka 的 `highWatermarkMetadata` / `logEndOffsetMetadata` 一对，Raft 的 `term` / `lastLogIndex`，ZooKeeper 的 `zxid` / `cversion`——**同一个模式**。

看到一个值决定「别人能不能读到」，就顺着它去找**谁在推进它、谁在等它**。Kafka 里 HW 的推进者只有 `maybeIncrementLeaderHW` 一个方法，这种「唯一入口」通常意味着这块逻辑很干净。

**第三，把「看起来很绕的时序」当成第一公民。** mute/unmute 九步在源码里像一段多余的仪式——但它恰恰是整条网络链路里最重要的发现。

**当一段代码「多此一举」到让人想删掉时，多半是它在承担一个没说出口的约束。** 顺着它去找「如果去掉会怎样」，往往比读注释更快找到设计意图。

补一句心态上的：好的源码笔记都是「代码 + 紧随其后的一句话解释」，而不是「先讲原理再贴代码」。前者让读者**先看到形状，再给形状命名**，后者让读者先接受一个结论再去找证据。前者更容易被验证，也更容易被推翻。

## 相关阅读

本系列：

- [Kafka 源码阅读：00. 阅读大纲与学习路线](/blog/kafka/00-kafka-source-code-outline/) — 十六篇的总目录
- [Kafka 源码阅读：07. 日志存储](/blog/kafka/07-log-storage/) — segment 切分、稀疏索引、零拷贝
- [Kafka 源码阅读：06. 网络层设计](/blog/kafka/06-network-layer/) — SocketServer / Acceptor / Processor / RequestChannel
- [Kafka 源码阅读：08. 延时操作 Purgatory](/blog/kafka/08-purgatory/) — acks=all 的延迟应答怎么落地
- [Kafka 源码阅读：14. 副本同步机制](/blog/kafka/14-replication/) — ReplicaFetcherThread、HW 更新、截断
- [Kafka 源码阅读：10. KRaft 共识协议](/blog/kafka/10-kraft-consensus/) — 4.0 之后元数据怎么管
- [Kafka 源码阅读：12. 消费者 Rebalance 机制](/blog/kafka/12-consumer-rebalance/) — KIP-848 之前的老协议

外部：

- [Kafka 论文（NetDB 2011）](https://kafka.apache.org/40/design/design/) — 原文里「message id 与 offset 互换」那段是简化，源码以 `LogOffsetMetadata` 为准
- [KIP-848：The Next Generation of the Consumer Rebalance Protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848%3A+The+Next+Generation+of+the+Consumer+Rebalance+Protocol)
- [PacificA 实现](https://github.com/pacifica/pacifica) — 另一条复制路线的完整代码
- [Designing Data-Intensive Applications](https://dataintensive.net/) — 第 5 章（事务）、第 7 章（共识）
