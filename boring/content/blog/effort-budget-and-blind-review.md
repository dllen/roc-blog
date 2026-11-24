---
title: "算力换智力怎么落地：effort 旋钮、预算与双盲评审"
date: 2026-11-24
update_date: 2026-11-24
description: "GSE 实验二只要求加一个 effort 旋钮，用更多搜索与查证换更好的结果。真正的难点在两处：effort 该花在宽度还是深度，以及谁来判好坏。本文把 effort 拆成宽度×深度的可执行预算，给出边际收益递减的实跑数据，以及双盲评审的最小实现与它判不了的部分。"
tldr: "effort 不是一个数字，是「花在哪」的选择：同样 6400 tokens，可以买 4 次不同方向的求解，也可以买 1 个方向 4 轮复查——后者在浅方向上很快饱和。而「保留更好的版本」这句话能不能兑现，全看评审是否盲、rubric 是否先定。"
keywords: ["effort 旋钮 搜索预算", "双盲评审 Agent", "算力换智力 搜索树", "边界的边际收益"]
taxonomies:
  tags: ["AI Agent", "课程笔记", "工程实践", "GSE"]
---

GSE 2026 的第二个实验叫 Deeper Research，实验要求只有一句话：在现有 Agent 的基础上**加一个 effort 选项**，用更多探索、查证和修改换更好的结果。原文把这件事叫做算力换智力——但**算力换智力怎么落地**，实验其实没讲：它给了骨架，却把两件决定成败的事留给实现者——effort 该花在哪，以及谁来判好坏。这篇把这两件事各写成一个可运行的最小实现，并给出实跑数据。实验本身延续的是上一个实验的个人数据库，所以起点是同一个：你能检索资料、能读写文件的 Agent。

## 一、原文给了骨架，缺口在两处

先把原文的骨架如实复述一遍（下面这段是原文的结构，标注「按环节归类」的部分是我加的分层，不是讲义的说法）：

**两种调用形态。** 最直接的是 `solve(problem)`——方向不可控，可能给出不错的结果，也可能失败或留下不完整的解。带引导的是先写一段自然语言 prompt，再调 `solve(prompt + problem)`，用它把搜索方向掰一下。

**solve state 与 prompt 注入。** 把当前资料、候选答案、未解决的问题视为一个状态，再注入下一段 prompt。原文举的方向都很「虚」，但恰恰能显著改变走向：「找出这个证明中最可疑的一步」「寻找支持相反结论的资料」「换一种算法试试」。原文还特别提醒：提炼 prompt 时关注**论文里写明的可观察策略**（拆解方式、关键假设、验证方法），而不是揣测作者心里怎么想——后者既不可复现也难验证。

**搜索树与终止条件。** 节点是求解状态，边是一次「注入 prompt + 求解」，终止条件是预算耗尽前不断扩展、评估、保留当前最好的候选。原文承认这个思路可以类比 AlphaZero 的搜索，但马上加了一句限定：**开放任务往往没有棋类那样明确的胜负标准，评价本身也是难点**。

**Workspace。** 原文给了一个更轻量的落地形态：维护一个持续更新的目录，保存资料来源、当前答案、review 意见、历史较优版本；每一轮做一次「求解 → 检查 → 按反馈修改」，由 effort 控制最多跑多少轮或花多少 token；预算用完或满足验收条件就停，**新一轮没有改善就保留之前更好的版本**。

**上下文工程。** 原文提醒 Web Search 会把最新、最热门、SEO 最好的资料顶到前面，而真正最重要的那篇可能根本不在前几页；向量数据库也不是银弹，chunk 切分、嵌入维度、reranker 质量都会影响召回。

**评估。** 原文建议挑几个真实会用到的任务，固定输入资料和基础模型，分别跑直接求解、低 effort、高 effort，同时记录结果、耗时和 token 消耗，并且**提前定好评价标准**；对于没有标准答案的报告类任务，隐藏 effort 标签、打乱两份答案的顺序再比较，并且要求评审「指出具体依据」。

读完能看出两处缺口：**第一，effort 被描述成一个旋钮，但它具体能调哪些量，原文没展开**；**第二，「保留更好的版本」的前提是有一个可靠的「更好」，而评价怎么做，原文只给了原则没给做法**。下面两节各补一处。

## 二、effort 不是一个数，是宽度 × 深度

把 effort 落成可执行的预算，最直接的拆法是两个维度：

- **宽度（breadth）**：每轮同时探索几个方向；
- **深度（depth）**：每个方向复查几轮。

同一个预算可以买到完全不同的东西。下面这段是我自写的最小实现（与课程无关）：它用一组固定的「方向质量」和一条边际收益递减的深度收益曲线，把三种 effort 档位跑出来，并算出 token 花费。

```python
import hashlib

# ---------- 1. 引导方向（原文举的 high-level prompt） ----------
DIRECTIONS = {
    "直接求解": 0.55,
    "找出这个证明中最可疑的一步": 0.90,
    "换一种算法试试": 0.72,
}
DEPTH_BONUS = (0.0, 0.030, 0.045, 0.0525)   # 累计收益：每多复查一轮增量递减
TOKENS_PER_SOLVE = 1200    # 确定性 token 消耗，便于核对预算
TOKENS_PER_REVIEW = 400


def review(direction, depth):
    """评审打分：方向质量 + 深度累计收益（模拟 rubric 打分）。"""
    bonus = DEPTH_BONUS[depth - 1] if depth <= len(DEPTH_BONUS) else DEPTH_BONUS[-1]
    return min(DIRECTIONS[direction] + bonus, 1.0)


def run_effort(breadth, depth):
    """effort = 宽度 × 深度。每个方向深挖 depth 次，取最优候选。"""
    best = None
    spent = 0
    solves = 0
    for direction in list(DIRECTIONS)[:breadth]:
        for d in range(1, depth + 1):
            spent += TOKENS_PER_SOLVE + TOKENS_PER_REVIEW
            solves += 1
            score = review(direction, d)
            if best is None or score > best[0]:
                best = (score, direction, d)
    return best, spent, solves


# ---------- 2. 双盲评审：文件名带 hash 不带 label ----------
def blind_files(candidates):
    """candidates: [(label, text)] → {hash 命名的路径: (真实 label, 正文)}"""
    mapping = {}
    for label, text in candidates:
        h = hashlib.sha256(text.encode("utf-8")).hexdigest()[:8]
        mapping["reviews/blind-%s.md" % h] = (label, text)
    return mapping


def judge(files):
    """评审只看内容：数「反例」证据条数，不看标签。"""
    scored = []
    for path, (_label, text) in files.items():
        scored.append((path, text.count("反例")))
    best_path = max(scored, key=lambda x: x[1])[0]
    return best_path, scored


if __name__ == "__main__":
    print("== effort 三档：宽度 × 深度 ==")
    for name, breadth, depth in [("低 effort", 1, 1), ("中 effort", 2, 1), ("高 effort", 2, 2)]:
        best, spent, solves = run_effort(breadth, depth)
        print("  %-9s breadth=%d depth=%d | 最优 %.2f (%s / 复查 %d 轮) | 求解 %d 次 | %d tokens"
              % (name, breadth, depth, best[0], best[1], best[2], solves, spent))

    print("== 同样的方向，不同深度：边际收益递减 ==")
    first = list(DIRECTIONS)[0]
    for depth in (1, 2, 3, 4):
        print("  depth=%d | 分数 %.2f | tokens %d" % (depth, review(first, depth), depth * (TOKENS_PER_SOLVE + TOKENS_PER_REVIEW)))

    print("== 双盲评审：评审看到的只有内容 ==")
    candidates = [
        ("高 effort 稿", "结论成立。附一条反例：边界情形 n=1 时不成立。"),
        ("低 effort 稿", "结论成立，推导过程从略。"),
    ]
    files = blind_files(candidates)
    for path in sorted(files):
        print("  %s" % path)
    best_path, scored = judge(files)
    print("  评审选中:", best_path, "| 逐份计数:", scored)
    real = files[best_path][0]
    print("  揭示标签后：评审选中的是【%s】" % real)
    leaked = any(lbl in text for _lbl, text in files.values()
                 for lbl in ("高 effort 稿", "低 effort 稿"))
    print("  评审读到的正文里出现过 label 吗:", leaked)
```

```text
== effort 三档：宽度 × 深度 ==
  低 effort  breadth=1 depth=1 | 最优 0.55 (直接求解 / 复查 1 轮) | 求解 1 次 | 1600 tokens
  中 effort  breadth=2 depth=1 | 最优 0.90 (找出这个证明中最可疑的一步 / 复查 1 轮) | 求解 2 次 | 3200 tokens
  高 effort  breadth=2 depth=2 | 最优 0.93 (找出这个证明中最可疑的一步 / 复查 2 轮) | 求解 4 次 | 6400 tokens
== 同样的方向，不同深度：边际收益递减 ==
  depth=1 | 分数 0.55 | tokens 1600
  depth=2 | 分数 0.58 | tokens 3200
  depth=3 | 分数 0.60 | tokens 4800
  depth=4 | 分数 0.60 | tokens 6400
== 双盲评审：评审看到的只有内容 ==
  reviews/blind-07a638a6.md
  reviews/blind-3b38e8d7.md
  评审选中: reviews/blind-07a638a6.md | 逐份计数: [('reviews/blind-07a638a6.md', 1), ('reviews/blind-3b38e8d7.md', 0)]
  揭示标签后：评审选中的是【高 effort 稿】
  评审读到的正文里出现过 label 吗: False
```

输出里有三件事值得单独拎出来。

**第一，高 effort（2×2）比中 effort（2×1）多花 3200 tokens，分数只从 0.90 涨到 0.93。** 多花的那 3200 tokens 里，有 1600 是对**已经选中的方向**再复查一轮——而同一方向深挖的收益递减到第二轮就只剩 0.03。这正是原文最后那句反问的可执行版本：同样的预算，是多试几个方向，还是把一个方向做得更深？把它拆成两个旋钮之后，这个反问才第一次能被回答，而不是停在感受层面。

**第二，深度方向的收益递减是可测的，而且很快就见底。** depth 1→2 涨 0.03，2→3 涨 0.015，3→4 几乎不动，但 token 是线性涨的。**这正是「新一轮没有改善就保留之前更好的版本」这条规则存在的理由**：没有这条规则，循环会因为「我确实又查了一轮」而误以为自己在进步，把更差的版本交出去。

**第三，宽度和深度的性价比完全不同，所以「effort」不能是一个滑杆。** 原文说 effort 控制「最多执行多少轮，或者最多花多少 token」——两个都只约束总量，不约束分布。总量相同的情况下，先宽后深、还是先深后宽，结论可能完全不同：先宽是防止方向错，先深是防止证据薄。

## 三、双盲评审：让「更好」这件事别被位置骗了

原文对报告类任务给的建议是：隐藏 effort 标签、打乱两份答案的顺序、再让模型比较，并要求它指出具体依据。这条建议在代码里长什么样，上面 `blind_files` 与 `judge` 就是最小实现：两份候选按内容的 sha256 命名成 `reviews/blind-<hash>.md`，**评审只拿到路径和正文**，标签留在映射表里，等评审给完结论再揭示。

输出最后两行是这个设计要检查的两件事：评审选中的确是「有反例证据」那份（揭示标签后是「高 effort 稿」），而**评审读到的正文里没出现过 label**（False）——也就是说去标签这件事是可验证的，不必靠自觉。

不过这套实现只挡住了**位置偏倚**，挡不住另外三种：

| 偏倚 | 现象 | 这套实现挡得住吗 |
|---|---|---|
| 位置偏倚 | 评审偏爱第一份 / 最后一份 | 挡住（随机化文件名 + 不给顺序） |
| 标签偏倚 | 评审知道哪份是「高 effort 稿」 | 挡住（正文里没有标签） |
| 长度偏倚 | 更长的那份看起来更完整 | **挡不住**——这是 rubric 与评审模型自身偏好问题 |
| 评审自身错误 | 评审模型判错、或者「模型捧模型」 | **挡不住**——原文自己也提醒「关键结论仍要核查」 |

所以配套动作是原文说的「条件允许时重复几次，避免把一次偶然成功当成稳定提升」——注意「重复」的单位是**整轮流程**（重新求解 + 重新评审），不是同一份答案多评几次：同一份答案重复评审只会把评审模型的偏倚重复一遍。

还有一条原文没写但很实际的：**评审要留下可回查的依据**。上面 `judge` 返回的「逐份计数」就是依据的最小形态——它记下了为什么选这份。没有依据的评审结论没法 spot-check，「模型捧模型」就无从发现。

## 四、把「评价」写成可机械检查的验收清单

原文说「提前定好评价标准」，但没给标准长什么样。我的做法是：每条 rubric 都要配一个**可执行的动作**，以及一句**这条判不了什么**。

| rubric 条目 | 可执行动作 | 它判不了什么 |
|---|---|---|
| 事实与引用准确 | 抽取正文里的数字与链接，逐条回一手核对 | 读不出「意思对不对」 |
| 需求完成 | 按需求逐条打勾，缺项列出来 | 不知道这个需求该不该做 |
| 代码通过测试 | 在固定环境跑测试，比对输出 | 测不到的路径 |
| 有反例与边界 | 搜索「反例 / 边界 / 不成立」类表述并人工确认 | 只能发现写了反例的，不会发现漏了的 |
| 结论有证据支撑 | 要求评审给出引用位置，缺证据即不通过 | 证据本身是否支持结论 |

两处要留意。第一，**「隐藏标签 + 打乱顺序」是在防评审偏倚，不是防评审无能**——两份都不合格时，打乱顺序只会让你随机地选中一份不合格的，所以还需要一条「都不合格」的处理路径（原文只提了「指出具体依据」，没说不合格时怎么办）。第二，**rubric 必须先于实现冻结**。原文那句「避免看到结果之后才挑对自己有利的指标」是这里的关键：如果 rubric 是看完结果再定的，那这个循环会自动把「更贵」等同于「更好」，effort 旋钮就变成了烧钱旋钮。

## 五、AlphaZero 类比的边界，以及它替你省不掉的一件事

原文主动做了这个限定：可以类比 AlphaZero 的搜索，但开放任务没有棋类那样明确的胜负标准，评价本身也是难点。我再补一层具体的。

AlphaZero 的搜索能work，靠的是三个前提：**状态可比较**（同一个棋盘局面有确定价值）、**价值可标量化**（一个胜率数字就够选下一步）、**采样足够多**（MCTS 靠成千上万的模拟把不确定性磨平）。开放任务三条都不成立：两份调研报告的价值是多维的（证据强度、覆盖面、可执行性各占一维），压成一个均分就会丢掉维度之间的取舍；而且「多少模拟算够」没有下界。

所以直接套 UCB/UCT 这类选择公式是危险的。我的做法是保留搜索树的**结构**（状态、边、预算），把**选择策略**换成 rubric + 盲评：每个方向用固定的 rubric 打分排序，超过阈值就停止扩展。这样做牺牲了一点「聪明」，换来一个能审计、能复现、也能被人否掉的流程——对一个自用系统来说，这笔交换划算。

顺带说一个和上下文工程连起来的点。原文提醒 Web Search 会把「最新/最热门/SEO 最好」顶到前面，而真正重要的那篇可能不在前几页；提到向量数据库时也点了 chunk 切分与 reranker 质量这两个常见瓶颈。我加一条操作性的：**候选资料的排序应该和「来源排序」解耦**——检索阶段多召回一些（比如 3 倍预算），再让 rubric 对召回结果重排。原文说的「最重要的被淹没」，本质上是召回与排序用了同一个信号。

## 与已发文章的关系

- [会成长的个人助手：五条约束背后的机制](/blog/growing-personal-assistant-lab1/)：上一个实验，同一门课的姊妹篇。Lab1 讲「怎么让助手别胡来」（幂等、保守操作、规则落盘），这篇讲「怎么让它在预算内变强」，两篇共用同一个起点：可检索的资料 + 可落盘的 Workspace。
- [生成式软件工程课程地图](/blog/generative-software-engineering-course-map/)：那张地图里 Lab2 只有一段建模方式的提要，这篇把 effort、评价与双盲三块补出来。
- [Agent token 成本核算](/blog/agent-token-cost-per-task/)：这篇的 effort 旋钮最终要落到「每个任务值多少 token」的账上——宽度与深度的选择，本质是同一笔预算的两种花法。
- [Agent 循环工程](/blog/loop-engineering-agent-loops/)：循环本身的工程约束（终止条件、可观测性、失败恢复），与这篇的「求解 → 检查 → 修改」是同一个骨架的两种场景。

## 出处

- 源笔记：`02-课程体系/jyywiki/生成式软件工程-GSE/2026-逐讲/Lab2-Deeper-Research.md`
- 一手来源：[实验 (2)：Deeper Research](https://jyywiki.cn/GSE/2026/lab2.md)（GSE 2026，2026-11-24 抓取；两种调用形态、solve state、搜索树、Workspace、effort、上下文工程、双盲评估各节已逐条核对一致）
- 延伸链接均已核活：[AlphaZero (arXiv:1712.01815)](https://arxiv.org/abs/1712.01815)、[Humanize: Judgement Engineering for Agentic Coding (arXiv:2610.08900)](https://arxiv.org/abs/2610.08900)
- 本文代码为自写演示（方向质量、深度收益曲线、评审规则均为示例参数），不复刻任何框架；跑法 `python3 effort_loop.py`，输出可逐字节复现。
