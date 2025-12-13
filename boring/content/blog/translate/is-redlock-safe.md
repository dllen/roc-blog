---
title: "Is Redlock safe?"
date: 2020-03-18T12:13:38+05:30
update_date: 2020-03-18T12:13:38+05:30
---

原文链接: http://antirez.com/news/101

Is Redlock safe? antirez 3539 days ago. 413703 views. Martin Kleppmann, a distributed systems researcher, yesterday published an analysis of Redlock (http://redis.io/topics/distlock), that you can find here: http://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html

Redlock 是否安全？作者 antirez，距今 3539 天前发布，413703 次浏览。分布式系统研究者 Martin Kleppmann 昨天发表了一篇关于 Redlock 的分析（http://redis.io/topics/distlock），你可以在这里找到他的文章：http://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html。

Redlock is a client side distributed locking algorithm I designed to be used with Redis, but the algorithm orchestrates, client side, a set of nodes that implement a data store with certain capabilities, in order to create a multi-master fault tolerant, and hopefully safe, distributed lock with auto release capabilities.
You can implement Redlock using MySQL instead of Redis, for example.

Redlock 是我设计的一个客户端分布式锁算法，最初用于 Redis。该算法在客户端侧编排一组具备特定能力的数据存储节点，以构建一个多主、容错、并且（希望）安全的、带自动释放能力的分布式锁。例如，你完全可以用 MySQL 来实现 Redlock，而不是 Redis。

The algorithm's goal was to move away people that were using a single Redis instance, or a master-slave setup with failover, in order to implement distributed locks, to something much more reliable and safe, but having a very low complexity and good performance.

这个算法的目标，是引导那些使用单个 Redis 实例或主从+故障切换来实现分布式锁的人，迁移到一种更可靠、更安全，同时复杂度低、性能好的实现方式。

Since I published Redlock people implemented it in multiple languages and used it for different purposes.

自从我发布 Redlock 后，人们在多种语言中实现了它，并用于不同的目的。

Martin's analysis of the algorithm concludes that Redlock is not safe. It is great that Martin published an analysis, I asked for an analysis in the original Redlock specification here: http://redis.io/topics/distlock. So thank you Martin. However I don’t agree with the analysis. The good thing is that distributed systems are, unlike other fields of programming, pretty mathematically exact, or they are not, so a given set of properties can be guaranteed by an algorithm or the algorithm may fail to guarantee them under certain assumptions. In this analysis I’ll analyze Martin's analysis so that other experts in the field can check the two documents (the analysis and the counter-analysis), and eventually we can understand if Redlock can be considered safe or not.

Martin 的结论是：Redlock 不安全。Martin 写这篇分析很棒——我在 Redlock 原始规范里也请求过对它进行分析：http://redis.io/topics/distlock。所以感谢 Martin。不过我不认同该分析。好在分布式系统与其它编程领域不同，它在数学上相当“严谨”：一个算法要么能保证某组性质，要么在某些假设下无法保证。我会逐点分析 Martin 的文章，以便领域内的专家能对照两篇文档（分析与反驳），最终我们可以更清楚地判断 Redlock 是否安全。

## Why Martin thinks Redlock is unsafe

为什么 Martin 认为 Redlock 不安全

The arguments in the analysis are mainly two:

该分析的主要论点有两点：

1. Distributed locks with an auto-release feature (the mutually exclusive lock property is only valid for a fixed amount of time after the lock is acquired) require a way to avoid issues when clients use a lock after the expire time, violating the mutual exclusion while accessing a shared resource. Martin says that Redlock does not have such a mechanism.

1）带自动释放的分布式锁（互斥性仅在获取后的一段固定时间内有效）需要一种机制来避免“锁过期后客户端仍使用”的问题，否则会在访问共享资源时破坏互斥。Martin 认为 Redlock 缺少这样的机制。

2. Martin says the algorithm is, regardless of problem “1”, inherently unsafe since it makes assumptions about the system model that cannot be guaranteed in practical systems.

2）不论问题 1 与否，Martin 认为该算法本质上不安全，因为它对系统模型做出了在实际系统中无法保证的假设。

I’ll address the two concerns separately for clarity, starting with the first “1”.

为了清晰起见，我将分别讨论这两点，先从第一点开始。

## Distributed locks, auto release, and tokens

分布式锁、自动释放与令牌

A distributed lock without an auto release mechanism, where the lock owner will hold it indefinitely, is basically useless. If the client holding the lock crashes and does not recover with full state in a short amount of time, a deadlock is created where the shared resource that the distributed lock tried to protect remains forever unaccessible. This creates a liveness issue that is unacceptable in most situations, so a sane distributed lock must be able to auto release itself.

一个没有自动释放机制的分布式锁（持有者可无限期持有）基本上是无用的。如果持锁客户端崩溃且不能在短时间内完全恢复，就会造成死锁——共享资源会永久不可访问。这是多数场景无法接受的“活性”问题，因此合理的分布式锁必须能自动释放。

So practical locks are provided to clients with a maximum time to live. After the expire time, the mutual exclusion guarantee, which is the main property of the lock, is gone: another client may already have the lock. What happens if two clients acquire the lock at two different times, but the first one is so slow, because of GC pauses or other scheduling issues, that will try to do work in the context of the shared resource at the same time with second client that acquired the lock?

因此，实际工程中的锁会设置最长存活时间。过期后，锁的“互斥保证”（核心属性）就不再成立：另一个客户端可能已经拿到了锁。如果两个客户端在不同时间获取锁，但第一个客户端因为 GC 暂停或调度问题而非常慢，导致它与第二个客户端同时试图操作同一共享资源，会发生什么？

Martin says that this problem is avoided by having the distributed lock server to provide, with every lock, a token, which is, in his example, just a number that is guaranteed to always increment. The rationale for Martin's usage of a token, is that this way, when two different clients access the locked resource at the same time, we can use the token in the database write transaction (that is assumed to materialize the work the client does): only the client with the greatest lock number will be able to write to the database.

Martin 的做法是：分布式锁服务为每次加锁提供一个令牌（在他的例子里，是一个保证递增的数字）。使用令牌的动机是：当两个客户端同时访问被锁资源时，在数据库写事务中携带令牌（假设写事务体现了客户端的操作），只有令牌更大的客户端能够写入数据库。

In Martin's words:

用 Martin 的话说：

“The fix for this problem is actually pretty simple: you need to include a fencing token with every write request to the storage service. In this context, a fencing token is simply a number that increases (e.g. incremented by the lock service) every time a client acquires the lock”

“解决这个问题其实很简单：你需要在每次写请求里附带一个 fencing token（栅栏令牌）。在这里，栅栏令牌只是一个递增的数字（例如由锁服务每次成功加锁时递增）。”

… snip …

……（略）……

“Note this requires the storage server to take an active role in checking tokens, and rejecting any writes on which the token has gone backwards”.

“注意这需要存储服务器主动校验令牌，并拒绝任何令牌倒退的写操作。”

I think this argument has a number of issues:

我认为这套说法存在一些问题：

1. Most of the times when you need a distributed lock system that can guarantee mutual exclusivity, when this property is violated you already lost. Distributed locks are very useful exactly when we have no other control in the shared resource. In his analysis, Martin assumes that you always have some other way to avoid race conditions when the mutual exclusivity of the lock is violated. I think this is a very strange way to reason about distributed locks with strong guarantees, it is not clear why you would use a lock with strong properties at all if you can resolve races in a different way. Yet I’ll continue with the other points below just for the sake of showing that Redlock can work well in this, very artificial, context.

1）在多数需要强互斥保证的锁系统中，一旦互斥被破坏，损失已经发生。分布式锁之所以有用，恰恰在于我们无法在共享资源上施加其它控制。Martin 的分析假设：即便互斥被破坏，你总有其它办法避免竞争。这种逻辑对于“强保证的锁”而言很奇怪——如果你能用别的方式解决竞争，那为何还要使用强保证的锁？不过，为了论证 Redlock 在这种“人为设定的场景”里也能工作，我会继续讨论下面的点。

2. If your data store can always accept the write only if your token is greater than all the past tokens, than it’s a linearizable store. If you have a linearizable store, you can just generate an incremental ID for each Redlock acquired, so this would make Redlock equivalent to another distributed lock system that provides an incremental token ID with every new lock. However in the next point I’ll show how this is not needed.

2）如果你的存储只有在令牌大于所有历史令牌时才接受写入，那它就是线性一致的。如果你已经有线性一致的存储，你完全可以为每次 Redlock 加锁生成一个递增 ID——这会让 Redlock 等价于“每次加锁都提供递增令牌”的另一种锁系统。不过在下一点我会说明，这并非必要。

3. However “2” is not a sensible choice anyway: most of the times the result of working to a shared resource is not writing to a linearizable store, so what to do? Each Redlock is associated with a large random token (which is generated in a way that collisions can be ignored. The Redlock specification assumes textually “20 bytes from /dev/urandom”). What do you do with a unique token? For example you can implement Check and Set. When starting to work with a shared resource, we set its state to “<token>”, then we operate the read-modify-write only if the token is still the same when we write.

3）而且“2”本身并不总是可行：多数情况下，对共享资源的操作并非写入线性一致的存储，那怎么办？每个 Redlock 都关联一个“大随机令牌”（生成方式使得碰撞可忽略，规范文本建议“/dev/urandom 的 20 字节”）。有了唯一令牌能做什么？例如实现 Check-and-Set：开始操作共享资源时，把其状态设为“<token>”，只有当写入时令牌仍相同，才执行读-改-写。

4. Note that in certain use cases, one could say, it’s useful anyway to have ordered tokens. While it’s hard to think at an use case, note that for the same GC pauses Martin mentions, the order in which the token was acquired, does not necessarily respects the order in which the clients will attempt to work on the shared resource, so the lock order may not be casually related to the effects of working to a shared resource.

4）在某些用例里，有人或许认为“令牌有序”是有用的。但这并不好举例。注意 Martin 提到的 GC 暂停：令牌获取的顺序，不一定等同于客户端尝试操作共享资源的顺序，因此“加锁顺序”未必与实际操作的效果相关。

5. Most of the times, locks are used to access resources that are updated in a way that is non transactional. Sometimes we use distributed locks to move physical objects, for example. Or to interact with another external API, and so forth.

5）多数时候，锁用于访问以非事务性方式更新的资源。比如用分布式锁搬运物理对象，或与外部 API 交互，等等。

I want to mention again that, what is strange about all this, is that it is assumed that you always must have a way to handle the fact that mutual exclusion is violated. Actually if you have such a system to avoid problems during race conditions, you probably don’t need a distributed lock at all, or at least you don’t need a lock with strong guarantees, but just a weak lock to avoid, most of the times, concurrent accesses for performances reasons.

我想再次强调，这里奇怪的地方在于：假设你总能在互斥被破坏时处理后果。如果你真的有这种系统去避免竞争中的问题，你可能根本不需要分布式锁，或者至少不需要“强保证”的锁，只需一个“弱锁”来在多数情况下减少并发访问以提升性能。

However even if you happen to agree with Martin about the fact the above is very useful, the bottom line is that a unique identifier for each lock can be used for the same goals, but is much more practical in terms of not requiring strong guarantees from the store.

即便你赞同 Martin 的观点，认为上述机制很有用，结论仍是：为每次加锁分配唯一标识也能达到同样目的，并且更务实——不需要存储层提供强保证。

## Let’s talk about system models

聊聊系统模型

The above criticism is basically common to everything which is a distributed lock with auto release, not providing a monotonically increasing counter with each lock. However the other critique of Martin is specific to Redlock. Here Martin really analyzes the algorithm, concluding it is broken.

上述批评基本上适用于所有“带自动释放、且不提供递增计数器”的分布式锁。不过 Martin 的另一项批评则是针对 Redlock 的：他认真分析了算法，结论是算法有问题。

Redlock assumes a semi synchronous system model where different processes can count time at more or less the same “speed”. The different processes don’t need in any way to have a bound error in the absolute time. What they need to do is just, for example, to be able to count 5 seconds with a maximum of 10% error. So one counts actual 4.5 seconds, another 5.5 seconds, and we are fine.

Redlock 假设的是“半同步”系统模型：不同进程的计时速度大致相同。它不要求各进程在绝对时间上有界误差，只需要例如计 5 秒时最大误差 10%。因此一个进程实际计 4.5 秒，另一个计 5.5 秒，也没问题。

Martin also states that Redlock requires bound messages maximum delays, which is not correct as far as I can tell (I’ll explain later what’s the problem with his reasoning).

Martin 还声称 Redlock 需要有界的消息最大延迟——据我所知这不正确（后文将解释他的推理问题）。

So let’s start with the issue of different processes being unable to count time at the same rate.

我们先讨论“不同进程无法以相同速率计时”的问题。

Martin says that the clock can randomly jump in a system because of two issues:

Martin 认为系统时钟可能因两种原因随机跳变：

1. The system administrator manually alters the clock.

1）系统管理员手动修改了时钟。

2. The ntpd daemon changes the clock a lot because it receives an update.

2）ntpd 守护进程收到更新后大幅调整时钟。

The above two problems can be avoided by “1” not doing this (otherwise even corrupting a Raft log with “echo foo > /my/raft/log.bin” is a problem), and “2” using an ntpd that does not change the time by jumping directly, but by distributing the change over the course of a larger time span.

上述两类问题可以避免：第一，别这么做（否则你甚至可以用“echo foo > /my/raft/log.bin”破坏 Raft 日志）；第二，使用不会直接跳变时间、而是把校正分布到较长时间段的 ntpd。

However I think Martin is right that Redis and Redlock implementations should switch to the monotonic time API provided by most operating systems in order to make the above issues less of a problem. This was proposed several times in the past, adds a bit of complexity inside Redis, but is a good idea: I’ll implement this in the next weeks. However while we’ll switch to monotonic time API, because there are advantages, processes running in an operating system without a software (time server) or human (system administrator) elements altering the clock, can count relative time with a bound error even with gettimeofday().

不过，我同意 Martin 的一点：Redis 与 Redlock 的实现应使用多数操作系统提供的“单调时间 API”，以降低上述问题的影响。过去也有多次提议，这会给 Redis 增加一些复杂度，但这是好主意——我会在接下来几周内实现它。同时，即便使用 gettimeofday()，在没有时间服务器或管理员改动时钟的条件下，进程也能在有界误差内计量相对时间。

Note that there are past attempts to implement distributed systems even assuming a bound absolute time error (by using GPS units). Redlock does not require anything like that, just the ability of different processes to count 10 seconds as 9.5 or 11.2 (+/- 2 seconds max in the example), for instance.

需要注意，过去也有系统尝试在假设“绝对时间误差有界”（通过 GPS 单元）的条件下实现分布式。Redlock 不需要这些，只要求不同进程能把 10 秒计为 9.5 或 11.2（例如最大 ±2 秒）。

So is Redlock safe or not? It depends on the above. Let’s assume we use the monotonically increasing time API, for the sake of simplicity to rule out implementation details (system administrators with a love for POKE and time servers). Can a process count relative time with a fixed percentage of maximum error? I think this is a sounding YES, and is simpler to reply yes to this than to: “can a process write a log without corrupting it”?

那么 Redlock 安不安全？取决于上述条件。我们假设使用单调时间 API（为简化，排除管理员手动改时与时间服务器等实现细节）。进程能否以固定比例的最大误差来计量相对时间？我认为答案是明确的“可以”。要回答这个问题，比“一个进程能否在不破坏日志的情况下写日志？”还要简单。

## Network delays & co

网络延迟与其它因素

Martin says that Redlock does not just depend on the fact that processes can count time at approximately the same time, he says:

Martin 认为 Redlock 不仅依赖“进程能以近似相同的速度计时”，他说：

“However, Redlock is not like this. Its safety depends on a lot of timing assumptions: it assumes that all Redis nodes hold keys for approximately the right length of time before expiring; that the network delay is small compared to the expiry duration; and that process pauses are much shorter than the expiry duration.”

“然而，Redlock 并非如此。它的安全性依赖于很多时间方面的假设：假设所有 Redis 节点在过期前持有键的时间长度大致正确；网络延迟相对于过期时间来说很小；进程暂停远短于过期时间。”

So let’s split the above claims into different parts:

我们把上述主张拆分为三部分：

1. Redis nodes hold keys for approximately the right length of time.

1）Redis 节点持有键的时间长度大致正确。

2. Network delays are small compared to the expiry duration.

2）网络延迟相对于过期时间来说较小。

3. Process pauses are much shorter than the expiry duration.

3）进程暂停远短于过期时间。

All the time Martin says that “the system clock jumps” I assume that we covered this by not poking with the system time in a way that is a problem for the algorithm, or for the sake of simplicity by using the monotonic time API. So:

对于 Martin 提到的“系统时钟跳变”，我假设我们已经通过不随意操作系统时间、或使用单调时间 API 来排除这种问题。那么：

About claim 1: This is not an issue, we assumed that we can count time approximately at the same speed, unless there is any actual argument against it.

关于第 1 点：这不是问题。我们假设进程能以近似相同的速度计时，除非有反例证明。

About claim 2: Things are a bit more complex. Martin says:

关于第 2 点：情况更复杂。Martin 说：

“Okay, so maybe you think that a clock jump is unrealistic, because you’re very confident in having correctly configured NTP to only ever slew the clock.” (Yep we agree here ;-) he continues and says…)

“好吧，你也许认为时钟跳变不现实，因为你很有信心正确配置了 NTP，只会以平滑方式调整时钟。”（这点我们一致 ;-) 他接着说……）

“In that case, let’s look at an example of how a process pause may cause the algorithm to fail:
Client 1 requests lock on nodes A, B, C, D, E.
While the responses to client 1 are in flight, client 1 goes into stop-the-world GC.
Locks expire on all Redis nodes.
Client 2 acquires lock on nodes A, B, C, D, E.
Client 1 finishes GC, and receives the responses from Redis nodes indicating that it successfully acquired the lock (they were held in client 1’s kernel network buffers while the process was paused).
Clients 1 and 2 now both believe they hold the lock.”

“在这种情况下，我们看一个因进程暂停而导致算法失败的例子：
客户端 1 向 A、B、C、D、E 节点请求加锁；
在响应返回途中，客户端 1 进入 Stop-The-World 的 GC；
所有 Redis 节点上的锁过期；
客户端 2 在 A、B、C、D、E 节点获取了锁；
客户端 1 GC 结束，收到来自 Redis 的响应，显示其成功拿到锁（响应在进程暂停期间被保存在客户端 1 的内核网络缓冲里）；
此时客户端 1 和客户端 2 都认为自己持有锁。”

If you read the Redlock specification, that I hadn't touched for months, you can see the steps to acquire the lock are:

如果你阅读 Redlock 规范（我几个月没改过），你会看到获取锁的步骤如下：

1. Get the current time.

1）获取当前时间。

2. … All the steps needed to acquire the lock …

2）……执行加锁所需的所有步骤……

3. Get the current time, again.

3）再次获取当前时间。

4. Check if we are already out of time, or if we acquired the lock fast enough.

4）检查是否已经超时，或者加锁是否足够快。

5. Do some work with your lock.

5）持锁进行操作。

Note steps 1 and 3. Whatever delay happens in the network or in the processes involved, after acquiring the majority we check again that we are not out of time. The delay can only happen after steps 3, resulting into the lock to be considered ok while actually expired, that is, we are back at the first problem Martin identified of distributed locks where the client fails to stop working to the shared resource before the lock validity expires. Let me tell again how this problem is common with all the distributed locks implementations, and how the token as a solution is both unrealistic and can be used with Redlock as well.

注意步骤 1 和 3。无论网络或进程发生了何种延迟，在拿到多数派后我们会再次检查是否未超时。只有在步骤 3 之后的延迟，才会导致“锁被认为有效但实际已过期”——也就是回到 Martin 指出的分布式锁常见问题：客户端没能在锁有效期结束前停止对共享资源的操作。再强调一次，这个问题在所有分布式锁实现中都很常见；而令牌方案既不现实，也同样可以在 Redlock 中使用。

Note that whatever happens between 1 and 3, you can add the network delays you want, the lock will always be considered not valid if too much time elapsed, so Redlock looks completely immune from messages that have unbound delays between processes. It was designed with this goal in mind, and I cannot see how the above race condition could happen.

需要注意的是，无论在步骤 1 到 3 之间发生了什么，你可以加入任何网络延迟，只要耗时过多，锁都会被判定为无效。因此 Redlock 看起来对“跨进程的无界消息延迟”是免疫的。它就是带着这个目标设计的，我不认为上述竞态会发生。

Yet Martin's blog post was also reviewed by multiple DS experts, so I’m not sure if I’m missing something here or simply the way Redlock works was overlooked simultaneously by many. I’ll be happy to receive some clarification about this.

不过，Martin 的博客也被多位分布式系统专家审阅过，所以我不确定是不是我漏掉了什么，或者只是 Redlock 的工作方式被大家同时忽视了。我很乐意收到关于这点的澄清。

The above also addresses “process pauses” concern number 3. Pauses during the process of acquiring the lock don’t have effects on the algorithm's correctness. They can however, affect the ability of a client to make work within the specified lock time to live, as with any other distributed lock with auto release, as already covered above.

上述讨论也回应了第 3 点“进程暂停”的担忧：在加锁过程中的暂停不会影响算法正确性。但它会影响客户端在锁的存活时间内完成工作的能力——这与任何“自动释放”的分布式锁一样，前文已说明。

## Digression about network delays

关于网络延迟的插曲

Just a quick note. In server-side implementations of a distributed lock with auto-release, the client may ask to acquire a lock, the server may allow the client to do so, but the process can stop into a GC pause or the network may be slow or whatever, so the client may receive the "OK, the lock is your" too late, when the lock is already expired. However you can do a lot to avoid your process sleeping for a long time, and you can't do much to avoid network delays, so the steps to check the time before/after the lock is acquired, to see how much time is left, should actually be common practice even when using other systems implementing locks with an expiry.

补充一点：在服务端实现的“自动释放”分布式锁中，客户端请求加锁，服务端也允许，但进程可能因 GC 或网络缓慢而暂停，导致客户端收到“OK，锁是你的”时，锁其实已过期。你能做很多事来避免进程长时间休眠，但对网络延迟却无能为力。因此，即便使用其它带过期的锁系统，也应在加锁前后检查时间，确认剩余可用时间——这应成为通用实践。

## Fsync or not?

是否需要 fsync？

At some point Martin talks about the fact that Redlock uses delayed restarts of nodes. This requires, again, the ability to be able to wait more or less a specified amount of time, as covered above. Useless to repeat the same things again.

Martin 在文中提到：Redlock 使用“延迟重启节点”。这再一次要求“能以大致正确的长度等待指定时间”，与上文相同。不再赘述。

However what is important about this is that, this step is optional. You could configure each Redis node to fsync at every operation, so that when the client receives the reply, it knows the lock was already persisted on disk. This is how most other systems providing strong guarantees work. The very interesting thing about Redlock is that you can opt-out any disk involvement at all by implementing delayed restarts. This means it’s possible to process hundreds of thousands locks per second with a few Redis instances, which is something impossible to obtain with other systems.

但关键在于：该步骤是可选的。你可以配置每个 Redis 节点在每次操作时都 fsync，这样客户端收到响应时就知道锁已经持久化到磁盘了——多数提供强保证的系统都是这么做的。Redlock 的有趣之处在于：你可以通过“延迟重启”来完全避免磁盘参与。这意味着，用少量 Redis 实例每秒可处理数十万次加锁——这在其它系统中几乎不可实现。

## GPS units versus the local computer clock

GPS 单元 vs 本地计算机时钟

Returning to the system model, one thing that makes Redlock system model practical is that you can assume a process to never be partitioned with the system clock. Note that this is different compared to other semi synchronous models where GPS units are used, because there are two non obvious partitions that may happen in this case:

回到系统模型，使 Redlock 模型更实用的一点是：你可以假设进程不会与系统时钟发生“分区”。这与采用 GPS 单元的其它半同步模型不同，因为在那种情况下有两个不明显的“分区”可能发生：

1. The GPS is partitioned away from the GPS network, so it can’t acquire a fix.

1）GPS 与 GPS 网络分区，无法获得定位。

2. The process and the GPS are not able to exchange messages or there are delays in the messages exchanged.

2）进程与 GPS 之间无法交换消息，或消息存在延迟。

The above problems may result into a liveness or safety violation depending on how the system is orchestrated (safety issues only happen if there is a design error, for example if the GPS updates the system time asynchronously so that, when the GPS does not work, the absolute time error may go over the maximum bound).

上述问题可能导致活性或安全性违规，取决于系统编排方式（安全性问题仅在设计错误时发生，例如 GPS 异步更新系统时间，导致 GPS 不工作时绝对时间误差超出最大边界）。

The Redlock system model does not have these complexities nor requires additional hardware, just the computer clock, and even a very cheap clock with all the obvious biases due to the crystal temperature and other things influencing the precision.

Redlock 的系统模型没有这些复杂性，也不需要额外硬件，只依赖计算机时钟——即便是非常廉价、受晶体温度等因素影响精度的时钟也可以。

## Conclusions

结论

I think Martin has a point about the monotonic API, Redis and Redlock implementations should use it to avoid issues due to the system clock being altered. However I can’t identify other points of the analysis affecting Redlock safety, as explained above, nor do I find his final conclusions that people should not use Redlock when the mutual exclusion guarantee is needed, justified.

我认同 Martin 关于“单调时间 API”的观点：Redis 与 Redlock 的实现应该使用它，以避免系统时钟被修改带来的问题。但除了这点之外，我没有发现文章中其它能影响 Redlock 安全性的论点；也不认同他最终的结论——当需要互斥保证时，人们不应使用 Redlock。

It would be great to both receive more feedbacks from experts and to test the algorithm with Jepsen, or similar tools, to accumulate more data.

如果能收到更多专家反馈，并用 Jepsen 或类似工具测试该算法以积累更多数据，那就更好了。

A big thank you to the friends of mine that helped me to review this post.

非常感谢帮助我审阅这篇文章的朋友们。


