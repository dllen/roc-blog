---
title: "生成式软件工程 13 讲地图：演化、品味与三个实验"
date: 2026-11-20
update_date: 2026-11-20
description: "南京大学《生成式软件工程》2026 秋的课程地图：13 讲沿 Intent→Spec→Impl 三道缝隙展开，每讲一句话要点与对应文章；重点补上尚未单独成文的第 10 讲（架构经得起时间、坏易好难、taste-bench）与三个实验（个人数字助手、Deeper Research、蒸馏你自己）。"
tldr: "写代码变便宜之后，稀缺的不是产量，而是把「哪些意图必须固定下来」这件事说清楚；这门课把这件事拆成 13 讲，外加三个必须动手的实验。"
keywords: ["生成式软件工程 课程地图", "软件的演化", "taste-bench", "算力换智力", "Deeper Research"]
taxonomies:
  tags: ["软件工程", "生成式 AI", "课程笔记", "架构"]
---

这门课是南京大学《生成式软件工程》2026 秋季学期开设的课程，课时安排在每周二上午 10:00–12:00，配备课堂直播与视频回放，且每讲均同时提供讲义与幻灯片。讲义与幻灯片目前采用 Creative Commons BY-NC 4.0 协议发布。以下整理自[课程主页](https://jyywiki.cn/GSE/2026/)与各讲讲义，讲义清单为 **2026-11-20 抓取的快照**。

之所以写这篇地图，是因为这门课已经开讲 13 周、积累了 13 讲讲义与三个实验，而多数单篇主题此前已分别成文。一张地图的作用不是复述各讲，而是回答两个问题：**这门课的骨架是什么**，以及**还没被单独写出来的那部分里，哪几讲最值得先读**。

## 一、主线：Intent → Spec → Impl 的三道缝隙

课程反复回到同一个框架：意图（Intent）怎样变成规格（Spec），规格又怎样变成实现（Impl）。生成式 AI 压低的是 Impl 的成本，但真正卡住项目的往往是前两段缝隙。

| 讲次 | 主题 | 这讲在回答什么 | 已有文章 |
|---|---|---|---|
| L1 | 欢迎来到未来 | 作品与能力解耦之后，还该训练什么能力 | — |
| L2 | 提示词与上下文工程 | 模型看到的不只是你输入的那句话 | [上下文工程](/blog/context-engineering-instruction-and-material/) |
| L3 | 版本管理 (1) | Git 的快照模型是从「我想撤销」推出来的 | [从「我想撤销」推导出 Git 的快照模型](/blog/git-snapshot-model-from-undo/) |
| L4 | 版本管理 (2) | 当主要使用者变成会并行复制的 Agent，基本对象该怎么变 | [版本管理该把什么当作基本对象](/blog/version-control-redesign-for-parallel-agents/) |
| L5 | 软件工程的来龙去脉 | 需求分析、流程、契约、建模语言各自解决什么 | [软件工程的来龙去脉](/blog/software-engineering-history-and-its-lessons/) |
| L6–L7 | 需求和架构 | 怎样驾驭复杂性：本质复杂度 vs 附带复杂度 | [意图、规格与实现之间的缺口](/blog/intent-spec-impl-gap/)、[让结论可解释](/blog/event-sourcing-and-explainable-conclusions/) |
| L8 | Agent Native 开发 | 从能跑的原型开始，把 Agent 当真正的开发者设计环境 | [Agent Native 开发](/blog/agent-native-development-practices/) |
| L9 | DeepSeek Harness | 一个小 Agent 循环如何长成能承载扩展生态的系统 | [DeepSeek Harness](/blog/deepseek-harness-agent-runtime/) |
| L10 | 软件的演化 | 架构要经得起时间；坏易好难；品味能否被测量 | **本文重点** |
| L11 | 软件质量保障 (1) | Fault / Error / Failure 三分与两条箭头 | [软件质量保障：错误如何传播与暴露](/blog/fault-error-failure-testing/) |
| L12 | 软件质量保障 (2) | 从测试到形式化证明的强度阶梯 | [从测试到证明](/blog/formal-verification-testing-to-proof/) |
| L13 | 软件分析工具 | 分析工具怎样进入开发回路（主页已放出讲义，本文未展开） | — |

L5 讲里还有一个常被单独引用的部分：带着「哪些意图必须明确固定下来，哪些选择可以留白」去重读 UML 规范，详见 [UML 建模五问](/blog/uml-design-questions-modeling-practice/)。

## 二、第 10 讲：软件的演化

这一讲给 DeepSeek Harness 加上时间维度：今天看到的架构、规则和测试，是怎样一步一步形成的。它有三块内容值得单独记住。

### 架构要经得起时间，而不是提前猜中一切

每个提前设计的扩展点都暗含一个预测——「未来会沿这个方向变化」。预测错了，扩展机制本身就变成维护负担。讲义给了三个演化案例：

- **Linux CFS**：CFS 在 Linux 2.6.23 进入内核，替代此前的 O(1) 调度器。算法会被淘汰，但把不同调度策略放到各自边界之后的**责任划分**留了下来——局部重构可以成为整理职责的机会。
- **Python 2 → 3**：有意打破向后兼容，重整了文本与二进制数据等语义。但依赖旧行为的程序不会自动迁移，库与应用需要彼此等待。Python 2 原定 2015 年停止支持，后来延长到 2020 年，原因之一正是大量用户尚未完成迁移。**架构变更的成本必须把所有依赖旧行为的代码算进去，而不是只看解释器内部改了多少行。**
- **Kubernetes**：核心轻、生态重。核心的想法很短——描述期望状态，控制器反复观察实际并采取动作让两者趋同。边界也要持续调整：Kubernetes 1.24 移除了内置 dockershim，把与 Docker Engine 的适配移到核心之外。

判断架构好坏因此有个朴素问题：**需求改了一处，系统里要跟着改多少处？**

### 从理解一个版本，到理解版本之间的迁移

软件仍然可以用状态机理解：某个版本是一个状态，修 bug、加 feature、重构都是状态迁移动作。而学习软件时人们常从简化版本入手（研究 Linux 可以从 0.11 看起；学大模型系统可以用 nano-gpt 这类精简实现）——真实项目里的例外、兼容层与特殊处理，要从版本历史里找由来。

顺着这条线，讲义提出了一个当下的问题：当通过测试越来越容易，我们需要怎样的新评测？它给出的候选是 **taste-bench**——两份实现都能通过测试，哪份更贴合问题、更容易理解、给下一次修改留下的负担更少？这不容易压成一个 Yes/No 或总分，做法是**先在同一需求下做多维度的相对比较，再加入后续需求，看原来的优劣是否反转**。

这一点可以直接写成可执行的判据。下面这段代码把「两份候选实现 + 逐条加入的需求」写成一次相对比较，最后看排名有没有翻转：

```python
def build_candidates():
    return {
        "A 硬编码表驱动": {"R1 可读性": 5, "R2 可扩展性": 2},
        "B 配置驱动加插件": {"R1 可读性": 3, "R2 可扩展性": 5},
    }


def winner(scores, requirements):
    return max(
        sorted(scores),
        key=lambda name: (sum(scores[name][r] for r in requirements), name),
    )


def main():
    candidates = build_candidates()
    requirements = ["R1 可读性", "R2 可扩展性"]

    print("候选与各需求下的评分：")
    for name in sorted(candidates):
        row = candidates[name]
        print("  " + name + ": " + "  ".join(
            "{}={}".format(r, row[r]) for r in requirements))
    print()

    seen = []
    for req in requirements:
        seen.append(req)
        print("只看 {}：最优候选 = {}".format(
            "+".join(seen), winner(candidates, seen)))

    only_first = winner(candidates, requirements[:1])
    both = winner(candidates, requirements)
    print()
    print("仅 R1 最优 = {} ；R1+R2 最优 = {} ；排名反转 = {}".format(
        only_first, both, only_first != both))


if __name__ == "__main__":
    main()
```

```text
候选与各需求下的评分：
  A 硬编码表驱动: R1 可读性=5  R2 可扩展性=2
  B 配置驱动加插件: R1 可读性=3  R2 可扩展性=5

只看 R1 可读性：最优候选 = A 硬编码表驱动
只看 R1 可读性+R2 可扩展性：最优候选 = B 配置驱动加插件

仅 R1 最优 = A 硬编码表驱动 ；R1+R2 最优 = B 配置驱动加插件 ；排名反转 = True
```

这段代码没有实现真正的 taste-bench（真实评测要跨实现、跨需求、跨评审者），它只固定一件事：**「好」的判据必须允许在加入后续需求后翻转**。任何把品味压成单一分数的排行榜，都做不到这一点——讲义说得很直接，软件的「好」本来就包含它将来怎样继续变化。

### 排除了坏答案，还没有学会什么是好

表达「坏」通常比表达「好」容易。反例引导的归纳合成（CEGIS）给了一个理解这种失败的角度：提出候选、找反例、把反例加入约束、再提新候选——约束不断增加，形式上这个过程只能收缩解空间，无法表达「好」。讲义的极端例子是在无界整数里找 k，使所有 x 都满足 x ≠ k：它总能通过此前积累的有限反例，却永远完成不了目标，因为目标本来就无解。

更常见的困境不是答案不存在，而是我们困在错误的表达方式里。「番茄炒蛋（不放蒜版）」是讲义给的比喻：用户纠正「不要放蒜」，本意可能只是让模型自然地给出合适做法；模型却把这次纠正变成标题里最显眼的内容，接着纠正香菜、韭菜、辣椒，成品越来越奇怪——**出现在上下文中的词被突出强调，而无数同样不该出现、却从未被提到的词没有得到同等对待**。

讲义给出的出路是「设计空间的跳跃」：与其一直要求「把这份答案改好一点」，不如重新考虑读者要做什么决定、真正需要哪些信息，是否应当换一种组织方式。局部反馈未必包含逃出当前陷阱的线索。

## 三、三个实验：把「好」变成可交付的东西

三个实验都建议性质、不记分。它们的存在本身是个信号：讲义认为这门课的能力**必须靠动手获得**，而不是听懂就算。

| 实验 | 随哪讲发布 | 核心要求 |
|---|---|---|
| Lab1 个人数字助手 | L3 | 个人数据库 + 持续关联邮箱 + 办理 ehall 事务 + 手机端联动 + 能力组合 |
| Lab2 Deeper Research | L7 | 把问题求解建模为搜索，用「算力换智力」 |
| Lab3 蒸馏你自己 | L13 | 用自己的邮件材料让模型学会自己的判断与表达 |

**Lab1** 的元要求比功能列表更重要：把成功流程和你的纠正保存成可阅读、可修改的脚本、技能或记忆，**并用 Git 管理实现和规则**——你指出「不要把报名截止时间当成活动开始时间」，助手应该能在新会话里把这条规则用到另一份通知上。这就是 L3–L4 讲的版本管理在个人项目上的落点。

**Lab2** 的建模方式最值得学：不给 Agent 一个 `solve(problem)`，而是先生成引导方向的 Prompt，再 `solve(prompt + problem)`。把当前资料、候选答案、未解决问题视为求解状态，注入下一段 Prompt——「找出这个证明中最可疑的一步」「寻找支持相反结论的资料」「换一种算法试试」。从同一状态尝试不同方向就得到一棵搜索树：节点是求解状态，边是一次引导尝试；预算耗尽前不断扩展、评估、保留最好候选。它类比 AlphaZero 的搜索，但开放任务没有棋类那样明确的胜负标准，**评价本身也是难点**。

预算语义在这里有个容易搞混的地方：预算耗尽只说明「这次没找到」，不等于「不存在证明」。下面用一个最小模型把这件事显式化：

```python
GRAPH = {
    "S0 待证明命题": {"直接归纳": "S1 归纳步不成立", "先造反例": "S2 反例指向归纳变量"},
    "S1 归纳步不成立": {},
    "S2 反例指向归纳变量": {"换归纳变量": "S3 证明成立"},
    "S3 证明成立": {},
}
GOAL = {"S3 证明成立"}


def search(budget, guides):
    frontier = ["S0 待证明命题"]
    visited = []
    while frontier and len(visited) < budget:
        state = frontier.pop(0)
        visited.append(state)
        if state in GOAL:
            return state, visited
        for guide, nxt in GRAPH.get(state, {}).items():
            if guide in guides and nxt not in frontier:
                frontier.append(nxt)
    return None, visited


def main():
    print("== 只给一种引导，预算 1 ==")
    found, visited = search(1, ["直接归纳"])
    for s in visited:
        print("  访问：{}".format(s))
    print("  结果：{}".format("找到" if found else "未找到证明"))

    print()
    print("== 给足引导与预算 ==")
    found, visited = search(4, ["直接归纳", "先造反例", "换归纳变量"])
    for s in visited:
        print("  访问：{}".format(s))
    print("  结果：{}".format("找到" if found else "未找到证明"))

    print()
    print("预算耗尽只说明「这次没找到」，不等于「不存在证明」。")


if __name__ == "__main__":
    main()
```

```text
== 只给一种引导，预算 1 ==
  访问：S0 待证明命题
  结果：未找到证明

== 给足引导与预算 ==
  访问：S0 待证明命题
  访问：S1 归纳步不成立
  访问：S2 反例指向归纳变量
  访问：S3 证明成立
  结果：找到

预算耗尽只说明「这次没找到」，不等于「不存在证明」。
```

两次搜索的区别不在算法，而在**给了几种引导**和**给了多少预算**：同一条证明路径，第一种配置根本没走到能产生反例的那一步。讲义把求解状态、引导 Prompt、搜索树、评价函数四件事分开说，正是因为它们是可以分别调的资源——也意味着预算应该花在能改变搜索方向的引导上，而不是平均撒在重复尝试里。

**Lab3 蒸馏你自己** 在主页上刚放出（第 13 讲随附）。它对应第 10 讲末尾那节「『蒸馏我自己』为何还没有成功」：让模型从自己的邮件里不断增补 guideline、生成回复、再评价是否更像本人，循环下去，讲义记录的结果是**没有收敛**。原因推测是邮件保存了「最后怎么说」，未必保存了「为什么这样说」，也没保留那些被放弃的选项——只模仿表面形式会丢掉决定形式的条件。这个实验目前更像是暴露问题，而不是提供一个已经奏效的方法。

## 四、按目标选路径

如果你的时间有限，不必按讲次顺序读：

| 你的处境 | 先读 |
|---|---|
| 团队在用 AI 写代码，但需求说不清 | [意图、规格与实现之间的缺口](/blog/intent-spec-impl-gap/) |
| 想知道提示词为什么不管用 | [上下文工程](/blog/context-engineering-instruction-and-material/) |
| 要让多个 Agent 并行改同一个仓库 | [版本管理该把什么当作基本对象](/blog/version-control-redesign-for-parallel-agents/) |
| 要给 Agent 搭工作环境与门禁 | [Agent Native 开发](/blog/agent-native-development-practices/) |
| 想知道「架构要不要提前设计扩展点」 | 本文第三节；[让结论可解释](/blog/event-sourcing-and-explainable-conclusions/) |
| 要给质量保障排路线 | [错误如何传播与暴露](/blog/fault-error-failure-testing/)、[从测试到证明](/blog/formal-verification-testing-to-proof/) |
| 想要一条能长期跑的个人项目路线 | Lab1 + Lab2（本文第四节） |

## 五、这份地图不解决什么

- **它不是课程内容的替代品**。讲义每讲都有完整推导与幻灯片，地图只给骨架与路径。
- **第 13 讲「软件分析工具」本文未展开**，只标出位置。
- **讲义仍在生长**。主页快照（2026-11-20）为 13 讲 + 3 实验，主页还列出了尚未放出讲义的「部署和运维」「软件安全」「开源软件生态」「Guest Lecture」「总结」；下周再看，数字会变。
- **两个实验脚本是示意模型**，不是可用的评测框架。真正的 taste-bench 要跨实现、跨需求、跨评审者做相对比较；搜索示例只演示预算与引导的关系。

## 来源与许可

- 课程主页：<https://jyywiki.cn/GSE/2026/>（讲义清单与许可：CC BY-NC 4.0，苏 ICP 备 2020049101 号）
- 讲义：lect1–lect13、lab1–lab3，均为 [jyywiki.cn/GSE/2026/](https://jyywiki.cn/GSE/2026/) 下文件
- 课堂直播：<https://live.bilibili.com/21816941>；视频回放：<https://space.bilibili.com/202224425/lists?sid=8942017>
- 本文的两段 Python 代码为自写，用于固定讲义中的两个判断（排名可反转、预算语义），与讲义原文无对应实现。
