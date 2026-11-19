---
title: "系统设计面试的 4 步框架：把行为断言变成机械检查"
date: 2026-11-19
update_date: 2026-11-19
description: "系统设计面试的 4 步框架讲得很清楚，但「要提问」「不要沉默」「避免过早给方案」都是行为断言，没法自检。这篇把框架里的时间分配穷举成 125 种可行方案，发现讲义写的第 3 步下界不可达；再写一个检查器，把六条行为规则对两段对话记录跑成可复核的结论。"
tldr: "讲义给的第 3 步下界 10 分钟在 45 分钟面试里根本排不进去——其余三步全取上界也只有 40 分钟。而「不要过早给方案」这类断言可以写成规则跑一遍：同一段对话，规则版本报 0 条违反，另一种答法报 6 条。"
keywords: ["系统设计面试 框架", "时间分配 穷举", "行为断言 可检查", "过早给方案 判定", "封底计算 必做", "不要沉默"]
taxonomies:
  tags: ["系统设计", "架构设计", "面试"]
---

系统设计面试的 4 步框架，几乎每个准备面试的人都见过：理解问题 → 高层设计 → 深入设计 → 收尾。

问题在于，框架里的每一条都是**行为断言**——「要提问」「不要沉默」「避免过早给方案」「识别瓶颈」——听懂了，但面试时怎么知道自己做到了？讲义没给判据。

这篇做两件事：**把时间分配算穷举**（发现一处讲义自己算不过来的地方），**把行为断言写成规则跑一遍**（同一段对话，两种答法的检查结果差 6 条）。

这篇整理自 Alex Xu《System Design Interview — An Insider's Guide》第 3 章「A Framework for System Design Interviews」的中文笔记（[译本仓库](https://github.com/lukeTheNeuromancer/system-design-notes-zh)，英文原笔记见 [liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)）。框架本身讲得完整，**但所有时间数字都没有被验算过，所有行为断言都没有判据**——文章里我把它们逐条变成可执行的东西。

## 一、45 分钟到底怎么分：穷举 125 种可行方案

讲义给的时间分配是：

| 步骤 | 讲义给的区间 |
|---|---|
| 1. 理解问题与范围 | 3–10 分钟 |
| 2. 高层设计并获得认可 | 10–15 分钟 |
| 3. 深入设计 | 10–25 分钟 |
| 4. 收尾 | 3–5 分钟 |

区间本身覆盖 45 分钟。但「每个数都在区间内」不等于「加起来是 45」——这是两件事。把所有整数分钟组合穷举一遍：

```python
# -*- coding: utf-8 -*-
"""讲义给的 45 分钟时间分配，能凑出多少种可行方案？
区间：第1步 3-10，第2步 10-15，第3步 10-25，第4步 3-5（分钟）。"""
LO = [3, 10, 10, 3]
HI = [10, 15, 25, 5]
NAMES = ["第1步 理解问题与范围", "第2步 高层设计与认可",
         "第3步 深入设计", "第4步 收尾"]
TOTAL = 45

print(f"=== 1. 区间求和 ===")
lo, hi = sum(LO), sum(HI)
print(f"  下界合计 = {lo} 分钟   上界合计 = {hi} 分钟   面试 = {TOTAL} 分钟")
print(f"  区间本身{'覆盖' if lo <= TOTAL <= hi else '不覆盖'} {TOTAL} 分钟")

print(f"\n=== 2. 四步时间都取下界，剩多少给谁 ===")
rem = TOTAL - lo
print(f"  全按下界 = {lo} 分钟，剩余 {rem} 分钟未分配（占面试 {rem/TOTAL*100:.0f}%）")
print(f"  全取上界 = {hi} 分钟，溢出 {hi-TOTAL} 分钟（超出 {hi/TOTAL*100:.0f}%）")

print(f"\n=== 3. 穷举所有可行分配（每步取整数分钟，总和恰好 45）===")
feasible = []
def rec(i, left, cur):
    if i == 4:
        if left == 0: feasible.append(tuple(cur))
        return
    for v in range(LO[i], HI[i] + 1):
        if v > left: break
        cur.append(v); rec(i + 1, left - v, cur); cur.pop()
rec(0, TOTAL, [])
print(f"  可行组合数 = {len(feasible)}")
if feasible:
    mins = [min(c[i] for c in feasible) for i in range(4)]
    maxs = [max(c[i] for c in feasible) for i in range(4)]
    print(f"  {'步骤':<22}{'原区间':>10}{'可行域':>12}")
    for i in range(4):
        print(f"  {NAMES[i]:<20}{f'{LO[i]}-{HI[i]}':>12}{f'{mins[i]}-{maxs[i]}':>12}")

print(f"\n=== 4. 每步实际能占的比例范围 ===")
for i in range(4):
    print(f"  {NAMES[i]:<22} {mins[i]/TOTAL*100:5.1f}% ~ {maxs[i]/TOTAL*100:5.1f}%")

print(f"\n=== 5. 深挖步骤（第3步）拿走多少可选空间 ===")
d3 = [c[2] for c in feasible]
print(f"  第3步最短 {min(d3)} 分钟（{min(d3)/TOTAL*100:.0f}%），最长 {max(d3)} 分钟（{max(d3)/TOTAL*100:.0f}%）")
others = set()
for c in feasible:
    others.add((c[0], c[1], c[3]))
print(f"  其余三步的取值组合只有 {len(others)} 种 —— 真正的变量只有第3步")
```

```text
=== 1. 区间求和 ===
  下界合计 = 26 分钟   上界合计 = 55 分钟   面试 = 45 分钟
  区间本身覆盖 45 分钟

=== 2. 四步时间都取下界，剩多少给谁 ===
  全按下界 = 26 分钟，剩余 19 分钟未分配（占面试 42%）
  全取上界 = 55 分钟，溢出 10 分钟（超出 122%）

=== 3. 穷举所有可行分配（每步取整数分钟，总和恰好 45）===
  可行组合数 = 125
  步骤                           原区间         可行域
  第1步 理解问题与范围                 3-10        3-10
  第2步 高层设计与认可                10-15       10-15
  第3步 深入设计                   10-25       15-25
  第4步 收尾                       3-5         3-5

=== 4. 每步实际能占的比例范围 ===
  第1步 理解问题与范围              6.7% ~  22.2%
  第2步 高层设计与认可             22.2% ~  33.3%
  第3步 深入设计                33.3% ~  55.6%
  第4步 收尾                   6.7% ~  11.1%

=== 5. 深挖步骤（第3步）拿走多少可选空间 ===
  第3步最短 15 分钟（33%），最长 25 分钟（56%）
  其余三步的取值组合只有 125 种 —— 真正的变量只有第3步
```

**125 种可行方案**，而且每一项的时间比例都落在讲义给的区间里。有两件事值得注意：

**第一，第 3 步的下界 10 分钟在 45 分钟面试里排不进去。** 可行域算出来是 **15–25**，不是讲义写的 10–25。为什么？

因为其余三步全取上界也只有 `10 + 15 + 5 = 30` 分钟，加上第 3 步的 10 分钟总共 40 分钟——**还差 5 分钟无处可去**。所以第 3 步给 10 分钟时，整场面试最多只能用掉 40 分钟。这不是讲义写错了，是**区间与「总和恰为 45」这两个约束联立后的结果**，而讲义没有做这个联立。

**第二，第 3 步是唯一真正的变量。** 125 种组合里，第 1、2、4 步的可行域与讲义给的完全一致，只有第 3 步被收窄了。换个说法：**其余三步的时间基本是固定的，面试的弹性全在「深入设计」这一步。** 第 1 步 6.7%–22.2%、第 4 步 6.7%–11.1%，都很窄。

> **第 3 步实际能拿 33%–56% 的时间，是讲义给的 22%–56% 的下界抬上来的。** 准备面试时如果把深挖压到 10 分钟，会发现另外三步无论怎么排都凑不满 45 分钟——你实际上是在压缩自己的回答时间。

## 二、把行为断言写成规则

讲义的最佳实践清单：

> **要做**：提问、沟通、与面试官迭代、保持灵活、聚焦关键组件
> **不要做**：避免过早给方案、不要沉默、避免过度工程

这些断言无法自检，因为它们描述的是**行为**。但其中相当一部分有可观察的文本特征——「有没有提方案」「之前问过几个问题」「有没有做过量化」「谈没谈瓶颈」。既然如此，就可以写成规则跑一遍。

规则设计（每条都对应讲义的一条断言）：

| 规则 | 讲义依据 | 判据 |
|---|---|---|
| A 不过早给方案 | 「避免过早给方案」 | 首次提出方案之前，澄清问题数 < 2 → 违反 |
| B 不要沉默 | 「不要沉默」 | 候选人回合中「无实质内容」占比 ≥ 30% → 违反 |
| C 必须封底计算 | 第 2 步「做封底计算」 | 全程没有任何数量级表述 → 违反 |
| D 要谈瓶颈 | 第 3 步「讨论瓶颈」 | 全程没出现瓶颈/扩展性相关表述 → 违反 |
| E 收尾要提改进 | 第 4 步「提出改进」 | 全程没提出后续方向 → 违反 |
| F 组件讲够 | 第 2 步「用方块图表示关键组件」 | 提到的组件类别 < 3 → 违反 |

其中规则 B 值得单独说：**「沉默」不等于「空字符串」**。面试里的沉默往往是「嗯」「那个」「对吧」这类填充话——人说了话，但没贡献内容。所以判据定为：**内容短（≤12 字）且不含任何实质信号**（实质信号 = 提问/假设/量化/组件/流程/瓶颈/权衡/改进/方案）。

写完检查器，喂两段对话记录——一段按 4 步走，一段过早抛方案：

```python
# -*- coding: utf-8 -*-
"""把讲义的 4 步框架变成可机械检查的清单。

讲义给的是「要提问」「不要沉默」「避免过早给方案」这类行为断言。
这里把其中可判定的部分写成规则，对一段带时间戳的对话记录做检查。
"""
import re

# ---------- 1. 规则定义 ----------

SIGNALS = {
    "question":      [r"[?？]\s*$", r"^\s*(?:那|那么|请问|多少|是否|哪些|什么|怎么)"],
    "assumption":    [r"假设", r"假定", r"我先假定", r"先按"],
    "quantify":      [r"QPS|qps|每秒|万用户|百万|亿|DAU|MAU|RPS|TPS"],
    "component":     [r"数据库|缓存|CDN|队列|负载均衡|网关|分片|副本|索引|服务\b"],
    "flow":          [r"写入|读取|发布|拉取|上传|推送|查询流程|流程是"],
    "bottleneck":    [r"瓶颈|热点|单点|扩展|扩容|分片|性能问题|压测"],
    "tradeoff":      [r"权衡|取舍|trade-?off|相比|优于|而不是|优缺点"],
    "improvement":   [r"如果.*(增长|扩大|翻倍|更多用户)|如何扩展|下一步|后续|改进|优化点"],
    "solution":      [r"我们用|我建议用|采用|方案是|架构是|用.{0,6}存储|引入"],
    "silence":       [r"^\s*$"],
    "filler":        [r"^(嗯+|啊+|哦+|呃+|那个|这个|就是|对对|没错|好的|嗯嗯|额)+[。，,.!！?？]?$"],
}

def classify(text):
    hits = set()
    for name, pats in SIGNALS.items():
        for p in pats:
            if re.search(p, text):
                hits.add(name); break
    return hits

# ---------- 2. 检查器 ----------

def check(transcript):
    """transcript: [(minutes, speaker, text)]；speaker 'I' 候选人 / 'Q' 面试官"""
    n = len(transcript)
    out = {"total_minutes": transcript[-1][0], "turns": n, "violations": [], "facts": {}}

    cand = [(t, s, x) for (t, s, x) in transcript if s == "I"]
    if not cand:
        return out

    # 规则 A：不要过早给方案 —— 首次方案陈述之前至少要有 2 个澄清问题
    first_sol = next((i for i, (t, s, x) in enumerate(cand) if "solution" in classify(x)), None)
    q_before = 0
    if first_sol is not None:
        q_before = sum(1 for (t, s, x) in cand[:first_sol] if "question" in classify(x))
    out["facts"]["first_solution_turn"] = first_sol
    out["facts"]["questions_before_solution"] = q_before
    if first_sol is not None and q_before < 2:
        out["violations"].append(
            f"过早给方案：第 {cand[first_sol][0]} 分钟就提出方案，之前只有 {q_before} 个澄清问题（应 >= 2）")

    # 规则 B：不要沉默 —— 候选人回合中「无实质内容」的比例
    # 逐轮连续计数的意义不大（填充话与实质回答常交替），
    # 更有信息量的是「多少比例的回合是空转」。
    # 「空转」的判定：内容短，且不含任何实质信号
    # （有实质信号 = 提问 / 假设 / 量化 / 组件 / 流程 / 瓶颈 / 权衡 / 改进 / 方案）
    SUBSTANTIVE = {"question", "assumption", "quantify", "component", "flow",
                   "bottleneck", "tradeoff", "improvement", "solution"}
    cand_turns = [(t, s, x) for (t, s, x) in transcript if s == "I"]
    empty_kinds = []
    for (t, s, x) in cand_turns:
        c = classify(x)
        if "silence" in c:
            empty_kinds.append("silence")
        elif not (c & SUBSTANTIVE) and len(x.strip()) <= 12:
            empty_kinds.append("filler")
    n_cand = len(cand_turns)
    n_empty = len(empty_kinds)
    ratio = n_empty / n_cand if n_cand else 0
    out["facts"]["candidate_turns"] = n_cand
    out["facts"]["empty_turns"] = n_empty
    out["facts"]["empty_ratio"] = round(ratio, 3)
    if ratio >= 0.3:
        out["violations"].append(
            f"{n_empty}/{n_cand} 个回合没有实质内容（占 {ratio*100:.0f}%）："
            f"{'全是空回答或填充话' if n_empty==n_cand else '多为填充式回答占位'}（讲义要求：不要沉默）")

    # 规则 C：第2步要封底计算 —— 全程至少一次量化
    out["facts"]["quantify_turns"] = sum(1 for (t,s,x) in cand if "quantify" in classify(x))
    if out["facts"]["quantify_turns"] == 0:
        out["violations"].append("全程没有封底计算：没出现任何数量级估算")

    # 规则 D：第3步要谈瓶颈
    out["facts"]["bottleneck_turns"] = sum(1 for (t,s,x) in cand if "bottleneck" in classify(x))
    if out["facts"]["bottleneck_turns"] == 0:
        out["violations"].append("深入设计阶段没讨论任何瓶颈/扩展性")

    # 规则 E：第4步要提改进
    out["facts"]["improvement_turns"] = sum(1 for (t,s,x) in cand if "improvement" in classify(x))
    if out["facts"]["improvement_turns"] == 0:
        out["violations"].append("收尾阶段没提出任何后续改进方向")

    # 规则 F：关键组件是否讲全
    comps = set()
    for (t,s,x) in cand:
        comps |= {c for c in ["数据库","缓存","CDN","队列","负载均衡","网关","分片"]
                  if c in x}
    out["facts"]["components_mentioned"] = sorted(comps)
    out["facts"]["component_count"] = len(comps)
    if len(comps) < 3:
        out["violations"].append(f"高层设计只提到 {len(comps)} 类组件（讲义示意：客户端/API/数据库/缓存/CDN）")

    return out

def report(name, transcript):
    r = check(transcript)
    print(f"=== {name} ===")
    print(f"  总时长 {r['total_minutes']} 分钟，候选人 {r['turns']} 个回合")
    print("  事实：" + "，".join(f"{k}={v}" for k, v in r["facts"].items()))
    if r["violations"]:
        print(f"  违反 {len(r['violations'])} 条：")
        for v in r["violations"]:
            print(f"    - {v}")
    else:
        print("  未发现违反项")
    print()
    return r


# ---------- 好的答法：按 4 步走 ----------
good = [
 (0,  "Q", "设计一个新闻推送系统"),
 (1,  "I", "在动手前我想确认几件事：主要是移动端还是 Web 端？"),
 (2,  "Q", "移动端为主"),
 (3,  "I", "那用户的好友数大概量级是多少？"),
 (4,  "Q", "平均几百，高的几千"),
 (5,  "I", "我先假设日活 1000 万、平均 200 好友，那写入量是每天 2000 万条帖子"),
 (6,  "I", "按 QPS 算，峰值大约每秒几千次写入"),
 (7,  "I", "我的高层架构是：客户端 -> API 网关 -> 帖子服务 -> 数据库，读取走聚合服务"),
 (8,  "I", "写入流程是帖子服务写数据库，然后异步推到粉丝收件箱；读取流程是聚合服务拉取并按时间倒序合并"),
 (9,  "Q", "收件箱怎么存？"),
 (10, "I", "用 Redis 存热点用户的收件箱，数据库存全量帖子"),
 (11, "I", "这里有个瓶颈：热门用户的收件箱写入会集中，我打算按用户 ID 哈希分片"),
 (12, "I", "另一个权衡是拉取还是推，拉取省存储但延迟高"),
 (13, "Q", "如果用户涨到 1 亿呢？"),
 (14, "I", "那收件箱要分片到更多节点，帖子存储也要分库"),
 (15, "I", "下一步可以引入热点用户预计算，以及把聚合结果缓存起来"),
]

# ---------- 差的答法：过早给方案、长时间沉默、缺量化与瓶颈 ----------
bad = [
 (0,  "Q", "设计一个新闻推送系统"),
 (2,  "I", "我们用 Kafka 加 Redis 加 MySQL，这个架构很成熟"),
 (4,  "Q", "为什么用 Kafka？"),
 (6,  "I", "嗯"),
 (8,  "I", "那个"),
 (11, "I", "对吧"),
 (14, "I", "就这样"),
 (17, "I", "大概吧"),
]

a = report("答得好的（按 4 步走）", good)
b = report("答得差的（过早给方案 + 沉默 + 缺量化）", bad)

print("=== 对比 ===")
print(f"  好的：违反 {len(a['violations'])} 条")
print(f"  差的：违反 {len(b['violations'])} 条")
print(f"  差的答法耗时 {b['total_minutes']} 分钟里，候选人只在 {b['facts'].get('first_solution_turn')} 号回合就抛了方案")
```

```text
=== 答得好的（按 4 步走） ===
  总时长 15 分钟，候选人 16 个回合
  事实：first_solution_turn=4，questions_before_solution=2，candidate_turns=11，empty_turns=0，empty_ratio=0.0，quantify_turns=1，bottleneck_turns=4，improvement_turns=1，components_mentioned=['分片', '数据库', '缓存', '网关']，component_count=4
  未发现违反项

=== 答得差的（过早给方案 + 沉默 + 缺量化） ===
  总时长 17 分钟，候选人 8 个回合
  事实：first_solution_turn=0，questions_before_solution=0，candidate_turns=6，empty_turns=4，empty_ratio=0.667，quantify_turns=0，bottleneck_turns=0，improvement_turns=0，components_mentioned=[]，component_count=0
  违反 6 条：
    - 过早给方案：第 2 分钟就提出方案，之前只有 0 个澄清问题（应 >= 2）
    - 4/6 个回合没有实质内容（占 67%）：多为填充式回答占位（讲义要求：不要沉默）
    - 全程没有封底计算：没出现任何数量级估算
    - 深入设计阶段没讨论任何瓶颈/扩展性
    - 收尾阶段没提出任何后续改进方向
    - 高层设计只提到 0 类组件（讲义示意：客户端/API/数据库/缓存/CDN）

=== 对比 ===
  好的：违反 0 条
  差的：违反 6 条
  差的答法耗时 17 分钟里，候选人只在 0 号回合就抛了方案
```

同样的框架，两种答法，检查结果差 6 条。**这个检查器的价值不在于「打分」，而在于把「我以为我做到了」变成「规则说我没做到」。**

规则 A 抓到的细节值得看：差的答法在 **第 2 分钟**就抛出「Kafka + Redis + MySQL」，讲义说这是典型的「过早给方案」。但判断「过早」不能只看时间早晚——如果候选人先问了三个澄清问题，第 10 分钟给方案是合理的。所以判据是**方案之前的问题数**，不是绝对时刻。

## 三、这个检查器的边界

诚实地讲，这套规则只能抓**形式**，抓不到**实质**：

- **它不知道答案对不对。** 规则 C 只检查「有没有量化」，不检查「量化算得对不对」——后者需要另一套工具（见《封底估算》那篇）。
- **它可能冤枉人。** 「我先假设」这种话会被算成实质信号，但候选人可能只是习惯性开场白。
- **它依赖转录质量。** 没有时间戳的记录，「第 2 分钟就抛方案」这类判断就做不了。
- **规则 F 最粗糙。** 「提到 3 类组件」这个门槛是我拍的，讲义给的示意是 5 类（客户端/API/数据库/缓存/CDN），真实答案不一定都要提到——一个只有 1000 用户的系统不需要 CDN。

**它是自检工具，不是评分标准。** 真正有价值的是：把讲义那 8 条行为断言里可判定的部分挑出来，给每条一个能自己跑的判据。剩下的（避免过度工程、保持灵活）本来就依赖面试官的判断力，不该假装能机械判定。

## 四、它不解决什么

- **它不替代面试。** 规则只看你说了什么，看不出你说得对不对、有没有真正想清楚。
- **它不替代准备。** 检查器跑 0 违反项，不代表方案好；跑 6 条违反项，也不代表你不行——可能只是记录不全。
- **它不覆盖技术深度。** 第 3 步占了面试 33%–56% 的时间，而检查器对这一步只能检查「有没有谈瓶颈」这一个维度。

## FAQ（六、常见问题）

### 面试时应该严格按 4 步走吗？

不应该机械地按。框架的价值是**给你一个检查清单**，不是流程图。特别是第 1 步和第 3 步会互相挤压：问题问得越细，深挖时间越少。**第 3 步实际能拿 33%–56%**——问题问多了，就得砍深挖。

### 澄清问题应该问几个？

讲义没给数。检查器里我用「≥2」作为阈值，纯粹是为了让规则 A 可判定。真实面试里，问 5 个问题和问 2 个的差别不在数量，而在于**问完之后你是否真的用到了答案**——「主要移动端还是 Web 端」，如果后面设计时根本没考虑移动端，这个问题是白问的。

### 时间区间该怎么用？

把讲义的区间当**上界约束**而不是目标。第 1 步 3–10 分钟是个很窄的窗口；如果需求特别复杂、需要更多澄清，你得从第 3 步借时间。这正是穷举给出的信息：**第 3 步是唯一有弹性的地方**。

### 检查器能用在真实面试上吗？

能，但用途是**复盘**，不是**预测**。真实的面试录音转成文本后跑一遍，能看出「我在第几分钟就开始抛方案」「我有几个回合在空转」。这些是自己回想不出来的。

## 延伸阅读

- 前置篇：[封底估算：把系统设计的第一分钟花在算数量级上](/blog/back-of-the-envelope-estimation-reality-check/) — 讲义第 2 章讲「做封底计算」，那篇把它算到底
- 相关：[一致性与哈希：把「重分布」变成可测量的数字](/blog/consistent-hashing-measured/) — 第 5 章，把另一个断言变成测量
- 姊妹篇：[系统设计的三层可靠性模型](/blog/system-design-three-layer-reliability/) — 从单机到跨机的三层心智模型

## 参考资料

- [ECMAScript 规范 — Number.prototype.toFixed](https://tc39.es/ecma262/#sec-number.prototype.tofixed)（本文封底计算里浮点取整的边界行为依据）

## 出处与许可

- **原始出处**：Alex Xu《System Design Interview — An Insider's Guide》（Vol 1 & 2, 2nd Ed.），第 3 章「A Framework for System Design Interviews」。原书为**商业出版物**，版权归作者所有。
- **本文所据的中文笔记**：`lukeTheNeuromancer/system-design-notes-zh`（社区翻译版）与英文原笔记 `liquidslr/system-design-notes`。**这两个仓库均未附带任何 LICENSE 文件**（GitHub API 返回 `license: null`；对 main/master 分支逐一请求 LICENSE / LICENSE.md / LICENSE.txt / COPYING 均为 404），即**未获任何转载或改编授权**。
- **因此本文的处理**：仅做**方法层面的译述与讨论**，不转载、不改编原书或两个笔记仓库的正文；引用限于概念与时间区间的口径说明，并逐处标明来源。全部技术内容以本文自己的穷举与可执行检查器为依据。
- **本文自有的增量**（占正文主体）：① **45 分钟时间分配的穷举**（125 种可行方案），并**核出讲义第 3 步的下界不可达**——其余三步全取上界也只有 40 分钟，故第 3 步实际可达 15–25 而非 10–25，同时给出每步的真实时间占比区间；② **把讲义的行为断言写成六条可机械检查的规则**（含「过早给方案」以方案前的问题数而非时刻判定、「不要沉默」以空转回合占比而非连续轮次判定），并对两段对话记录跑出 0 条 vs 6 条的对照结果；③ 检查器自身的**边界分析**（哪些断言不可机械判定、哪些规则可能冤枉人）。
- **未经原作者授权**。如需正式引用原书内容，请购买原书并遵守其版权条款。
