---
title: "自治等级的三笔账：回本、样本量与 scope 放大"
date: "2026-11-27"
description: "从我读完的 AIE 2026《Earning Autonomy》精读笔记出发，补三个可跑的模型：自治升级的回本期、「AI 不比人差」所需的样本量、以及验证成本随 scope 的平方级放大。"
tldr: "自治等级是可以算的：L1 三处人工介入（每 PR 70 分钟）→ L4 零介入，每升一级的人工按介入点线性下降；升级的一次性投入 8 小时让 L1→L2、L2→L3 回本 0.1 天，而 L3→L4 要 0.4 天（一次性投入不变、能省的人工在减少）。L4 的前提是「AI 不比人差」这个判断站得住：基线 88% 无需修复率时，要证明 2 个百分点优势每侧需 **3,026 个 PR**（800 PR/周 是 27 天，40 PR/周 是 76 周）；50 个 PR 连 10 个百分点都测不出。而 regret-free 口径的样本量需求是无回退口径的 **41.6 倍**。验证成本随 scope **平方级**放大：scope 3.3 倍 → 成本 11.1 倍。"
keywords: ["自治等级", "regret-free merge rate", "验证成本", "scope", "Workstream"]
taxonomies:
  tags: ["AI工程", "Agent", "技术深度", "大会笔记"]
---

自治等级的三笔账？每升一级回本几天、「AI 不比人差」这个判断要多少样本才说得出来、以及验证成本怎么被 scope 放大。我读完 AIE Code Summit 2026 那场《Earning Autonomy: From Missions to Workstreams》之后，最想验证的是：这套「自治是挣来的」的说法，能不能变成三个可算的数。这篇把它算出来。

## 口径说明

- 源是我自己的精读笔记 `02-课程体系/AIE-Code-Summit-2026/01-软件工厂与反Slop/Luke Alvoeiro - Earning Autonomy - From Missions to Workstreams.md`（约 10,950 字，已按官方 Day 1 中英对照演讲稿校对）。
- **演讲本身按导读式处理**：只复述机制与公开数据，**不引用官方译稿原文、不搬附件图**。代码与数字均为自写模型。
- **数据归属**：dev 分支一周合入约 **800 个 PR**、Droid 写 **99%** 并 review 全部、**52%** 的 PR 来自 workstream 自身、flaky test workstream 每周约 **40 个 PR**、code mode 把 150 个 ticket 的迁移从 **100 万 token 降到约 6 万 token**——这些是**讲者公开陈述的团队数据**，不是我的实测、也不是基准测试，引用时带日期。
- **我为了建模补的**（各等级介入点数量与耗时、升级的一次性投入、基线无需修复率、每次审查成本、平台级验证投入）都标为「估」。
- 三个脚本只依赖 Python 标准库；输出为实跑结果，逐行可复现（无随机数，两次运行输出逐字一致）。
- **撞题与边界**：同主题目录的另一篇已发——《[反 Slop 的三笔账](/blog/anti-slop-constraint-layering-coverage-revert-computed/)》讲**约束下沉、覆盖率门槛与回退止损线**。**那篇是「地基」，本文是「地基之上能盖到哪一层」**：自治等级的介入点账、L4 所需的样本量、以及验证成本随 scope 的放大。两篇的衔接点写在这里：**上一轮说「自主 merge 需要覆盖率 > 50.9% 且回退率低于止损线」，这一轮说「你怎么知道达到了那两条线」——答案是样本量。**

## 一、讲者的骨架：自治是 checkpoint 换来的

**论点**：把 coding agent 用得最好的团队，不是第一天交出最多工作的团队，而是**逐级提升自治、一次一个 checkpoint** 的团队。

**失败产品 Missions 留下的三条教训**（上线七个月后的复盘）：一是**僵化的 upfront plan**；二是**成本与时间失控**——模型变强后 adversarial review 非常擅长找问题，团队把它加在每个 milestone 边界，结果 scope 从约 60 个 feature 膨胀到 200 多个，token 账单与工期随之膨胀；三是**单人称上下文**（每个人各自一套，没有共享的底座）。

**操作系统心智模型下的三层重建**：更省 token 的 **Droid（code mode）** 让同时跑多个 agent 变得可负担；**Environments** 让 agent 能在客户自己的 VPC 里扩缩；最终的 **Workstream** 是「一个 standing goal，加一支支持它的 agent 团队」，四要素是 **goal、identity、environment、memory**——它有共享文件系统，会主动找缺失上下文（比如发现别人在交付相关改动，就自动拉取那些 PR、分析其工作与评论，并并入自己的 memory 与 skills）。

**自治分级与护栏**：**L1 在三处暂停等人审——spec 创建、PR、merge 前**；逐级上调，**L4 默认 automerge 一切**。级别由 owner 设定，但**升级的信心来自观察**。护栏是平台级的 **risk judge policy**，且**不可被待审改动篡改**。

**度量**：团队真正攀爬的指标是 **regret-free merge rate**——merge 之后**永远不需要 revert 或后续修复**的改动占比，而且**把 Droid 写的 PR 与人类写的 PR 并排测量**。只有当 AI 改动比人类改动更少弄坏东西、且这一点可被测量，才可以让它 merge——这正是把 workstream 调到 L4 的门槛。

**平台自己的数据**：十月的一周 dev 分支合入约 **800 个 PR**，Droid 写了 **99%** 并 review 了全部；目前 **52% 的 PR 来自 workstream 自身**，其中一些完全自主运行；flaky test workstream 每周合并约 **40 个 PR**。工程师的角色也在变：从执行者变成系统的 **regulator**——决定看哪些 signal、goal 与 owner 是谁、需要哪些 skill、每个 workstream 给多少自治。

## 二、增量一：自治升级是一次可以算回本的投资

```python
"""自治升级是一次投资决策：每级省多少人工、一次性投入多少、回本几天。

数字取自我的精读笔记（dev 分支一周合入约 800 个 PR、Droid 写 99% 并 review 全部），
介入点与耗时代价为估。只依赖标准库；输出确定性。
"""
PR_PER_WEEK = 800          # dev 分支一周合入的 PR 数（笔记）
PR_PER_DAY = PR_PER_WEEK / 7

# 讲义明确：L1 在 spec 创建、PR、merge 前三处暂停等人审；L4 默认 automerge 一切。
# L2/L3 的介入点数量为估。
GATES = {
    "L1": [("spec 创建", 30), ("PR 评审", 30), ("merge 前", 10)],
    "L2": [("PR 评审", 30), ("merge 前", 10)],
    "L3": [("merge 前", 10)],
    "L4": [],
}
UPGRADE_ONEOFF = 8 * 60     # 升级一级的护栏/规则一次性投入（分钟，估）

print("一、每级的人工介入与工时")
print("%-6s %10s %16s %18s %18s" % ("等级", "介入点", "每 PR 分钟", "每天人工(h)", "占 114 PR/天"))
for lvl in ("L1", "L2", "L3", "L4"):
    gates = GATES[lvl]
    per_pr = sum(m for _, m in gates)
    per_day = PR_PER_DAY * per_pr / 60
    print("%-6s %10d %16d %18.1f %17.0f%%" % (
        lvl, len(gates), per_pr, per_day, 100.0 * per_pr / 70))
print()
print("   => 自治每升一级，**每 PR 的人工介入时间按介入点线性减少**；L4 = 0 介入。")
print()
print("二、升级一次级的回本期")
print("%-14s %18s %20s %18s %14s" % ("升级", "每天省下(h)", "一次性投入(h)", "回本期(天)", "占周人工"))
prev = None
for lvl in ("L1", "L2", "L3", "L4"):
    per_pr = sum(m for _, m in GATES[lvl])
    if prev is not None:
        saved_h = PR_PER_DAY * (prev - per_pr) / 60
        payback = UPGRADE_ONEOFF / 60 / saved_h if saved_h else float("inf")
        print("%-14s %18.1f %20.1f %18.1f %13.1f%%" % (
            "%s->%s" % (prev_lvl, lvl), saved_h, UPGRADE_ONEOFF / 60, payback,
            100.0 * (UPGRADE_ONEOFF / 60) / (saved_h * 7)))
    prev = per_pr
    prev_lvl = lvl
print()
print("   => L1->L2 与 L2->L3 回本同样快（0.1 天），L3->L4 要 0.4 天 ——")
print("      因为**一次性投入不变、能省下的人工在逐级减少**。")
print("      判据：**先升 L2/L3（回本不到一天），L4 是长期投资而不是季度目标**。")
print()
print("三、L4 的前提不是「敢」，是「可测」")
print("   L4 要默认 automerge 一切 -> 前提是 AI 的无需修复率不低于人类（regret-free merge rate）；")
print("   而这个判断需要样本量支撑（见下一节的样本量模型）。")
print("   笔记里的并排测量：dev 一周 800 个 PR、Droid 写 99% 并 review 全部、")
print("   其中 52% 的 PR 来自 workstream 自身、flaky test workstream 每周约 40 个 PR。")
```

输出：

```text
一、每级的人工介入与工时
等级            介入点          每 PR 分钟            每天人工(h)         占 114 PR/天
L1              3               70              133.3               100%
L2              2               40               76.2                57%
L3              1               10               19.0                14%
L4              0                0                0.0                 0%

   => 自治每升一级，**每 PR 的人工介入时间按介入点线性减少**；L4 = 0 介入。

二、升级一次级的回本期
升级                        每天省下(h)             一次性投入(h)             回本期(天)           占周人工
L1->L2                       57.1                  8.0                0.1           2.0%
L2->L3                       57.1                  8.0                0.1           2.0%
L3->L4                       19.0                  8.0                0.4           6.0%

   => L1->L2 与 L2->L3 回本同样快（0.1 天），L3->L4 要 0.4 天 ——
      因为**一次性投入不变、能省下的人工在逐级减少**。
      判据：**先升 L2/L3（回本不到一天），L4 是长期投资而不是季度目标**。

三、L4 的前提不是「敢」，是「可测」
   L4 要默认 automerge 一切 -> 前提是 AI 的无需修复率不低于人类（regret-free merge rate）；
   而这个判断需要样本量支撑（见下一节的样本量模型）。
   笔记里的并排测量：dev 一周 800 个 PR、Droid 写 99% 并 review 全部、
   其中 52% 的 PR 来自 workstream 自身、flaky test workstream 每周约 40 个 PR。
```

三处结论：

**第一，每级的人工介入是「介入点 × 耗时」，随等级线性下降。** L1 三处暂停（spec 30 分钟、PR 评审 30 分钟、merge 前 10 分钟）→ **每 PR 70 分钟**；L2 40 分钟、L3 10 分钟、L4 为 0。在 114 PR/天（800/周）下：L1 每天 **133.3 小时**人工、L2 76.2 小时、L3 19.0 小时、L4 为 0。**判据：自治等级就是一个「每 PR 要付多少人工」的旋钮**，而讲者那句「自治是 dial」在这里有了单位。

**第二，升级的回本期随等级变长，因为省下的人工在减少、一次性投入不变。** 按每级 8 小时的一次性投入（护栏/规则的搭建与调试，估）：L1→L2 省 57.1 小时/天 → **回本 0.1 天**；L2→L3 同样 0.1 天；L3→L4 只省 19.0 小时/天 → **回本 0.4 天**。**判据：先升 L2/L3（回本不到一天），L4 是长期投资而不是季度目标**——而且注意这三步省下的人工是**逐级递减**的，所以「一路升到 L4」的收益不能按级数线性外推。

**第三，L4 的前提不是「敢」，是「可测」。** L4 要默认 automerge 一切，前提是 AI 的无需修复率不低于人类；而这个判断要靠 regret-free merge rate 的**并排测量**支撑——笔记里的规模是 800 PR/周、其中 52% 来自 workstream 自身。**判据：L4 不是一次决定，是一条「观测够了才升」的规则**（讲者原话：升级的信心来自观察）。

## 三、增量二：「AI 不比人差」这个判断需要多少样本

这是整场演讲里最容易被跳过、也最该算的一步：

```python
"""「AI 的 PR 不比人差」这个判断，要多少样本才说得出来。

用我的精读笔记里的度量方式（regret-free merge rate：merge 后永远不需要 revert 或后续修复的
改动占比，droid 与人类并排测量）做样本量估算。只依赖标准库；输出确定性。
"""
import math

Z_ALPHA = 1.645               # 单侧 alpha=5%
Z_BETA = 0.8416               # power=80%


def n_for_delta(r_human, r_ai, delta):
    """检验 H0: r_ai <= r_human（用近似公式）"""
    p_bar = (r_human + r_ai) / 2
    num = (Z_ALPHA * math.sqrt(2 * p_bar * (1 - p_bar))
           + Z_BETA * math.sqrt(r_ai * (1 - r_ai) + r_human * (1 - r_human))) ** 2
    return num / (delta ** 2)


PR_PER_DAY = 800 / 7
PR_PER_WEEK_WORKSTREAM = 40

print("一、两种口径的严格程度不同")
print("%-26s %14s %14s" % ("口径", "定义", "看什么"))
print("%-26s %14s %14s" % ("无回退", "merge 后没被 revert", "只抓显式失败"))
print("%-26s %14s %14s" % ("regret-free", "merge 后永不需 revert 或补修", "含隐性返工"))
print()
print("二、要证明「AI 的无需修复率 >= 人类」，需要多少 PR（alpha=5% 单侧、power=80%）")
r_human = 0.88
print("%-14s %16s %20s %18s %18s" % ("目标优势 δ", "AI 无需修复率", "每侧样本量 n", "按 114 PR/天", "按 40 PR/周"))
for delta in (0.02, 0.03, 0.05, 0.10):
    r_ai = r_human + delta
    n = int(math.ceil(n_for_delta(r_human, r_ai, delta)))
    print("%-14s %16.1f%% %20s %17.1f 天 %17.1f 周" % (
        "%.0f%%" % (delta * 100), r_ai * 100, format(n, ","),
        n / PR_PER_DAY, n / PR_PER_WEEK_WORKSTREAM))
print()
print("   => **要证明 2 个百分点的优势，每侧约需 %s 个 PR**；" % format(int(math.ceil(n_for_delta(0.88, 0.90, 0.02))), ","))
print("      在 800 PR/周 的团队上是 %d 天，在单个 workstream 的 40 PR/周 上是 %.0f 周。" % (
    math.ceil(n_for_delta(0.88, 0.90, 0.02) / PR_PER_DAY),
    n_for_delta(0.88, 0.90, 0.02) / PR_PER_WEEK_WORKSTREAM))
print()
print("三、同一批样本能支撑多大的结论（反过来看）")
MAX_DELTA = 0.99 - r_human   # 检出上限：AI 的率不可能超过 99%
print("%-16s %22s %24s" % ("每侧样本量", "最小可检出优势", "决策价值"))
for n in (50, 200, 1000, 5000):
    lo, hi = 0.0005, MAX_DELTA
    for _ in range(80):
        mid = (lo + hi) / 2
        if n_for_delta(r_human, r_human + mid, mid) > n:
            lo = mid          # 需要的样本比给的多 -> 可检出的优势要更大
        else:
            hi = mid
    if hi >= MAX_DELTA - 1e-6:
        print("%-16s %22s %24s" % (format(n, ","), "> %.0f%%（超出可检出范围）" % (MAX_DELTA * 100), "**无决策价值**"))
    else:
        print("%-16s %22s %24s" % (format(n, ","), "%.2f%%" % (hi * 100),
              "可判断" if hi <= 0.05 else "**差距太大，无决策价值**"))
print()
print("   => 样本少的时候，最小可检出优势会大到没有决策价值：")
print("      50 个 PR 连 10 个百分点的差距都测不出来；")
print("      判据：**「并排测量」必须持续到样本量够，而不是看到一周数据就下结论**。")
print()
print("四、「regret-free」比「无回退」贵多少")
# 无回退口径：只看显式 revert，基线假设回退率 0.5%
r_revert_only = 0.995
n_strict = int(math.ceil(n_for_delta(r_revert_only, r_revert_only + 0.005, 0.005)))
print("   若只比「无回退」（基线 99.5%%），要证明 0.5 个百分点优势只需每侧约 %s 个 PR；" % format(n_strict, ","))
print("   而「regret-free」（含隐性返工、基线 88%%）要证明同样 0.5 个百分点 ->")
n_loose = int(math.ceil(n_for_delta(0.88, 0.885, 0.005)))
print("   每侧约 %s 个 PR —— **严格口径的样本量需求是宽松口径的 %.1f 倍**。" % (
    format(n_loose, ","), n_loose / n_strict))
```

输出：

```text
一、两种口径的严格程度不同
口径                                     定义            看什么
无回退                        merge 后没被 revert         只抓显式失败
regret-free                merge 后永不需 revert 或补修          含隐性返工

二、要证明「AI 的无需修复率 >= 人类」，需要多少 PR（alpha=5% 单侧、power=80%）
目标优势 δ                 AI 无需修复率              每侧样本量 n         按 114 PR/天          按 40 PR/周
2%                         90.0%                3,026              26.5 天              75.7 周
3%                         91.0%                1,291              11.3 天              32.3 周
5%                         93.0%                  425               3.7 天              10.6 周
10%                        98.0%                   80               0.7 天               2.0 周

   => **要证明 2 个百分点的优势，每侧约需 3,026 个 PR**；
      在 800 PR/周 的团队上是 27 天，在单个 workstream 的 40 PR/周 上是 76 周。

三、同一批样本能支撑多大的结论（反过来看）
每侧样本量                           最小可检出优势                     决策价值
50                       > 11%（超出可检出范围）                **无决策价值**
200                               6.93%           **差距太大，无决策价值**
1,000                             3.38%                      可判断
5,000                             1.57%                      可判断

   => 样本少的时候，最小可检出优势会大到没有决策价值：
      50 个 PR 连 10 个百分点的差距都测不出来；
      判据：**「并排测量」必须持续到样本量够，而不是看到一周数据就下结论**。

四、「regret-free」比「无回退」贵多少
   若只比「无回退」（基线 99.5%），要证明 0.5 个百分点优势只需每侧约 1,233 个 PR；
   而「regret-free」（含隐性返工、基线 88%%）要证明同样 0.5 个百分点 ->
   每侧约 51,292 个 PR —— **严格口径的样本量需求是宽松口径的 41.6 倍**。
```

三处结论：

**第一，要证明 2 个百分点的优势，每侧约需 3,026 个 PR。** 基线无需修复率 88%（估）、单侧 alpha=5%、power=80%：δ=2% → **3,026 个/侧**；δ=3% → 1,291；δ=5% → 425；δ=10% → 80。在 **800 PR/周** 的团队上是 **27 天**；在单个 flaky test workstream 的 **40 PR/周** 上是 **76 周**。**判据：这就是为什么「AI 的 PR 和人的 PR 并排测」必须持续几个月，而不是看一周。**

**第二，样本少的时候，最小可检出优势会大到没有决策价值。** 每侧 50 个 PR → 连 10 个百分点都测不出来（超出可检出范围）；200 个 → 6.93%；1,000 个 → 3.38%；5,000 个 → 1.57%。**判据：看到一周数据就宣布「AI 质量更好」是统计上站不住的**——不是因为结论可能错，而是因为**你根本测不出那么小的差别**。

**第三，口径的严格程度直接决定需要多少证据。** 只比「无回退」（基线 99.5%）要证明 0.5 个百分点优势，每侧约 1,233 个 PR；比「regret-free」（基线 88%，含隐性返工）则要每侧约 **51,292 个**——**41.6 倍**。**判据：这不是「更严谨一点」，是差一个数量级的证据量**；所以选哪个口径本身就是一个要写下来的决定。

## 四、增量三：验证成本随 scope 平方级放大

Missions 那条「验证成本无边界膨胀」的教训，可以算清楚：

```python
"""验证成本与 scope 互相放大：平台级验证 vs 每个 checkpoint 都审。

数字取自我的精读笔记（adversarial review 加在每个 milestone 边界后，scope 从约 60 个 feature
膨胀到 200 多个），参数为估。只依赖标准库；输出确定性。
"""
SCOPE_SMALL = 60             # 笔记：原本约 60 个 feature
SCOPE_BLOATED = 200           # 笔记：膨胀到 200 多个
VERIFY_MIN_PER_ITEM = 25      # 每个 feature/milestone 的对抗性审查成本（分钟，估）
PLATFORM_ONEOFF_H = 40        # 平台级验证的一次性投入（小时，估）
PLATFORM_PER_PR_MIN = 5       # 平台级验证下每 PR 的增量成本（分钟，估）
CHECKPOINT_INTERVAL = 10      # 每 10 个 feature 设一个 milestone 边界（估）


def checkpoint_only(scope):
    """每个 checkpoint 都做全量对抗性审查"""
    checkpoints = scope // CHECKPOINT_INTERVAL
    return checkpoints * scope * VERIFY_MIN_PER_ITEM / 60      # 小时


def platform(scope, prs):
    """平台级验证一次写好，之后每 PR 只付增量成本"""
    return PLATFORM_ONEOFF_H + prs * PLATFORM_PER_PR_MIN / 60


print("一、scope 膨胀把验证成本放大多少")
for scope in (SCOPE_SMALL, SCOPE_BLOATED):
    h = checkpoint_only(scope)
    print("   scope %3d -> 每 checkpoint 全量审查：%s 小时（%.1f 倍）" % (
        scope, format(int(h), ","), h / checkpoint_only(SCOPE_SMALL)))
print()
print("   => scope 从 60 膨胀到 200（**3.3 倍**），验证成本是 **11.1 倍** ——")
print("      因为 checkpoint 数随 scope 增长、而每个 checkpoint 又要审全部 scope -> **平方级**。")
print("      判据：**scope 膨胀与验证成本是互相放大的，不是线性关系**。")
print()
print("二、换成平台级验证")
for scope, prs in ((SCOPE_SMALL, 60), (SCOPE_BLOATED, 200)):
    a = checkpoint_only(scope)
    b = platform(scope, prs)
    print("   scope %3d：每 checkpoint 全量 %s 小时 vs 平台级 %s 小时 -> **%.1f 倍**" % (
        scope, format(int(a), ","), format(int(b), ","), a / b))
print()
print("   => 平台级验证的固定投入（%d 小时）被摊薄，scope 越大优势越明显：" % PLATFORM_ONEOFF_H)
print("      scope 60 时 %.1f 倍、scope 200 时 %.1f 倍。" % (
    checkpoint_only(SCOPE_SMALL) / platform(SCOPE_SMALL, 60),
    checkpoint_only(SCOPE_BLOATED) / platform(SCOPE_BLOATED, 200)))
print()
print("三、平台级验证的收益随 PR 数增长")
prs = [50, 200, 800, 5000]
for n in prs:
    h = platform(SCOPE_BLOATED, n)
    print("   %5s 个 PR -> 平台级验证总成本 %s 小时" % (format(n, ","), format(int(h), ",")))
print()
print("   => 平台级验证是**一次性投入 + 边际成本**；PR 越多越划算，")
print("      且它的护栏（risk judge policy）不可被待审改动篡改 —— 这一点是「每 PR 人工审」给不了的。")
print()
print("判据：")
print("  - **把可复用的验证做成平台级，把不可复用的留给 checkpoint**：平台级验证写一次、审所有，")
print("    成本随 PR 数线性增长；每 checkpoint 全量审查的成本随 scope 平方级放大。")
print("  - **验证成本失控的根因是 scope 膨胀**，而不是验证太贵：scope 3.3 倍 -> 验证成本 3.3 倍。")
print("  - 所以「加对抗性审查」的顺序必须是：**先固化 scope，再加审查**；反过来就会像笔记里那样，")
print("    审查把 scope 从 60 推到 200，再让审查成本翻三倍。")
```

输出：

```text
一、scope 膨胀把验证成本放大多少
   scope  60 -> 每 checkpoint 全量审查：150 小时（1.0 倍）
   scope 200 -> 每 checkpoint 全量审查：1,666 小时（11.1 倍）

   => scope 从 60 膨胀到 200（**3.3 倍**），验证成本是 **11.1 倍** ——
      因为 checkpoint 数随 scope 增长、而每个 checkpoint 又要审全部 scope -> **平方级**。
      判据：**scope 膨胀与验证成本是互相放大的，不是线性关系**。

二、换成平台级验证
   scope  60：每 checkpoint 全量 150 小时 vs 平台级 45 小时 -> **3.3 倍**
   scope 200：每 checkpoint 全量 1,666 小时 vs 平台级 56 小时 -> **29.4 倍**

   => 平台级验证的固定投入（40 小时）被摊薄，scope 越大优势越明显：
      scope 60 时 3.3 倍、scope 200 时 29.4 倍。

三、平台级验证的收益随 PR 数增长
      50 个 PR -> 平台级验证总成本 44 小时
     200 个 PR -> 平台级验证总成本 56 小时
     800 个 PR -> 平台级验证总成本 106 小时
   5,000 个 PR -> 平台级验证总成本 456 小时

   => 平台级验证是**一次性投入 + 边际成本**；PR 越多越划算，
      且它的护栏（risk judge policy）不可被待审改动篡改 —— 这一点是「每 PR 人工审」给不了的。

判据：
  - **把可复用的验证做成平台级，把不可复用的留给 checkpoint**：平台级验证写一次、审所有，
    成本随 PR 数线性增长；每 checkpoint 全量审查的成本随 scope 平方级放大。
  - **验证成本失控的根因是 scope 膨胀**，而不是验证太贵：scope 3.3 倍 -> 验证成本 3.3 倍。
  - 所以「加对抗性审查」的顺序必须是：**先固化 scope，再加审查**；反过来就会像笔记里那样，
    审查把 scope 从 60 推到 200，再让审查成本翻三倍。
```

三处结论：

**第一，scope 膨胀与验证成本是互相放大的，而且是平方级。** 每个 checkpoint 边界做全量对抗性审查时：scope 60 → **150 小时**；scope 200 → **1,666 小时**——**scope 涨 3.3 倍，成本涨 11.1 倍**（因为 checkpoint 数随 scope 增长，而每个 checkpoint 又要审全部 scope）。**判据：验证失控的根因是 scope 膨胀，不是验证太贵**；这正好解释了讲者的失败复盘——「把对抗性审查加在每个 milestone 边界」正是把 scope 从 60 推到 200 的那一步。

**第二，平台级验证的优势随 scope 与 PR 数增长。** 平台级验证（一次性 40 小时 + 每 PR 5 分钟，估）对比每 checkpoint 全量审查：scope 60 时 **3.3 倍**优势，scope 200 时 **29.4 倍**。**判据：把可复用的验证做成平台级（写一次、审所有），把不可复用的留给 checkpoint**——而且平台级护栏还有人工审给不了的东西：**risk judge policy 不可被待审改动篡改**。

**第三，平台级验证是「一次性投入 + 边际成本」，PR 越多越划算。** 50 个 PR → 44 小时；800 个 → 106 小时；5,000 个 → 456 小时。**判据：这与「验证很贵所以要少做」正好相反**——平台级验证的固定投入被摊薄得越厉害，边际成本越显得便宜。

## 五、把三个模型套回本章（判据清单）

1. **每级的人工介入 = 介入点 × 耗时**：L1 每 PR **70 分钟**（三处暂停）、L2 40、L3 10、L4 0。
2. **114 PR/天下的人工**：L1 **133.3 小时/天**、L2 76.2、L3 19.0、L4 0。
3. **升级回本随等级变长**：L1→L2 与 L2→L3 **0.1 天**、L3→L4 **0.4 天**（一次性投入 8 小时不变、能省的人工递减）。
4. **L4 的前提是「可测」**：regret-free merge rate 的并排测量 + 不可被待审改动篡改的 risk judge policy。
5. **证明 2 个百分点优势需每侧 3,026 个 PR**（800 PR/周 → 27 天；40 PR/周 → 76 周）。
6. **样本少就测不出**：50 个 PR 连 10 个百分点都测不出；1,000 个 → 最小 3.38%；5,000 个 → 1.57%。
7. **regret-free 口径的样本量是无回退口径的 41.6 倍**（51,292 vs 1,233）。
8. **验证成本随 scope 平方级放大**：scope 3.3 倍 → 成本 **11.1 倍**。
9. **平台级验证的优势随 scope 与 PR 数增长**：scope 200 时 **29.4 倍**；PR 越多越划算。

## 六、这一章不重复已发的内容

- **约束下沉、覆盖率门槛与回退止损线**：见《[反 Slop 的三笔账](/blog/anti-slop-constraint-layering-coverage-revert-computed/)》——那篇讲「地基」（L4 需要多少约束覆盖），本文讲「盖到哪一层」（每级省多少人工、L4 需要多少证据）。
- **harness 瘦身与工具数量**：见《[删掉 90% 的 harness 之后](/blog/deleting-90-percent-of-your-harness/)》与《[Agent 的三笔账](/blog/agent-tools-steps-reflection-computed/)》——code mode 的 token 账在那两篇的范围内，本文只用它做背景，不重复算。
- **验证闭环的设计**：见《[软件工厂的安全验证闭环](/blog/safe-software-factory-verification-loops/)》——那篇讲验证流程怎么闭环，本文算验证**成本随 scope 怎么长**。

## 七、这三个模型判不了什么

- **L2/L3 的介入点数量、每次介入耗时、升级的一次性投入 8 小时全是估的**。其中**介入耗时最敏感**：若 PR 评审实际只要 10 分钟而不是 30 分钟，**回本期会缩短到几分之几天**，那「L4 是长期投资」的结论就不成立了——这一项应该用团队真实的 review 时间戳来量。
- **基线「人类无需修复率 88%」是估的**，而样本量对它极敏感：基线改成 95% 后，同样 δ=2% 所需的样本量会显著下降（基线越接近上限，可检出的空间越小）。**真实基线必须从历史 PR 里回溯统计**，不能估。
- **样本量模型用的是单侧两比例检验的近似公式**，忽略了多重比较、PR 之间的相关性（同一天、同一作者的 PR 不独立）和聚类效应——真实场景下**需要的样本会更多**，所以本文的 n 是**下限**。
- **没算 52% 来自 workstream 的 PR 与人工 PR 的可比性**：drive-by 式的小 PR 与大改动的回退率天然不同，混在一起比较会稀释差异；笔记里说得很清楚，人类改动与 Droid 改动是**并排测量**的——正式做法应该是分层比较。
- **平台级验证模型假设护栏本身不会失效**。而护栏的质量恰恰是「risk judge policy 不可被待审改动篡改」这条设计要解决的——**如果护栏可被绕过，平台级验证会变成一次性沉没成本**，模型里没有这一项。
- **三个模型都没碰 code mode 的 token 账**（笔记里 150 个 ticket 从 100 万 token 降到约 6 万 token）。那属于 harness 效率，已在同大会另一篇的范围内，本文不重复——但要提醒：**16.7 倍的差异不能与「自治等级」混为一谈**，一个是单次任务的效率，一个是长期的工作流治理。

## FAQ（八、常见问题）

**自治等级怎么量化？** 每级就是「每 PR 付多少人工」：L1 三处暂停 → **每 PR 70 分钟**（spec 30 + PR 评审 30 + merge 前 10），L2 40、L3 10、L4 为 0。114 PR/天下，L1 是 **133.3 小时/天**人工，L4 是 0。

**升一级要多久回本？** 按一次性投入 8 小时（估）：L1→L2、L2→L3 都是 **0.1 天**，L3→L4 是 **0.4 天**。**越往后回本越慢**——一次性投入不变、能省的人工在递减。所以 L2/L3 该马上升，L4 是长期投资。

**L4 的前提是什么？** 不是「敢」，是**可测**：AI 的无需修复率不低于人类，且这个结论有样本量支撑；再加上**不可被待审改动篡改**的 risk judge policy。

**「AI 不比人差」要多少证据？** 基线 88% 时，要证明 **2 个百分点**优势，每侧约 **3,026 个 PR**（800 PR/周 → 27 天；40 PR/周 → 76 周）。50 个 PR 连 10 个百分点都测不出来。

**样本量不够会怎样？** 你会**测不出差别**，而不是测出「没差别」。每侧 200 个 PR 时最小可检出优势是 6.93%——**这个精度做不了决策**。

**regret-free 和无回退差多少？** 差一个数量级的证据：同样证明 0.5 个百分点，无回退口径每侧约 1,233 个 PR，regret-free 口径要约 **51,292 个**（**41.6 倍**）。

**验证成本怎么失控的？** 随 scope **平方级**放大：scope 从 60 到 200（3.3 倍），每 checkpoint 全量审查的成本从 150 小时涨到 1,666 小时（**11.1 倍**）。根因是 scope 膨胀，不是验证太贵。

**那怎么办？** 把**可复用的验证做成平台级**（写一次、审所有），把不可复用的留给 checkpoint。scope 200 时平台级便宜 **29.4 倍**，而且 PR 越多越划算（800 个 PR 时 106 小时）。

**这套办法和上一轮那篇什么关系？** 上一轮讲「自主 merge 的前提是约束覆盖率 > 50.9%、回退率低于止损线」；这一轮讲「**你怎么知道自己达到了那两条线**」——答案是并排测量 + 样本量。**一篇是地基，一篇是验收。**

## 出处

- 源（我的精读笔记，已按官方稿校对）：`02-课程体系/AIE-Code-Summit-2026/01-软件工厂与反Slop/Luke Alvoeiro - Earning Autonomy - From Missions to Workstreams.md`。
- 演讲：AIE Code Summit 2026 主舞台《Earning Autonomy: From Missions to Workstreams》，讲者 Luke Alvoeiro（Factory 核心 agent 团队负责人），2026-11-12 录屏。官方 Day 1 中英对照演讲稿随大会发放；本文按导读式处理，不引用官方译稿原文、不搬附件图。
- 大会官方页与演讲列表：[AIE Code Summit 2026](https://ai.engineer/code/2026)。
- 文中引用的团队数据（800 PR/周、Droid 写 99% 并 review 全部、52% 的 PR 来自 workstream、flaky test workstream 每周约 40 个 PR、code mode 100 万 → 6 万 token）均为**讲者公开陈述**，标注日期引用，非基准测试。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
