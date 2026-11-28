---
title: "反 Slop 的三笔账：约束下沉、覆盖率与回退止损"
date: "2026-11-27"
description: "从我读完的 AIE 2026《All Code Is Slop》精读笔记出发，补三个可跑的模型：一次纠正该下沉到哪一层的经济账、自主 merge 需要的约束覆盖率阈值、以及回退率作为交换的止损线。"
tldr: "把纠正「下沉」到哪一层有明确的经济学：同层问题的月度人工纠正量 4,400 分钟，prose 层（rules/AGENTS.md）只剩 20% 生效、持续成本最贵；deterministic check 全量跑（5,500 分钟/月）比人工纠正还贵，**增量跑才划算**（1,100 分钟/月，回本 1.1 天）；架构级约束一次性 480 分钟、持续成本为 0、回本 3.3 天。自主 merge 的前提是**约束覆盖率 > 50.9%**（= 1 − review 产能/产量），而规则集的**上限由维护成本决定**（本模型最优约 60 条）。回退率是交换的止损线：覆盖率 85% 时止损回退率 1.88%，当前 0.5% 只剩 3.8 倍余量。"
keywords: ["软件工厂", "确定性约束", "自主 merge", "回退率", "slop"]
taxonomies:
  tags: ["AI工程", "软件工厂", "技术深度", "大会笔记"]
---

反 Slop 的三笔账？纠正该下沉到哪一层、覆盖率要到多少才敢自主 merge、回退率涨到多少就得停手。我读完 AIE Code Summit 2026 主舞台那场《All Code Is Slop (Except Mine)》之后，最想验证的不是它的口号，而是它背后那套「把纠正沉淀成确定性检查」的机制在算术上成不成立。这篇把它算出来。

## 口径说明

- 源是我自己的精读笔记 `02-课程体系/AIE-Code-Summit-2026/01-软件工厂与反Slop/Lauren Tan - All Code Is Slop (Except Mine).md`（约 12,600 字，已按官方 Day 1 中英对照演讲稿逐条校对）。
- **演讲本身按导读式处理**：只复述机制与公开数据，**不引用官方译稿原文、不搬附件图**。所有代码与数字均为自写模型。
- **数据归属要说清**：11,000 PR/月、227 名贡献者、回退率约 0.5%、70% token 用于验证——这些是**讲者在公开演讲中给出的自己团队的数据**，不是我的实测，也不是基准测试；引用时带日期与出处，别当规格。
- 三个脚本只依赖 Python 标准库；输出为实跑结果，逐行可复现（无随机数，两次运行输出逐字一致）。
- **我为了建模补的**（问题出现频率、人工纠正成本、一次性实施成本、每 PR 维护成本、review 人数与每人吞吐、每次回退的返工工时）都标为「估」。
- **撞题与边界**：同大会另有两场已发——《[删掉 90% 的 harness 之后](/blog/deleting-90-percent-of-your-harness/)》讲 harness 瘦身、《[软件工厂的安全验证闭环](/blog/safe-software-factory-verification-loops/)》讲验证流程怎么闭环。**那两篇分别是 harness 与验证，本文是「约束分层 + 覆盖率 + 回退止损」这三笔账**，不重复。

## 一、讲者的骨架：约束的三层与一次纠正的去向

**核心命题**：软件工程师的 meta 是在产量暴涨的同时维持甚至提升代码质量。这场演讲给了它一个可操作的回答——**约束分层**：

1. **底层是 deterministic 的**：好的 API design、architecture、refactoring，加上 lint rules、type systems、compilers、各类 testing；
2. **中间是 verification**（runtime 与 formal）：用来找 bug、检查应当恒成立的 properties 与 invariants，同时检验 agent 是否真的理解了目标；
3. **最上面才是一点 prose**：rules、skills、AGENTS.md 这类需要判断的东西。

**关键操作原则**：每次纠正 agent 时，先想能不能把它变成一个 deterministic check，而不是往 rules / AGENTS.md 里再加一行。讲者给的三条判断是：「凡是需要 nuance 才能用好的 API，往往导致 slop」；注释这类 prose **不可强制**（not enforceable）；comment 的坏处还在于它给 agent 留了逃避困难的 hatch。

**三个实战案例（都是「类别性消灭」而不是逐个修）**：一是把 React 的 `useEffect` 在产品代码里直接 ban 掉（只在自家框架 API 内部少数位置允许）——「需要博士才能用对的 API」是 slop 的来源；二是目录结构即上下文，两个顶层目录字面上就叫 `electron-renderer` 和 `electron-main`，跨目录 import 被依赖图分析器和 lint 禁止；三是 **ban 掉 99% 的注释**，换成给出优质错误信息的 lint rules，让 agent 去修 root cause 而不是打补丁。

**verification 的四件套**：runtime verification（让 agent 用人类同款调试工具跑代码，配一个「功能地图」共享词汇与可复用的 custom CLI）、formal verification（TLA+ 做 model checking、Lean 证明特定算法）、property-based testing、状态机可视化。review 因此萎缩成「看 verification artifacts」（视频、截图、图表、形式化验证结果）。

**质量数据**：上个月团队 ship 了 **11,000 个 PR**，stable 版本约每天一个；10 月有 **227 人**至少贡献一个 PR；**回退率约 0.5%**，在这样的 shipping 节奏下反而没有变差。还有一个更狠的对照——半年前有人说「没法信任 agent 的 PR 被合并」，半年后同一个人说自己**每天 70% 的 token 花在 verification 上**。

**落地顺序**：先打地基（codebase、静态检查、runtime/formal verification），再搭工厂。「如果你的内环产出 slop，自动化它只会产出更多 slop」——而且 token 很贵。

## 二、增量一：一次纠正该下沉到哪一层

```python
"""把一次纠正「下沉」到哪一层：三层的一次性成本与持续收益。

数字取自我的精读笔记（讲者公开数据：月 11,000 PR、回退率 ~0.5%、227 名贡献者、70% token 用于验证），
其余为本脚本设定（估）。只依赖标准库；输出确定性。
"""
PR_MONTH = 11000            # 讲者团队月 PR 数（笔记）
PR_DAY = PR_MONTH / 30
EVENTS_PER = 50             # 每 50 个 PR 出现一次同类问题（估）
FIX_MIN = 20                # 人工纠正一次的成本（分钟，估）
PROSE_EFFECT = 0.20         # 只写进 rules/AGENTS.md 时实际生效的比例（估）
CHECK_ONETIME = 120         # 写一条 deterministic check 的一次性成本（分钟，估）
CHECK_PER_PR_FULL = 0.5     # 全量跑时每 PR 的维护成本（分钟，估）
CHECK_PER_PR_INCR = 0.1     # 增量跑（只对改动文件）时每 PR 的成本（分钟，估）
ARCH_ONETIME = 480          # 架构级约束的一次性成本（分钟，估）

events_month = PR_MONTH / EVENTS_PER
fix_min_month = events_month * FIX_MIN
print("一、每月同类问题的人工纠正量")
print("   月 %s 个 PR，每 %d 个出现一次同类问题 -> %d 次/月；人工纠正一次 %d 分钟 -> %s 分钟/月（%.1f 小时）" % (
    format(PR_MONTH, ","), EVENTS_PER, int(events_month), FIX_MIN,
    format(int(fix_min_month), ","), fix_min_month / 60))
print()
print("二、三种处置方式的月度成本")
prose_min = events_month * FIX_MIN * (1 - PROSE_EFFECT)
det_full_min = CHECK_ONETIME + PR_MONTH * CHECK_PER_PR_FULL
det_incr_min = CHECK_ONETIME + PR_MONTH * CHECK_PER_PR_INCR
print("%-34s %18s %20s %18s" % ("处置方式", "一次性(分钟)", "持续(分钟/月)", "月总成本(分钟)"))
print("%-34s %18s %20s %18.0f" % ("只写进 rules/AGENTS.md", 0, format(int(prose_min), ","), prose_min))
print("%-34s %18d %20s %18.0f" % ("deterministic check（全量跑）", CHECK_ONETIME,
      format(int(PR_MONTH * CHECK_PER_PR_FULL), ","), det_full_min))
print("%-34s %18d %20s %18.0f" % ("deterministic check（增量跑）", CHECK_ONETIME,
      format(int(PR_MONTH * CHECK_PER_PR_INCR), ","), det_incr_min))
print("%-34s %18d %20s %18.0f" % ("架构级约束（让问题不可能犯）", ARCH_ONETIME, 0, ARCH_ONETIME))
print()
print("   => 全量跑 deterministic check 的持续成本（%s 分钟/月）**比人工纠正（%s 分钟/月）还贵**；" % (
    format(int(PR_MONTH * CHECK_PER_PR_FULL), ","), format(int(fix_min_month), ",")))
print("      增量跑才划算（%s 分钟/月）。判据：**deterministic check 的收益取决于它跑得多贵**。" % format(int(PR_MONTH * CHECK_PER_PR_INCR), ","))
print()
print("三、下沉多深：一次性成本 vs 每月省下的时间")
savings_det_incr = fix_min_month - det_incr_min
savings_arch = fix_min_month - 0
print("   deterministic（增量）：每月省 %s 分钟 -> 一次性 %d 分钟的回本周期 = %.2f 个月（%.1f 天）" % (
    format(int(savings_det_incr), ","), CHECK_ONETIME,
    CHECK_ONETIME / savings_det_incr, CHECK_ONETIME / savings_det_incr * 30))
print("   架构级：每月省 %s 分钟 -> 一次性 %d 分钟的回本周期 = %.2f 个月（%.1f 天）" % (
    format(int(savings_arch), ","), ARCH_ONETIME, ARCH_ONETIME / savings_arch, ARCH_ONETIME / savings_arch * 30))
print()
print("   => 注意：**下沉越深，一次性成本越高、回本反而越慢**（deterministic %.1f 天 vs 架构 %.1f 天）。" % (
    CHECK_ONETIME / savings_det_incr * 30, ARCH_ONETIME / savings_arch * 30))
print("      差别不在回本速度，而在**持续成本**：deterministic 的维护成本随 PR 数线性增长（%s 分钟/月），" % format(int(PR_MONTH * CHECK_PER_PR_INCR), ","))
print("      架构层把整类问题变成不可能犯，**持续成本为 0**。")
print("      判据：**规模小就选 deterministic（回本快），规模大就选架构（不必一直付维护）**。")
print()
print("四、prose 层为什么最弱")
print("   只写进 rules/AGENTS.md：一次性 0 成本，但只有 %.0f%% 的情况真的生效 ->" % (PROSE_EFFECT * 100))
print("   仍有 %s 分钟/月的人工纠正（是三个方案里最贵的持续成本）。" % format(int(prose_min), ","))
print("   笔记里的原话可作佐证：注释/rules 这类 prose **不可强制**（not enforceable），")
print("   而且 agent 会把人的一次纠正「过度旋转」成永不可破的硬规则 -> prose 既会漏，也会过头。")
```

输出：

```text
一、每月同类问题的人工纠正量
   月 11,000 个 PR，每 50 个出现一次同类问题 -> 220 次/月；人工纠正一次 20 分钟 -> 4,400 分钟/月（73.3 小时）

二、三种处置方式的月度成本
处置方式                                          一次性(分钟)             持续(分钟/月)           月总成本(分钟)
只写进 rules/AGENTS.md                                 0                3,520               3520
deterministic check（全量跑）                          120                5,500               5620
deterministic check（增量跑）                          120                1,100               1220
架构级约束（让问题不可能犯）                                    480                    0                480

   => 全量跑 deterministic check 的持续成本（5,500 分钟/月）**比人工纠正（4,400 分钟/月）还贵**；
      增量跑才划算（1,100 分钟/月）。判据：**deterministic check 的收益取决于它跑得多贵**。

三、下沉多深：一次性成本 vs 每月省下的时间
   deterministic（增量）：每月省 3,180 分钟 -> 一次性 120 分钟的回本周期 = 0.04 个月（1.1 天）
   架构级：每月省 4,400 分钟 -> 一次性 480 分钟的回本周期 = 0.11 个月（3.3 天）

   => 注意：**下沉越深，一次性成本越高、回本反而越慢**（deterministic 1.1 天 vs 架构 3.3 天）。
      差别不在回本速度，而在**持续成本**：deterministic 的维护成本随 PR 数线性增长（1,100 分钟/月），
      架构层把整类问题变成不可能犯，**持续成本为 0**。
      判据：**规模小就选 deterministic（回本快），规模大就选架构（不必一直付维护）**。

四、prose 层为什么最弱
   只写进 rules/AGENTS.md：一次性 0 成本，但只有 20% 的情况真的生效 ->
   仍有 3,520 分钟/月的人工纠正（是三个方案里最贵的持续成本）。
   笔记里的原话可作佐证：注释/rules 这类 prose **不可强制**（not enforceable），
   而且 agent 会把人的一次纠正「过度旋转」成永不可破的硬规则 -> prose 既会漏，也会过头。
```

三处结论：

**第一，prose 层是最贵的持续成本。** 月 11,000 个 PR、每 50 个出现一次同类问题 → 220 次/月；人工纠正一次 20 分钟 → **4,400 分钟/月（73.3 小时）**。只写进 rules/AGENTS.md 的话，按 20% 实际生效算，仍要 **3,520 分钟/月**——比另两种方案的持续成本都高。**判据：prose 既会漏（agent 不看），也会过头（把一次纠正过度旋转成永不可破的硬规则）**——这正好对应讲者说的「不可强制」。

**第二，deterministic check 的收益取决于它跑得多贵。** 一次性实施 120 分钟，但持续成本取决于跑法：**全量跑 0.5 分钟/PR → 5,500 分钟/月，比人工纠正的 4,400 还贵**；**增量跑（只对改动文件）0.1 分钟/PR → 1,100 分钟/月**才真正划算。**判据：同一条规则，全量跑可能是负收益，增量跑才是正收益**——很多团队就卡在这里：规则写了，但从没算过它每个 PR 要花多少人力。

**第三，下沉越深，一次性成本越高、回本反而越慢，但持续成本越低。** deterministic（增量）回本 **1.1 天**，架构级约束（一次性 480 分钟、持续成本为 0）回本 **3.3 天**。**判据：规模小就选 deterministic（回本快），规模大就选架构（不必一直付维护）**——架构层的优势不在回本速度，而在于它把整类问题变成「不可能犯」，且维护成本不随 PR 数增长。

## 三、增量二：自主 merge 的前提是覆盖率，不是勇气

```python
import math
"""自主 merge 的前提：约束覆盖率要高于某个阈值。

数字取自我的精读笔记（讲者公开数据：月 11,000 PR、回退率 ~0.5%），
其余为本脚本设定（估）。只依赖标准库；输出确定性。
"""
PR_MONTH = 11000
PR_DAY = PR_MONTH / 30
REVIEWERS = 30              # 可做深度 review 的人数（估）
DEEP_PER_REVIEWER = 6       # 每人每天能深审的 PR 数（估）
REVIEW_MIN = 30             # 一次深审的成本（分钟，估）

capacity = REVIEWERS * DEEP_PER_REVIEWER
print("一、产能与产量")
print("   产量：月 %s PR -> %.0f PR/天" % (format(PR_MONTH, ","), PR_DAY))
print("   深度 review 产能：%d 人 x 每人 %d 个/天 = %d PR/天" % (REVIEWERS, DEEP_PER_REVIEWER, capacity))
print()
print("二、约束覆盖率决定要深审多少")
print("%-14s %18s %20s %18s %16s" % ("覆盖率 k", "需深审(PR/天)", "深审工时(h/天)", "产能够不够", "省下的工时(h/天)"))
for k in (0.50, 0.70, 0.85, 0.95, 1.00):
    need = PR_DAY * (1 - k)
    hours = need * REVIEW_MIN / 60
    ok = "够" if need <= capacity else "**不够**"
    print("%-14s %18.1f %19.1f %19s %15.1f" % ("%.0f%%" % (k * 100), need, hours, ok,
          PR_DAY * k * REVIEW_MIN / 60))
print()
k_min = 1 - capacity / PR_DAY
print("   => **自主 merge 的前提：约束覆盖率 k > %.1f%%**（= 1 - 产能/产量 = 1 - %d/%.0f）。" % (
    k_min * 100, capacity, PR_DAY))
print("      低于这条线，产量就超过了 review 吞吐，多出来的 PR 全部变成待审队列。")
print()
print("三、规则投入的回报：实施成本可忽略，维护成本才是约束")
LAMBDA = 0.12               # 每投入一条规则带来的覆盖率增量（估）
RULE_IMPL_MIN = 90          # 实施一条规则的一次性成本（分钟，估）
RULE_MAINT_MIN = 30         # 每条规则每月的误报排查成本（分钟，估）
MONTH_MIN_PER_DAY = 30      # 每天的分钟数 -> 换算到月
print("   假设投入 n 条规则 -> 覆盖率 k(n) = 1 - exp(-%.2f n)（越往后越难覆盖）" % LAMBDA)
print("%-10s %12s %18s %18s %18s %14s" % ("规则数 n", "覆盖率 k", "月省review(分钟)", "累计实施(分钟)", "月维护(分钟)", "净收益"))
best = None
for n in (0, 5, 10, 20, 40, 60, 80, 120):
    k = 1 - math.exp(-LAMBDA * n)
    saved_month = PR_DAY * k * REVIEW_MIN * MONTH_MIN_PER_DAY   # 覆盖到的那部分才省下 review
    impl = n * RULE_IMPL_MIN
    maint = n * RULE_MAINT_MIN
    net = saved_month - impl - maint
    print("%-10d %11.1f%% %18s %18d %18d %14s" % (
        n, k * 100, format(int(saved_month), ","), impl, maint, format(int(net), ",")))
    if best is None or net > best[1]:
        best = (n, net)
print()
print("   => 净收益最大时规则数 n = %d —— **实施成本（每条 %d 分钟）在 review 节省面前可以忽略**，" % (
    best[0], RULE_IMPL_MIN))
print("      真正的约束是**维护成本**（每条规则每月 %d 分钟的误报排查）。" % RULE_MAINT_MIN)
print("      判据：**规则集的上限由维护成本决定，不是由实施成本决定** ——")
print("      推论：宁可写 60 条稳定、少误报的规则，也别写 300 条互相重叠的规则。")
print()
print("四、覆盖率与深审工时（每 10%% 覆盖率的收益，在线性近似下）")
for k in (0.70, 0.85, 0.95):
    need = PR_DAY * (1 - k)
    hours = need * REVIEW_MIN / 60
    print("   k=%.0f%%：需深审工时 %.1f h/天；再提 10%% 省 %.1f h/天（折 %.1f FTE，8h/人天）" % (
        k * 100, hours, PR_DAY * 0.10 * REVIEW_MIN / 60, PR_DAY * 0.10 * REVIEW_MIN / 60 / 8))
print()
print("   => 在**线性近似**下每 10%% 覆盖率都值 %.1f h/天；而上面那条递减曲线说明真实世界里" % (PR_DAY * 0.10 * REVIEW_MIN / 60))
print("      **越往后的 10% 越贵**（剩下的类别更难覆盖）—— 判据：**先把便宜的类别消灭掉**。")
print()
```

输出：

```text
一、产能与产量
   产量：月 11,000 PR -> 367 PR/天
   深度 review 产能：30 人 x 每人 6 个/天 = 180 PR/天

二、约束覆盖率决定要深审多少
覆盖率 k                   需深审(PR/天)            深审工时(h/天)              产能够不够       省下的工时(h/天)
50%                         183.3                91.7              **不够**            91.7
70%                         110.0                55.0                   够           128.3
85%                          55.0                27.5                   够           155.8
95%                          18.3                 9.2                   够           174.2
100%                          0.0                 0.0                   够           183.3

   => **自主 merge 的前提：约束覆盖率 k > 50.9%**（= 1 - 产能/产量 = 1 - 180/367）。
      低于这条线，产量就超过了 review 吞吐，多出来的 PR 全部变成待审队列。

三、规则投入的回报：实施成本可忽略，维护成本才是约束
   假设投入 n 条规则 -> 覆盖率 k(n) = 1 - exp(-0.12 n)（越往后越难覆盖）
规则数 n             覆盖率 k       月省review(分钟)           累计实施(分钟)            月维护(分钟)            净收益
0                  0.0%                  0                  0                  0              0
5                 45.1%            148,892                450                150        148,292
10                69.9%            230,605                900                300        229,405
20                90.9%            300,063               1800                600        297,663
40                99.2%            327,284               3600               1200        322,484
60                99.9%            329,753               5400               1800        322,553
80               100.0%            329,977               7200               2400        320,377
120              100.0%            329,999              10800               3600        315,599

   => 净收益最大时规则数 n = 60 —— **实施成本（每条 90 分钟）在 review 节省面前可以忽略**，
      真正的约束是**维护成本**（每条规则每月 30 分钟的误报排查）。
      判据：**规则集的上限由维护成本决定，不是由实施成本决定** ——
      推论：宁可写 60 条稳定、少误报的规则，也别写 300 条互相重叠的规则。

四、覆盖率与深审工时（每 10%% 覆盖率的收益，在线性近似下）
   k=70%：需深审工时 55.0 h/天；再提 10% 省 18.3 h/天（折 2.3 FTE，8h/人天）
   k=85%：需深审工时 27.5 h/天；再提 10% 省 18.3 h/天（折 2.3 FTE，8h/人天）
   k=95%：需深审工时 9.2 h/天；再提 10% 省 18.3 h/天（折 2.3 FTE，8h/人天）

   => 在**线性近似**下每 10% 覆盖率都值 18.3 h/天；而上面那条递减曲线说明真实世界里
      **越往后的 10% 越贵**（剩下的类别更难覆盖）—— 判据：**先把便宜的类别消灭掉**。
```

三处结论：

**第一，自主 merge 有一个可算的前提。** 产量 367 PR/天（11,000/月），深度 review 产能 180 PR/天（30 人 × 每人 6 个）→ **约束覆盖率必须 > 50.9%**（= 1 − 产能/产量），低于这条线，多出来的 PR 全部变成待审队列。**判据：讲者说「做到最后没什么可 review 的，就可以让 agent 自主 merge」，这句话的算术版本就是这个阈值。**

**第二，规则集的上限由维护成本决定，不是实施成本。** 按「投入 n 条规则 → 覆盖率 k(n) = 1 − exp(−0.12n)」的递减曲线算：实施成本每条 90 分钟，相对于 review 节省（每 10% 覆盖率 ≈ 18.3 小时/天 ≈ 11,000 分钟/月）**几乎可以忽略**；真正咬人的是**每条规则每月 30 分钟的误报排查**。净收益在 n ≈ 40~60 之间接近峰值（**约 32.2 万分钟/月**），之后因维护成本开始回落。**判据：宁可写 60 条稳定、少误报的规则，也别写 300 条互相重叠的**——而且峰值是平的，**别贪多**。

**第三，覆盖率是阶梯式收益，越往后越贵。** 线性近似下每 10% 覆盖率值 18.3 小时/天（2.3 FTE），但递减曲线说明剩下那 10% 越来越难覆盖。**判据：先把便宜的类别消灭掉**——这正是讲者三个案例的顺序逻辑：ban 一个 API、改一个目录约定，都比写 50 条 lint 规则便宜。

## 四、增量三：回退率是这个交换的止损线

```python
"""自主 merge 的交换率：省下的 review 工时 vs revert 的返工工时，止损线在哪。

数字取自我的精读笔记（讲者公开数据：月 11,000 PR、回退率约 0.5%、227 名贡献者），
其余为本脚本设定（估）。只依赖标准库；输出确定性。
"""
PR_MONTH = 11000
PR_DAY = PR_MONTH / 30
REVERT_RATE = 0.005         # 回退率 0.5%（笔记）
REVERT_HOURS = 4.0          # 每次回退的返工成本（工程师小时，估）
REVIEW_MIN = 30             # 一次深审的成本（分钟，估）

print("一、当前数据（讲者公开的月 11,000 PR、回退率 ~0.5%）")
reverts_day = PR_DAY * REVERT_RATE
print("   回退次数：%.0f PR/天 x %.1f%% = %.2f 次/天 = %.0f 次/月" % (
    PR_DAY, REVERT_RATE * 100, reverts_day, reverts_day * 30))
print("   返工工时：%.2f 次/天 x %.1f 小时 = %.1f 小时/天" % (reverts_day, REVERT_HOURS,
      reverts_day * REVERT_HOURS))
print()
print("二、自主 merge 的交换率：约束覆盖率 x 回退率")
print("%-12s %16s %18s %18s %14s" % ("覆盖率 k", "省下的review(h/天)", "回退返工(h/天)", "净收益(h/天)", "止损回退率"))
rows = []
for k in (0.50, 0.70, 0.85, 0.95):
    saved = PR_DAY * (1 - k) * REVIEW_MIN / 60
    revert_cost = reverts_day * REVERT_HOURS
    net = saved - revert_cost
    r_star = saved / (PR_DAY * REVERT_HOURS)
    rows.append((k, saved, revert_cost, net, r_star))
    print("%-12s %16.1f %18.1f %18.1f %14s" % (
        "%.0f%%" % (k * 100), saved, revert_cost, net, "%.2f%%" % (r_star * 100)))
print()
print("   止损回退率 = 省下的 review 工时 / (PR 数 x 每次回退成本) —— 超过它，交换率转负。")
print()
print("三、两条曲线的交叉：覆盖率越高，能容忍的回退率越低")
print("%-12s %18s %18s" % ("覆盖率 k", "止损回退率", "当前回退率的余量"))
for k, saved, revert_cost, net, r_star in rows:
    margin = (r_star - REVERT_RATE) / REVERT_RATE * 100
    print("%-12s %18s %18s" % ("%.0f%%" % (k * 100), "%.2f%%" % (r_star * 100), "%.0f%%" % margin))
print()
print("   => **覆盖率越高，自主 merge 能容忍的回退率反而越低**（因为能省的 review 本来就少）。")
print("      判据：两条止损线交叉处就是策略分界 —— 覆盖率低时要把回退率压住，")
print("      覆盖率高时反而要盯着回退率的绝对上升。")
print()
print("四、当前数据的安全余量")
k = 0.85
saved = PR_DAY * (1 - k) * REVIEW_MIN / 60
r_star = saved / (PR_DAY * REVERT_HOURS)
print("   取 k=85%%：省 %.1f h/天，止损回退率 %.2f%%，当前 %.2f%% -> 余量 %.1f 倍。" % (
    saved, r_star * 100, REVERT_RATE * 100, r_star / REVERT_RATE))
print("   判据：**回退率是这个交换的止损线**，而且它比多数人以为的近：")
print("         k=85%% 时只要回退率涨到 %.2f%%（约 %.1f 倍），自主 merge 就不再划算。" % (
    r_star * 100, r_star / REVERT_RATE))
```

输出：

```text
一、当前数据（讲者公开的月 11,000 PR、回退率 ~0.5%）
   回退次数：367 PR/天 x 0.5% = 1.83 次/天 = 55 次/月
   返工工时：1.83 次/天 x 4.0 小时 = 7.3 小时/天

二、自主 merge 的交换率：约束覆盖率 x 回退率
覆盖率 k          省下的review(h/天)          回退返工(h/天)           净收益(h/天)          止损回退率
50%                      91.7                7.3               84.3          6.25%
70%                      55.0                7.3               47.7          3.75%
85%                      27.5                7.3               20.2          1.88%
95%                       9.2                7.3                1.8          0.63%

   止损回退率 = 省下的 review 工时 / (PR 数 x 每次回退成本) —— 超过它，交换率转负。

三、两条曲线的交叉：覆盖率越高，能容忍的回退率越低
覆盖率 k                     止损回退率           当前回退率的余量
50%                       6.25%              1150%
70%                       3.75%               650%
85%                       1.88%               275%
95%                       0.63%                25%

   => **覆盖率越高，自主 merge 能容忍的回退率反而越低**（因为能省的 review 本来就少）。
      判据：两条止损线交叉处就是策略分界 —— 覆盖率低时要把回退率压住，
      覆盖率高时反而要盯着回退率的绝对上升。

四、当前数据的安全余量
   取 k=85%：省 27.5 h/天，止损回退率 1.88%，当前 0.50% -> 余量 3.8 倍。
   判据：**回退率是这个交换的止损线**，而且它比多数人以为的近：
         k=85% 时只要回退率涨到 1.88%（约 3.8 倍），自主 merge 就不再划算。
```

三处结论：

**第一，当前数据的量级。** 367 PR/天 × 回退率 0.5% → **1.83 次/天、55 次/月**；按每次回退 4 小时返工算，**7.3 小时/天**。

**第二，止损回退率随覆盖率上升而下降——这是反直觉的一条。** 覆盖率 50% → 止损回退率 6.25%；70% → 3.75%；85% → **1.88%**；95% → **0.63%**。**判据：覆盖率越高，能省的 review 本来就越少，所以能容忍的回退率反而越低**——覆盖率高时不能因为「质量看起来不错」就放松盯回退率。

**第三，当前余量比想象中薄。** 取 k=85%：省下 27.5 小时/天，止损回退率 1.88%，而当前 0.5% → **余量只有 3.8 倍**。**判据：回退率是这个交换的止损线，而且它比多数人以为的近**——k=85% 时只要回退率涨到 1.88%，自主 merge 就不再划算。这条也解释了为什么讲者反复强调「先打地基」：地基越好，同样的覆盖率能换回更多 review 工时，止损线也就越远。

## 五、把三个模型套回本章（判据清单）

1. **月度人工纠正量**：11,000 PR、每 50 个一次 → 220 次/月 → **4,400 分钟/月**（73.3 小时）。
2. **prose 层持续成本最贵**（3,520 分钟/月），因为只有 20% 生效，且不可强制。
3. **deterministic check 全量跑比人工纠正还贵**（5,500 vs 4,400 分钟/月）；**增量跑才划算**（1,100 分钟/月，回本 1.1 天）。
4. **架构级约束持续成本为 0**，一次性 480 分钟、回本 3.3 天 → **规模大选架构**。
5. **自主 merge 的前提：覆盖率 > 50.9%**（= 1 − review 产能/产量）。
6. **规则集上限由维护成本决定**：本模型最优 n ≈ 40~60 条（净收益峰值平坦，**别贪多**）。
7. **覆盖率是阶梯式收益**：每 10% 在线性近似下值 18.3 小时/天，但越往后越贵。
8. **止损回退率随覆盖率下降**：k=85% → 1.88%、k=95% → 0.63%。
9. **当前余量 3.8 倍**（0.5% vs 1.88%）→ 回退率是这套交换的止损线。

## 六、这一章不重复已发的内容

- **harness 该瘦身多少、工具该删到几个**：见《[删掉 90% 的 harness 之后](/blog/deleting-90-percent-of-your-harness/)》（同大会 Philipp Schmid 那场）——本文讲约束分层与覆盖率，不讲 harness 组成。
- **验证流程怎么闭环**：见《[软件工厂的安全验证闭环](/blog/safe-software-factory-verification-loops/)》（同大会 Andrew Finch 那场）——本文只把 verification 当作「中间那层」引用，不重复它的流程设计。
- **Agent 循环与工具设计**：见《[Agent 的三笔账](/blog/agent-tools-steps-reflection-computed/)》——那篇讲单个 agent 的工具/步数/反思，本文讲**多 PR 产出的组织约束**。

## 七、这三个模型判不了什么

- **问题出现频率（每 50 个 PR 一次）、人工纠正 20 分钟、review 人数与吞吐、每次回退 4 小时，全是估的**。其中**纠正成本与 review 吞吐最敏感**：纠正成本翻倍，prose 层的劣势会更大；review 吞吐减半，覆盖率门槛从 50.9% 升到 76%。
- **覆盖率曲线 k(n) = 1 − exp(−0.12n) 是我编的形状假设**，不是实测。「越往后越难覆盖」这个方向大概率成立，但 λ=0.12 意味着「第 60 条规则的边际覆盖增量只有 0.7%」——真实值需要拿自己团队的缺陷分类来拟合。**结论方向可用，具体条数不可引用。**
- **维护成本 30 分钟/规则/月是估的**，而它恰好是决定最优规则数的那个量——**这一项应该用「规则误报率 × 排查耗时」去实测**，比估更靠谱。
- **没有把「verification 的 token 成本」算进去**。讲者提到 70% 的 token 花在 verification 上：若自主 merge 真的省掉 review，省下的是**人的时间**而不是 token；**token 成本反而上升**。所以这套交换在「人的工时」口径上划算、在「token 账单」口径上可能是亏的——两个口径必须分开报。
- **没算 227 名 drive-by 贡献者的影响**。回退率是全体口径，而 drive-by PR 的质量分布可能与核心团队不同；讲者给的数据里没有拆分，本模型也没拆。
- **三个模型都假设「自主 merge 的收益是线性的」**：实际上自动化 merge 会让 PR 数量进一步上升（产量 ↑ → 需要覆盖率 ↑），这是一个正反馈，模型里是固定产量。

## FAQ（八、常见问题）

**一次纠正该写进 AGENTS.md 还是写成 lint 规则？** 看数字：同层问题的人工纠正量是 4,400 分钟/月。只写 prose（20% 生效）→ 仍要 **3,520 分钟/月**；写成 deterministic check 且**增量跑** → 1,100 分钟/月、一次性 120 分钟、**回本 1.1 天**。**判据：默认下沉，别只加一行 prose。**

**但 lint 规则全量跑不划算？** 对。全量跑 0.5 分钟/PR → 5,500 分钟/月，**比人工纠正还贵**；增量跑 0.1 分钟/PR → 1,100 分钟/月。**规则值不值钱取决于它每个 PR 要花多少人力。**

**那什么时候该做架构级约束？** 规模大的时候。架构级一次性 480 分钟、持续成本为 0、回本 3.3 天（比 deterministic 慢，但**不随 PR 数增长**）。**判据：小团队选 deterministic 更快回本，大团队选架构省长期维护。**

**覆盖率要多少才能自主 merge？** **> 50.9%**（本模型：产量 367 PR/天、review 产能 180 PR/天）。低于这条线，多出的 PR 全变成待审队列——**自主 merge 的前提是算术，不是勇气**。

**规则该写多少条？** 本模型最优 **n ≈ 40~60** 条（净收益峰值平坦）。**上限由维护成本决定**：实施成本每条 90 分钟可以忽略，每条每月 30 分钟的误报排查才是约束。**宁可 60 条稳定的，不要 300 条重叠的。**

**回退率涨到多少就不划算了？** 取决于覆盖率：k=50% → 6.25%，k=70% → 3.75%，k=85% → **1.88%**，k=95% → **0.63%**。当前 0.5%，k=85% 时余量 **3.8 倍**。

**为什么覆盖率越高，能容忍的回退率反而越低？** 因为能省下的 review 本来就少了。**判据：覆盖率高的时候更要盯回退率的绝对上升**——「质量看起来不错」正是最危险的阶段。

**这套账省的是 token 吗？** 不是。讲者说 **70% token 花在 verification 上**——自主 merge 省的是**人的 review 时间**，token 账单反而会涨。**两个口径要分开报**，别把「省了人」说成「省了钱」。

## 出处

- 源（我的精读笔记，已按官方稿校对）：`02-课程体系/AIE-Code-Summit-2026/01-软件工厂与反Slop/Lauren Tan - All Code Is Slop (Except Mine).md`。
- 演讲：AIE Code Summit 2026 主舞台《All Code Is Slop (Except Mine)》，讲者 Lauren Tan（SpaceXSI · Principal Engineer），2026-11-11 录屏。
- 大会官方页与演讲列表：[AIE Code Summit 2026](https://ai.engineer/code/2026)；该场官方录播（从 1h10m 起）：[YouTube](https://www.youtube.com/watch?v=ZZ19zhYnDKY&t=4200s)。官方 Day 1 中英对照演讲稿随大会发放；本文按导读式处理，不引用官方译稿原文、不搬附件图。
- 文中引用的团队数据（11,000 PR/月、227 名贡献者、回退率约 0.5%、70% token 用于验证）均为**讲者公开陈述**，标注日期引用，非基准测试。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
