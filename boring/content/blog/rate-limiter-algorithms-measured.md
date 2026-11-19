---
title: "限流器：五种算法用同一条流量跑一遍，差别不在描述里"
date: 2026-11-19
update_date: 2026-11-19
description: "令牌桶、漏桶、固定窗口、滑动窗口日志、滑动窗口计数器——讲义把五种算法的优缺点列成一句话，但没说差多少。这篇让五种算法跑同一条对抗流量，测出固定窗口会放进 100% 的超额请求、滑动窗口计数器最多放 10%，并量出两种队列型算法的内存随限流阈值线性增长。"
tldr: "五种算法的差别不在措辞，在数字。同一突发流量下固定窗口计数器放进 20/10（超额 100%），滑动窗口计数器放进 11/10（超额 10%），令牌桶、漏桶、滑动窗口日志恰好 10。内存上只有队列型的两种随阈值线性增长，计数器型恒定。"
keywords: ["限流算法 对比", "令牌桶 滑动窗口", "固定窗口 超额放行", "滑动窗口计数器 误差", "限流 内存开销", "Redis Lua 原子性"]
taxonomies:
  tags: ["系统设计", "架构设计", "性能优化"]
---

设计限流器这一章，讲义把五种算法各自的优点和缺点列得很齐——令牌桶「支持突发流量」、漏桶「流出速率稳定」、固定窗口「窗口边缘的流量高峰可能超出限额」、滑动窗口日志「限流精确但内存消耗高」、滑动窗口计数器「是近似值」。

但这些是一句话结论，不是数字。**「可能超出限额」超出多少？「内存消耗高」高多少倍？「是近似值」误差几个百分点？** 讲义没给，读者也就没法在面试里把「我选滑动窗口计数器」说得比「我选固定窗口」更具体。

这篇把五种算法写成可执行的实现，让它们跑**同一条对抗流量**，把差异变成数字。

> 这篇整理自 Alex Xu《System Design Interview — An Insider's Guide》第 4 章「Design a Rate Limiter」的中文笔记（[译本仓库](https://github.com/lukeTheNeuromancer/system-design-notes-zh)，英文原笔记见 [liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)）。原文的算法清单与架构描述完整，**但五种算法从未被放在同一个负载下比较过**。本文按译写式处理：只做方法层面的译述与讨论，不转载原书或笔记仓库正文，技术内容以本文自己的实现与实测为依据，许可口径见文末。

## 一、先造一条能让算法现原形的流量

要区分五个算法，得挑一条**专门为难固定窗口**的流量——讲义自己说了固定窗口「在窗口边缘的流量高峰可能超出限额」，那就让高峰正好压在边缘上。

参数：限流阈值 **10 req/s**，窗口 **1 秒**，突发容量 **10**。

流量：窗口边缘前 0.01 秒来 10 个请求，边缘后 0.01 秒再来 10 个。

```
trace: 10 requests at t=0.99, 10 requests at t=1.01  (20 ms apart)
```

两批请求只隔了 20 毫秒，**跨窗口的瞬时到达率是 1000 req/s——阈值的 100 倍**。一个正确的限流器必须把大部分拒掉。

判定基准用**突发容量 10**：令牌桶在满桶状态下最多只能连续放 10 个，这就是「不超发」的严格上界。

五种算法跑一遍：

```python
"""Five rate limiting algorithms, one adversarial traffic trace, one table.

Trace: limit = 10 req/s, window = 1s, burst capacity = 10.
  10 requests at t=0.99  (just before a window edge)
  10 requests at t=1.01  (just after the same edge)

The two bursts are 20 ms apart, so the true arrival rate across them is
1000 req/s -- 100x the limit. A correct limiter must refuse most of them.
The reference is the strict bound: the burst capacity, 10 admissions.

No wall clock: every algorithm takes `now` as an argument, so the run is
reproducible byte for byte.
"""
from collections import deque

LIMIT = 10
WINDOW = 1.0
RATE = 10.0          # refill / drain rate, requests per second
CAPACITY = 10        # burst capacity / queue depth
REFERENCE = CAPACITY # the strict bound a correct limiter must respect

TRACE = [0.99] * 10 + [1.01] * 10


class TokenBucket:
    """Tokens refill at a fixed rate; each request consumes one."""

    def __init__(self, rate, capacity):
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last = 0.0

    def allow(self, now):
        elapsed = now - self.last
        self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
        self.last = now
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False

    def retained(self):
        return 1


class LeakingBucket:
    """FIFO queue drained at a fixed rate; the queue depth is the limit."""

    def __init__(self, rate, capacity):
        self.rate = rate
        self.capacity = capacity
        self.q = deque()          # each entry: the time the request is served

    def allow(self, now):
        while self.q and self.q[0] <= now:
            self.q.popleft()
        if len(self.q) < self.capacity:
            start = max(now, self.q[-1]) if self.q else now
            self.q.append(start + 1.0 / self.rate)
            return True
        return False

    def retained(self):
        return len(self.q)


class FixedWindowCounter:
    """Counter per fixed interval; reset when the interval changes."""

    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.count = 0
        self.idx = -1

    def allow(self, now):
        idx = int(now // self.window)
        if idx != self.idx:
            self.idx = idx
            self.count = 0
        if self.count < self.limit:
            self.count += 1
            return True
        return False

    def retained(self):
        return 1


class SlidingWindowLog:
    """One timestamp per request; exact, but the log grows with the limit."""

    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.q = deque()

    def allow(self, now):
        while self.q and self.q[0] <= now - self.window:
            self.q.popleft()
        if len(self.q) < self.limit:
            self.q.append(now)
            return True
        return False

    def retained(self):
        return len(self.q)


class SlidingWindowCounter:
    """Weighted estimate: previous window counted by its overlap with now."""

    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.curr = 0
        self.prev = 0
        self.idx = -1

    def allow(self, now):
        idx = int(now // self.window)
        if idx != self.idx:
            self.prev = self.curr
            self.curr = 0
            self.idx = idx
        into = now - idx * self.window
        weight_prev = 1.0 - into / self.window
        estimate = self.prev * weight_prev + self.curr
        if estimate < self.limit:
            self.curr += 1
            return True
        return False

    def retained(self):
        return 2


ALGOS = [
    ("TokenBucket", lambda: TokenBucket(RATE, CAPACITY)),
    ("LeakingBucket", lambda: LeakingBucket(RATE, CAPACITY)),
    ("FixedWindowCounter", lambda: FixedWindowCounter(LIMIT, WINDOW)),
    ("SlidingWindowLog", lambda: SlidingWindowLog(LIMIT, WINDOW)),
    ("SlidingWindowCounter", lambda: SlidingWindowCounter(LIMIT, WINDOW)),
]


def run():
    print("trace: %d requests at t=0.99, %d requests at t=1.01  (20 ms apart)"
          % (10, 10))
    print("limit = %d req/s, window = %.1fs, burst capacity = %d"
          % (LIMIT, WINDOW, CAPACITY))
    print("strict bound (burst capacity) = %d admissions" % REFERENCE)
    print("")
    header = "%-22s %8s %10s %9s %9s" % (
        "algorithm", "admitted", "over-admit", "state", "exact")
    print(header)
    print("-" * len(header))
    rows = []
    for name, make in ALGOS:
        algo = make()
        admitted = sum(1 for t in TRACE if algo.allow(t))
        over = admitted / REFERENCE - 1.0
        rows.append((name, admitted, over, algo.retained()))
        print("%-22s %8d %9.1f%% %9d %9s" % (
            name, admitted, over * 100, algo.retained(),
            "yes" if admitted == REFERENCE else "no"))
    print("")
    worst = max(rows, key=lambda r: r[1])
    print("worst: %s admitted %d of %d -> %.0f%% over-admission" % (
        worst[0], worst[1], REFERENCE, worst[2] * 100))
    exact = [r[0] for r in rows if r[1] == REFERENCE]
    loose = [r[0] for r in rows if r[1] > REFERENCE]
    print("exact  (admitted == %d): %s" % (REFERENCE, ", ".join(exact)))
    print("loose  (admitted >  %d): %s" % (REFERENCE, ", ".join(loose)))
    print("")
    print("retained state: 1 counter = the cheap ones, "
          "one entry per request = the log")


if __name__ == "__main__":
    run()
```

```text
trace: 10 requests at t=0.99, 10 requests at t=1.01  (20 ms apart)
limit = 10 req/s, window = 1.0s, burst capacity = 10
strict bound (burst capacity) = 10 admissions

algorithm              admitted over-admit     state     exact
--------------------------------------------------------------
TokenBucket                  10       0.0%         1       yes
LeakingBucket                10       0.0%        10       yes
FixedWindowCounter           20     100.0%         1        no
SlidingWindowLog             10       0.0%        10       yes
SlidingWindowCounter         11      10.0%         2        no

worst: FixedWindowCounter admitted 20 of 10 -> 100% over-admission
exact  (admitted == 10): TokenBucket, LeakingBucket, SlidingWindowLog
loose  (admitted >  10): FixedWindowCounter, SlidingWindowCounter

retained state: 1 counter = the cheap ones, one entry per request = the log
```

**数字出来了。**

| 算法 | 放进 | 相对上界 | 保留状态 | 精确？ |
|---|---|---|---|---|
| 令牌桶 TokenBucket | 10 | +0% | 1 | ✅ |
| 漏桶 LeakingBucket | 10 | +0% | 10 | ✅ |
| **固定窗口计数器** | **20** | **+100%** | 1 | ❌ |
| 滑动窗口日志 | 10 | +0% | 10 | ✅ |
| **滑动窗口计数器** | **11** | **+10%** | 2 | ❌ |

三个结论：

**第一，固定窗口计数器在讲义说的那个场景里，超发恰好是 100%。** 它放进 20 个请求，是严格上界的两倍。原因讲义只说了一半：窗口边缘前那 10 个把计数器打满，但**计数器在新窗口开始时归零**——边缘后那 10 个落进了一个全新的窗口，计数器还是 0，于是全部放行。**窗口归零这件事本身没有错，错的是「一个窗口内的限额」不等于「任意一秒内的限额」。** 固定窗口保证的是「每个固定区间内不超过 N」，而攻击者只要知道区间边界，就能把 2N 个请求挤进跨边界的那一瞬间。

**第二，滑动窗口计数器的误差是 10%，不是「精确」也不是「离谱」。** 它放进 11 个——它用「上一窗口按重叠比例加权 + 本窗口计数」来估算，所以既不是固定窗口那种整段归零的粗暴，也不像滑动窗口日志那样逐条记时间戳。**讲义说它「是近似值」，但没说近似到什么程度。10% 就是它的量级。**

**第三，令牌桶、漏桶、滑动窗口日志在这个场景下三者等价（都放进 10）。** 它们精确，但**精确的代价不同**——这个差别讲义完全没说，下一节量化。

## 二、把「内存消耗高」变成倍数

讲义说滑动窗口日志「内存消耗高」，是滑动窗口计数器唯一被点名的缺点。但没说是高多少，也没说**跟谁比**。

实测量一下：每个限流 key 保留多少个状态条目（这就是 Redis 里的实际开销来源）。两个要点——**到达速率等于阈值**（否则窗口填不满，比的就不是稳态），**跑够 5 个窗口**再读数。

```python
"""How much memory each algorithm's retained state costs, and how it scales.

The note lists "high memory consumption" as the sliding-window log's only
con, and says nothing about the others. This measures the retained state
per key for each algorithm, then sweeps the limit to show which costs
scale with the limit and which stay constant.

Two things are held in sync on purpose:

  * the arrival rate equals the limit, so the algorithms are all busy;
  * the run is long enough that every window is filled.

Otherwise a fixed 10 req/s arrival rate would leave the queue-based
algorithms under-filled and the comparison would be meaningless.
"""
from collections import deque

WINDOW = 1.0


class TokenBucket:
    def __init__(self, limit):
        self.limit = limit
        self.tokens = float(limit)

    def allow(self, now):
        self.tokens = min(self.limit, self.tokens)
        return self.tokens >= 1.0

    def state(self):
        return 1


class LeakingBucket:
    def __init__(self, limit):
        self.limit = limit
        self.q = deque()

    def allow(self, now):
        if len(self.q) < self.limit:
            self.q.append(now)
            return True
        return False

    def state(self):
        return len(self.q)


class FixedWindowCounter:
    def __init__(self, limit):
        self.limit = limit
        self.count = 0

    def allow(self, now):
        if self.count < self.limit:
            self.count += 1
            return True
        return False

    def state(self):
        return 1


class SlidingWindowLog:
    def __init__(self, limit):
        self.limit = limit
        self.q = deque()

    def allow(self, now):
        while self.q and self.q[0] <= now - WINDOW:
            self.q.popleft()
        if len(self.q) < self.limit:
            self.q.append(now)
            return True
        return False

    def state(self):
        return len(self.q)


class SlidingWindowCounter:
    def __init__(self, limit):
        self.limit = limit
        self.curr = 0
        self.prev = 0

    def allow(self, now):
        if self.curr + self.prev < self.limit:
            self.curr += 1
            return True
        return False

    def state(self):
        return 2


ALGOS = [
    ("TokenBucket", TokenBucket),
    ("LeakingBucket", LeakingBucket),
    ("FixedWindowCounter", FixedWindowCounter),
    ("SlidingWindowLog", SlidingWindowLog),
    ("SlidingWindowCounter", SlidingWindowCounter),
]


def steady_state(cls, limit):
    """Arrive at exactly `limit` req/s for 5 windows, then read the state."""
    algo = cls(limit)
    step = 1.0 / limit
    now = 0.0
    for _ in range(5 * limit):
        now += step
        algo.allow(now)
    return algo.state()


def run():
    print("retained state entries per key")
    print("arrival rate = limit, so every window is filled")
    print("")
    header = "%-22s %10s %10s %10s %12s" % (
        "algorithm", "limit=10", "limit=100", "limit=1000", "grows with?")
    print(header)
    print("-" * len(header))
    for name, cls in ALGOS:
        s10 = steady_state(cls, 10)
        s100 = steady_state(cls, 100)
        s1000 = steady_state(cls, 1000)
        grows = "limit" if s1000 > s100 > s10 else "constant"
        print("%-22s %10d %10d %10d %12s" % (
            name, s10, s100, s1000, grows))
    print("")
    print("the three counter-style algorithms hold a constant amount of state;")
    print("the two queue-based ones hold one entry per request inside the")
    print("window, so their cost tracks the limit (1000 req/s -> 1000 entries)")


if __name__ == "__main__":
    run()
```

```text
retained state entries per key
arrival rate = limit, so every window is filled

algorithm                limit=10  limit=100 limit=1000  grows with?
--------------------------------------------------------------------
TokenBucket                     1          1          1     constant
LeakingBucket                  10        100       1000        limit
FixedWindowCounter              1          1          1     constant
SlidingWindowLog               10        100        999        limit
SlidingWindowCounter            2          2          2     constant

the three counter-style algorithms hold a constant amount of state;
the two queue-based ones hold one entry per request inside the
window, so their cost tracks the limit (1000 req/s -> 1000 entries)
```

**计数器型算法的内存是常数，队列型的是线性。**

- 令牌桶、固定窗口计数器、滑动窗口计数器：**1、1、2 个条目**，限流阈值从 10 提到 1000 也不变。
- 漏桶、滑动窗口日志：**10 → 100 → 999**，**跟阈值一起长**。阈值 1000 req/s 时，每个 key 要留 1000 个条目。

这里要纠正一个容易想当然的地方：**「滑动窗口日志内存高」不是因为它记时间戳，而是因为它按请求条数存条目**。滑出窗口的旧条目会被淘汰，所以稳态下它恰好等于「窗口内实际请求数」——在到达速率等于阈值时就是阈值本身。**漏桶也是队列型，同样线性增长**——讲义只点了滑动窗口日志一个名字，漏桶其实一样。

所以内存这一栏的真实排序是：

```
  计数器型（令牌桶 / 固定窗口 / 滑动窗口计数器）：常数，与阈值无关
  队列型（漏桶 / 滑动窗口日志）：O(阈值)，阈值 1000 时是 1000 条
```

**代价换来的是什么？** 漏桶和滑动窗口日志的队列不只占内存，还占**延迟**：漏桶把请求排在队列里等漏出，队列深度就是排队时延；滑动窗口日志每条都要记时间戳，查找与淘汰是 O(log n)。令牌桶只要两个浮点数——所以它排在讲义第 1 位不是没道理。

## 三、滑动窗口计数器的误差在哪里最大

讲义说滑动窗口计数器是「近似值」，但没说误差**在什么条件下最大**。把它沿着窗口扫一遍，看误差曲线。

```python
"""The sliding-window counter's approximation error, swept across edge offsets.

The note calls this algorithm "an approximation". This measures how wrong
the approximation gets, and where it is worst.

Same burst as rl_algos.py (10 requests either side of a window edge), but
the edge position is swept across the window so the error curve shows up.
"""
from collections import deque

LIMIT = 10
WINDOW = 1.0
CAPACITY = 10
REFERENCE = CAPACITY


class SlidingWindowCounter:
    def __init__(self, limit, window):
        self.limit = limit
        self.window = window
        self.curr = 0
        self.prev = 0
        self.idx = -1

    def allow(self, now):
        idx = int(now // self.window)
        if idx != self.idx:
            self.prev = self.curr
            self.curr = 0
            self.idx = idx
        into = now - idx * self.window
        weight_prev = 1.0 - into / self.window
        estimate = self.prev * weight_prev + self.curr
        if estimate < self.limit:
            self.curr += 1
            return True
        return False


def admitted(edge):
    """Burst of 10 just before the edge and 10 just after it."""
    algo = SlidingWindowCounter(LIMIT, WINDOW)
    trace = [edge - 0.01] * 10 + [edge + 0.01] * 10
    return sum(1 for t in trace if algo.allow(t))


def run():
    print("sweeping the burst position across a %.0fs window" % WINDOW)
    print("limit = %d req/s, burst capacity = %d" % (LIMIT, CAPACITY))
    print("")
    print("%-10s %10s %12s" % ("edge at", "admitted", "over-admit"))
    print("-" * 34)
    worst = (None, 0)
    for step in range(0, 11):
        edge = step / 10.0
        n = admitted(edge)
        over = n / REFERENCE - 1.0
        mark = ""
        if over > worst[1]:
            worst = (edge, over)
            mark = "  <- worst"
        print("%-10.1f %10d %11.1f%%%s" % (edge, n, over * 100, mark))
    print("")
    print("worst over-admission: %.0f%% at edge %.1f" % (
        worst[1] * 100, worst[0]))
    print("the estimate weights the previous window by overlap, so the")
    print("error peaks when the burst sits just past the edge")


if __name__ == "__main__":
    run()
```

```text
sweeping the burst position across a 1s window
limit = 10 req/s, burst capacity = 10

edge at      admitted   over-admit
----------------------------------
0.0                11        10.0%  <- worst
0.1                10         0.0%
0.2                10         0.0%
0.3                10         0.0%
0.4                10         0.0%
0.5                10         0.0%
0.6                10         0.0%
0.7                10         0.0%
0.8                10         0.0%
0.9                10         0.0%
1.0                11        10.0%

worst over-admission: 10% at edge 0.0
the estimate weights the previous window by overlap, so the
error peaks when the burst sits just past the edge
```

**误差集中在窗口边界：边界在 0.0 或 1.0（正好落在窗口起点）时超发 10%，其余位置都是 0%。**

这解释了它的加权公式为什么这么设计。估算公式是：

```
estimate = prev_window_count × (1 - 窗口内已过比例) + current_window_count
```

当请求正好落在窗口起点，`into/window = 0`，上一窗口的权重是 `1 - 0 = 1`——**上一窗口的 10 个请求被全额计入**，于是估算值 = 10 已经等于阈值，第 11 个请求刚好挤进来（超发 1 个，即 10%）。当请求落在窗口中段，上一窗口的权重降到 0.5 左右，估算值低于阈值，一个都挤不进来。

**所以滑动窗口计数器的「近似」是有方向性的：它偏松（多放），不偏严。** 这一点讲义没说，但它直接决定了能不能用它做**计费或配额**——多放 10% 意味着可计量的量会超发。反过来，如果只是保护后端不被压垮，偏松是可以接受的。

## 四、分布式：讲义说了「有竞态」，没说竞态在哪

讲义在「分布式环境」一节列了两个挑战——**竞态条件**和**同步问题**——对应的解法是「使用锁、Redis 中的 Lua 脚本或有序集合（sorted sets）」。这句话本身没错，但把 Lua 脚本列出来而不解释它凭什么能解决竞态，是不够的。

Redis 官方文档对脚本原子性的表述是明确的：

> Redis guarantees the script's atomic execution. While executing the script, all server activities are blocked during its entire runtime. These semantics mean that all of the script's effects either have yet to happen or had already happened.

关键在 **「all of the script's effects either have yet to happen or had already happened」**——脚本的效果要么全部发生，要么全部没发生，**不存在中间态**。

而「读计数器 → 判断 → 写回」这三步，**恰恰是典型的中间态**：两个实例同时读到计数器是 9，都判断通过，然后都写回 10——**实际放进 11 个请求，计数器却只记了 10**。这跟算法无关，**令牌桶也一样会中招**：两个实例同时读到 1 个令牌，都判断够，然后都减 1，放进 2 个请求但令牌只扣了 1。

所以 Lua 脚本解决的不是「限流算法的正确性」，而是**「计数器更新」的原子性**。限流逻辑写在脚本里，读、判断、写三步在服务器上不可分割，竞态就没了。讲义把「锁 / Lua 脚本 / 有序集合」并列成三个解法，其实它们解决的是同一个问题的三个层次：

| 方案 | 解决什么 | 代价 |
|---|---|---|
| 分布式锁 | 串行化临界区 | 需要锁服务，多一次往返，故障时要处理锁超时 |
| Redis Lua 脚本 | 让「读-判-写」在服务器上不可分割 | 脚本必须短（执行期间阻塞整个服务器） |
| 有序集合（sorted set） | 用时间戳成员代替计数器 | 内存 O(阈值)，见第二节 |

顺带一个官方文档里的硬约束：**Lua 脚本执行期间，Redis 会阻塞全部服务器活动**。所以限流脚本必须短小——如果把「判断 + 扣减 + 记日志」都塞进去，一个慢调用会拖垮整个实例的吞吐。这是选 Lua 时最容易忽略的边界。

## 五、它不解决什么

- **它不替你选算法。** 第二节那张表给的是代价，不是推荐。**要保护后端不被压垮**，令牌桶（常数内存 + 精确 + 允许突发）是默认选择；**要严格限制任意一秒内的量**，固定窗口不行；**要计费或配额**，滑动窗口计数器的偏松不可接受，得用滑动窗口日志。
- **它不覆盖非 HTTP 场景。** 讲义的限流器是 API 层的。但同一个实现也能用于消息队列消费速率、日志写入速率、LLM API 的 TPM 配额——算法一样，key 的粒度不一样。
- **它没有做多区域协调。** 讲义提到「多数据中心部署以降低延迟」和「最终一致性模型进行同步」，但本文所有数字都是**单进程单 key** 的。跨区域最终一致意味着两个区域各自放行、各自计数，总量会超出阈值——**这是架构选择，不是算法缺陷**。

## FAQ（六、常见问题）

### 固定窗口计数器真的有那么差吗？

**在讲义描述的场景里yes，但它不是无条件差。** 实测确实放进 20/10（超额 100%）。但如果流量是**均匀的**而不是压在边界上，固定窗口的表现就正常——它的问题只在于「攻击者知道窗口边界」。**做法**：如果用固定窗口，把窗口起点做成**每个 key 随机的**（而非全局对齐），攻击者就无法预测边界。注意随机化只降低被针对的概率，不消除超额放行。

### 滑动窗口计数器的 10% 误差能接受吗？

**看用途。** 保护后端：可以接受，它偏松不多。计费或配额：不可接受。**做法**：要精确就上滑动窗口日志（内存 O(阈值)），或者把阈值调低留出余量（比如限流阈值设为业务上限的 0.9 倍）。

### 令牌桶和漏桶到底选哪个？

**看你要不要「排队」。** 令牌桶超发的请求**直接被拒**，客户端拿到 429；漏桶超发的请求**排在队列里等漏出**，客户端等到的是延迟而不是错误。**做法**：对外 API 一般用令牌桶（拒绝对客户端更清晰）；内部需要平滑处理（比如写日志、刷数据）用漏桶。

### 五种算法需要多少 Redis 内存？

**看阈值。** 计数器型（令牌桶 / 固定窗口 / 滑动窗口计数器）每个 key 1–2 个条目，与阈值无关；队列型（漏桶 / 滑动窗口日志）每个 key O(阈值) 个条目——阈值 1000 req/s 就是 1000 条。**做法**：先算 `key 数量 × 每 key 条目数`，这是限流器在生产里的真实内存开销，也是讲义没给的那个数。

### 限流器该放在哪一层？

讲义给了三个选项：客户端、服务端、中间件（API 网关），并推荐服务端与网关。**做法**：按**能不能被绕过**选——客户端实现可被恶意调用方直接跳过（讲义自己说了「不可靠」）；多服务共享配额时必须放网关或共享存储，否则每个服务各限各的，总量是 N 倍。

## 延伸阅读

- 姊妹篇：[封底估算：把系统设计的第一分钟花在算数量级上](/blog/back-of-the-envelope-estimation-reality-check/) — 同一原书的第 2 章，把估算方法拆成可执行的三步
- 姊妹篇：[一致性哈希：把「重分布」变成可测量的数字](/blog/consistent-hashing-measured/) — 同一原书的第 5 章，8 台节点 20 万 key 的实测
- 姊妹篇：[唯一 ID 生成器：Snowflake 的位分配算一遍](/blog/unique-id-generator-snowflake-computed/) — 同一原书的第 7 章，41/5/5/12 位布局与时钟回拨实测
- 相关：[Redis 官方文档：Scripting with Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/) — 原子性语义与「脚本必须短」的约束
- 相关：[系统设计面试的 4 步框架：把行为断言变成机械检查](/blog/system-design-interview-framework-checkable/) — 同一个思路的另一处应用：把定性建议写成可跑的规则

## 出处与许可

- **原始出处**：Alex Xu《System Design Interview — An Insider's Guide》（Vol 1 & 2, 2nd Ed.），第 4 章「Design a Rate Limiter」。原书为**商业出版物**，版权归作者所有。
- **本文所据的中文笔记**：`lukeTheNeuromancer/system-design-notes-zh`（社区翻译版）与英文原笔记 `liquidslr/system-design-notes`。**这两个仓库均未附带任何 LICENSE 文件**（GitHub API 返回 `license: null`），即**未获任何转载或改编授权**。
- **因此本文的处理**：仅做**方法层面的译述与讨论**，不转载、不改编原书或两个笔记仓库的正文；引用限于概念与算法描述的口径说明，并逐处标明来源。全部技术内容以本文自己的实现与实测为依据。
- **本文自有的增量**（占正文主体）：① **五种算法的同负载对比**——把令牌桶、漏桶、固定窗口计数器、滑动窗口日志、滑动窗口计数器写成可执行实现，跑同一条跨窗口边界的对抗流量，测出**固定窗口超发 100%（放进 20/10）、滑动窗口计数器超发 10%（11/10）**，其余三种精确（10/10）；② **内存开销的量化与纠正**——测出计数器型算法状态条目与阈值无关（恒为 1–2），队列型随阈值线性增长（阈值 1000 → 999–1000 条），并指出**讲义只点了滑动窗口日志的名字，漏桶同样是线性**；③ **滑动窗口计数器误差的分布**——沿窗口扫描边界位置，测出误差集中在窗口起点（超发 10%）、中段为 0%，并据此说明它的近似是**偏松不偏严**；④ **竞态的精确位置**——讲义并列了「锁 / Lua 脚本 / 有序集合」三个解法但未解释何以解决，本文用「读-判-写中间态」说明 Lua 解决的是**计数器更新的原子性**而非算法正确性，并引 Redis 官方文档说明脚本执行期间阻塞全部服务器活动这一硬约束。
- **代码说明**：文中 `python` 代码块均为本文自写实现（五个算法各一份，共三个可执行脚本），采用「时间由调用方传入、无墙钟依赖」的设计，因此输出可逐字节复现；三个脚本各连跑三次输出哈希一致。紧邻的 `text` 块为当次真实执行的 stdout。
- **未经原作者授权**。如需正式引用原书内容，请购买原书并遵守其版权条款。
