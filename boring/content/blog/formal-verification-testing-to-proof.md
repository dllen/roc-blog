---
title: "从测试到证明：形式化验证能证明什么，不能证明什么"
date: 2026-11-15
update_date: 2026-11-15
description: "从第 11 讲的错误传播链走到第 12 讲的形式化验证地图：循环不变式、模型检查、证明助手与 Curry–Howard 对应各自能覆盖什么边界，以及「证了个寂寞」为什么是形式化世界里的 reward hacking。"
tldr: "形式化验证把「检查」做到极致，却把「规格是否忠实于意图」暴露成新的单点故障；证明能力越强，问题越向前移动到意图与规格之间的缝隙。"
keywords: ["形式化验证", "循环不变式", "模型检查", "Curry-Howard 对应", "证明助手", "Hoare 三元组", "规格作弊"]
taxonomies:
  tags: ["软件工程", "软件测试", "形式化验证", "AI Agent"]
---

从测试到证明，这一步跨越比看上去大得多：测试能揭示 bug 的存在，通常却不能证明 bug 不存在——跑过一万个输入，仍然可能漏掉第一万零一个。这是[上一讲](/blog/fault-error-failure-testing/)留下的悬念：如果能不能像证明数学定理一样，证明程序符合规格？

这篇整理自南京大学《生成式软件工程》2026 秋第 12 讲「软件质量保障 (2)」（主讲：jyy），[原始讲义](https://jyywiki.cn/GSE/2026/lect12.md)。讲义给了一张相当完整的地图：循环不变式、状态机与模型检查、TLA+/KLEE/CompCert/seL4 三个切入点、证明助手、Curry–Howard 对应。文中所有代码都在本地实跑过，正文印的输出是真实结果。

## 一、测试背后还是架构：让遗漏变成明确失败

讲义开篇没有直接进入证明，而是先讲了一件更朴素的事：**测试这件事本身，也需要架构。**

场景很具体：让 Agent 为项目添加多个层级的测试。它很容易给出一份「合理」的目录——`tests/` 下建 `unit/`、`module/`、`system/`，再配一个 `justfile` 作为执行入口。这当然可以作为起点。但问题随即出现：**新增一种需要虚拟机的测试时，目录、文档、CI 配置和执行脚本要改几处？如果四处各写一遍测试策略，迟早会出现文档说要跑、CI 却没跑的情况。**

讲义给的替代做法是在 `docs/testing.md` 里维护一张表，让它成为测试策略的唯一事实来源：

| Scope | Level | Runner | Args | Metadata |
|---|---|---|---|---|
| crates/* | unit | cargo-test | --workspace | fast |
| packages/* | unit | bun-test | | fast |
| tests/modules/* | module | script | | isolated |
| tests/system/* | system | qemu-test | | requires-vm |

每一列都有明确职责：Scope 说明规则覆盖哪些目录，Level 是测试层级，Runner 与 Args 描述如何执行，Metadata 记录「运行很快」「需要隔离」「依赖虚拟机」这类属性。这张表同时服务四类读者：人读它、Agent 维护它、执行器解析它生成执行计划、CI 检查它与仓库是否一致。讲义在这里给出一句值得单独记住的话：**机器可读和人类可读，并不一定要分成两份文件。**

真正关键的是**双向核对**。表声明「应该怎样跑」，仓库提供「实际有什么」，两个方向都得查：

| 方向 | 检查内容 | 失守的后果 |
|---|---|---|
| 表 → 仓库 | 表里的路径是否还存在 | 登记表指向空气 |
| 仓库 → 表 | 独立扫描仓库，新测试是否被登记 | **整片没登记的测试悄悄消失，CI 仍然一片绿色** |

我把这个失败模式写成一个能跑的脚本。仓库里有 8 个文件，注册表只登记了三条 scope，于是两个 `tests/system/` 下的测试文件没有任何 scope 覆盖：

```python
registry = {
    "crates/*": "cargo-test",
    "packages/*": "bun-test",
    "tests/modules/*": "script",
    # 注意：tests/system/* 没登记 —— 这正是要暴露的问题
}

repo_files = [
    "crates/core/lib.rs",
    "crates/core/parse_test.rs",        # 落在 crates/* 范围内
    "packages/ui/button.tsx",
    "packages/ui/button.test.tsx",      # 落在 packages/* 范围内
    "tests/modules/billing/charge.ts",
    "tests/modules/billing/charge_test.ts",
    "tests/system/kernel/boot_test.ts",     # 没有 scope 覆盖它
    "tests/system/kernel/driver_test.ts",   # 没有 scope 覆盖它
]

def match_scope(path):
    """把一个仓库路径映射到注册表里的 scope（支持末尾的 * 通配）。"""
    for scope in registry:
        prefix = scope[:-1] if scope.endswith("*") else scope
        if path.startswith(prefix):
            return scope
    return None


uncovered = [f for f in repo_files if match_scope(f) is None]
executed = [f for f in repo_files if match_scope(f) is not None]
skipped = [f for f in repo_files if match_scope(f) is None]
print("静默跳过 =", len(skipped), "个 ->", skipped)
```

```text
静默跳过 = 2 个 -> ['tests/system/kernel/boot_test.ts', 'tests/system/kernel/driver_test.ts']
```

这两行输出就是讲义那个画面的最小复现：**执行器只遍历表中出现的路径，于是整片没登记的测试悄悄消失，CI 依然一片绿色**。没跑的东西不会失败——绿色在这里是「没检查」，不是「检查通过」。把 `tests/system/*` 补进表之后，跳过数归零，遗漏才开始以明确失败的形式浮出水面。

讲义对 Agent 的局限给了一个很准确的诊断：**它擅长补全一种常见组织形式，却未必主动重新设计信息的归属和反馈方式。** 弥补这个缺口的方法论全课程反复出现：不能只说「请更聪明一些」，而要把约束变成它能看到、能检查的对象——要求新增测试必须登记、运行仓库与注册表的一致性检查、让遗漏产生明确失败。收束句是：**人的架构判断由此变成 Agent 可以持续维护的机制。**

## 二、从运行程序，到证明程序

讲义给出的核心问题：**能不能像证明数学定理一样，证明程序符合规格？**

这个愿望几乎与计算机本身一样古老。讲义给了四个坐标：1949 年 Turing 已讨论过如何检查一个程序；1960 年代 McCarthy 提出不仅应该证明程序满足规格，**证明本身也应该交给计算机检查**；1967 年 Floyd 把断言放到控制流上；1969 年 Hoare 给出程序推理的公理化框架。它们共同指向一个大胆的想法：**程序执行有明确规则，因而程序性质也可以成为演绎推理的对象。**

Hoare 三元组把问题写成 `{P} C {Q}`：P 是前置条件，C 是程序，Q 是后置条件。语义是——**从满足 P 的状态开始执行 C，如果执行终止，那么结束状态满足 Q。**

「如果终止」这四个字不能偷偷省略。讲义在这里做了本讲第一个重要区分：

| 概念 | 要求 |
|---|---|
| 部分正确性 (partial correctness) | 程序**结束时**结果正确 |
| 总正确性 (total correctness) | 部分正确性 + **证明它确实会结束** |

配套的反例很直观：**一个永远不返回的排序程序，不能因为从未返回错误结果，就算实现了我们想要的排序功能。**

我把这个区别写成了可执行的对照。程序建模成「一步」函数：返回 `('done', result)` 表示终止并给出结果，返回 `('more', state)` 表示还能继续走一步：

```python
def sort_steps(xs):
    """正确实现：每次做一次相邻交换，有限步后终止并给出有序结果。"""
    y = list(xs)
    for i in range(len(y) - 1):
        if y[i] > y[i + 1]:
            y[i], y[i + 1] = y[i + 1], y[i]
            return ("more", y)
    return ("done", y)


def divergent_steps(xs):
    """发散实现：永远不终止，也永远不给出错误结果。"""
    return ("more", ("stuck", xs))


def observe(step_fn, xs, max_steps=50):
    """跑最多 max_steps 步，返回 (是否终止, 是否观察到错误, 最终值)。"""
    state = xs
    for _ in range(max_steps):
        kind, value = step_fn(state)
        if kind == "done":
            return True, value != sorted(xs), value
        state = value
    return False, False, state          # 没终止，也没观察到错误


def partial_ok(terminated, wrong):
    """部分正确性：若终止，则结果正确。不终止的实现空洞地满足它。"""
    return (not terminated) or (not wrong)


def total_ok(terminated, wrong):
    """总正确性：既要终止，又要结果正确。"""
    return terminated and not wrong


for name, fn in (("正确实现 sort_steps", sort_steps), ("发散实现 divergent_steps", divergent_steps)):
    terminated, wrong, value = observe(fn, [3, 1, 2])
    print("%-28s 终止=%-5s 观察到错误=%-5s 部分正确性=%-5s 总正确性=%-5s"
          % (name, terminated, wrong, partial_ok(terminated, wrong), total_ok(terminated, wrong)))
```

```text
正确实现 sort_steps              终止=True  观察到错误=False 部分正确性=True  总正确性=True
发散实现 divergent_steps         终止=False 观察到错误=False 部分正确性=True  总正确性=False
```

发散实现跑满 50 步，**一次错误结果都没观察到**，部分正确性照样「通过」。这暴露了一个和上一讲同源的问题：**「没观察到错误」有两种来源——真的对，或者根本没跑完——而观察者分不出这两者。** 总正确性多要的那一条「确实会结束」，正是把两者区分开的东西。

讲义对这一节收得很克制，两个限定都值得记住：数组不会越界、指针不会指向非法位置、数据结构始终满足约束，都可以写成数学性质，**但难点在于找到合适的规格和证明，而不是在代码旁边加一句「已验证」**；以及，**这也不意味着存在一个万能算法，可以自动判断任意程序的任意性质**——可判定性的边界从一开始就画在那里。

把整讲的内容排开，其实是在给「反馈的铁面程度」排一个阶梯：每一级都比上一级更难被糊弄，但能覆盖的对象也更窄、成本更高。

```mermaid
flowchart LR
  T["测试<br/>揭示存在，不证不存在"] --> A["断言 / 一致性核对<br/>机器可读的双向检查"]
  A --> M["模型检查<br/>穷举一个模型的全部行为"]
  M --> S["符号执行<br/>一条路径代表一类输入"]
  S --> D["演绎证明 / 证明助手<br/>内核检查，零通融"]
  D --> C["Curry-Howard<br/>证明即程序，检查即类型检查"]
```

## 三、一个不变式，抵过无数次运行

循环可能执行任意多次，怎么用有限篇幅证明它？讲义给的答案是**循环不变式**：一个在循环开始前成立、每次执行循环体后仍然成立的命题。设循环条件为 B、循环体为 C、不变式为 I，证明分三步：

| 步骤 | 证明义务 |
|---|---|
| 初始化 | 初始条件能推出 I |
| 保持 | I ∧ B 成立时执行 C，仍然得到 I |
| 出口 | 退出循环时，**I ∧ ¬B 一起推出目标** |

讲义的总结句：**我们没有逐次枚举所有循环，而是找到了一条能贯穿任意多轮执行的规律。**

案例是 Boyer–Moore 多数投票算法：用一个候选人和一个计数器找出严格过半的选项。

```python
votes = ["A", "A", "B", "A", "C"]

candidate, cnt = None, 0
for vote in votes:
    if cnt == 0:
        candidate = vote
    if vote == candidate:
        cnt += 1
    else:
        cnt -= 1

print("candidate =", candidate, "，cnt =", cnt, "（cnt 不是真实得票数）")
```

```text
candidate = A ，cnt = 1 （cnt 不是真实得票数）
```

它表面上是不可理解的：遇到相同选项就加一，不同就减一，计数归零后换候选人。为什么最后留下的一定是多数？`cnt` 显然不是候选人的真实得票数。

**真正的不变式**是讲义加粗给出的那句：**已经读过的所有票，都可以分成若干对选项不同的票，以及 `cnt` 张全部投给 `candidate` 的剩余票。** 三种情形逐一验证它被保持：初始没有票，命题成立；新票与候选人相同，加入剩余票；新票不同，与一张剩余票配成一对；没有剩余票时，新票自己成为新的候选人。

我把这个断言变成了一个可穷举验证的命题——字母表 {A,B,C}，长度 1 到 7 的全部序列，一个不漏：

```python
from itertools import product


def majority_vote(votes):
    candidate, cnt = None, 0
    for vote in votes:
        if cnt == 0:
            candidate = vote
        if vote == candidate:
            cnt += 1
        else:
            cnt -= 1
    return candidate


def strict_majority(votes):
    """返回严格超过一半的选项，没有则返回 None。"""
    if not votes:
        return None
    for v in set(votes):
        if votes.count(v) * 2 > len(votes):
            return v
    return None


# 讲义给的反例：A, B, C 留下 C，但 C 不是多数
seq = ["A", "B", "C"]
print("A,B,C ->", majority_vote(seq), "| 严格多数 =", strict_majority(seq))

# 穷举：字母表 {A,B,C}，长度 1..7 的全部序列
alphabet = ["A", "B", "C"]
total = 0
majority_cases = 0
violations = []
for n in range(1, 8):
    for seq in product(alphabet, repeat=n):
        total += 1
        maj = strict_majority(list(seq))
        got = majority_vote(list(seq))
        if maj is not None:
            majority_cases += 1
            if got != maj:
                violations.append((seq, maj, got))

print(f"穷举序列总数 = {total}，其中存在严格多数的 = {majority_cases}")
print("反例数量 =", len(violations))
```

```text
A,B,C -> C | 严格多数 = None
穷举序列总数 = 3279，其中存在严格多数的 = 1563
反例数量 = 0
```

3279 条序列、1563 条存在严格多数，**零反例**。讲义给的 `A, B, C` 反例也被复现了：算法留下 C，但 C 不是多数。

讲义随即强调前提的作用：**这里的前提「存在严格多数」很重要。** 没有这个保证，第一遍只能产生候选人，还要第二遍统计它是否真的超过一半。这带来本节最有分量的一句话：

> **证明不仅告诉我们代码为什么正确，还准确指出了它在什么条件下正确。**

最后的成本评估为后半讲埋下伏笔：**这个例子的巧妙之处，是把不断变化的计数器解释成「抵消后的余量」。代码只有几行，找到这个解释却需要理解。** 把同样的工作扩展到复杂指针、内存分配器和整个操作系统，证明成本就很快超过了普通项目能承受的范围。

## 四、Everything is a state machine：模型检查用穷举做证明

手工寻找逻辑证明太难，讲义换一个角度：**程序就是状态机。** 状态包含变量、内存、各线程执行到哪里；执行一步就是从一个状态转移到另一个状态。**编程语言的操作语义正是在描述这样的转移规则。**

对一个**有限**状态模型，可以从初始状态出发，不断加入所有可能的后继，直到不再出现新状态。**如果所有可达状态都满足安全性质，就完成了这个模型上的证明。** 这就是模型检查最直观的出发点：**用穷举证明。**

我把讲义那个并发计数器的例子写成了一个真的 BFS 模型检查器。模型：两个线程各执行一次「原子读 → 加一 → 原子写」；性质：两个线程结束后 `sum == 2`：

```python
from collections import deque
from typing import Tuple

State = Tuple[Tuple[Tuple[int, int], ...], int]   # (各线程 (pc, 局部变量), 全局 sum)


def explore(atomic):
    """BFS 枚举全部可达状态，返回 (前驱表, 第一个坏状态)。"""
    n_threads = 2
    start = (((0, 0),) * n_threads, 0)
    parents = {start: None}
    queue = deque([start])

    while queue:
        state = queue.popleft()
        threads, total = state
        live = [i for i, (pc, _) in enumerate(threads) if pc < 3]
        if not live and total != n_threads:
            return parents, state            # 两个线程都结束了，但 sum 不对
        for tid in live:
            pc, t = threads[tid]
            if atomic:
                # 整个「读 sum; 加一; 写回」是一步
                new_threads = list(threads)
                new_threads[tid] = (3, total + 1)
                nxt = (tuple(new_threads), total + 1)
                action = "原子读改写（sum := sum + 1）"
            elif pc == 0:
                new_threads = list(threads)
                new_threads[tid] = (1, total)
                nxt = (tuple(new_threads), total)
                action = "load sum"
            elif pc == 1:
                new_threads = list(threads)
                new_threads[tid] = (2, t + 1)
                nxt = (tuple(new_threads), total)
                action = "t = t + 1"
            else:
                new_threads = list(threads)
                new_threads[tid] = (3, t)
                nxt = (tuple(new_threads), t)
                action = "store sum"
            if nxt not in parents:
                parents[nxt] = (state, action)
                queue.append(nxt)
    return parents, None


parents, bad = explore(atomic=False)
print("可达状态数 =", len(parents), "，存在坏状态 =", bad is not None)

parents2, bad2 = explore(atomic=True)
print("修复后可达状态数 =", len(parents2), "，存在坏状态 =", bad2 is not None)
```

```text
可达状态数 = 22 ，存在坏状态 = True
修复后可达状态数 = 5 ，存在坏状态 = False
```

讲义描述的那个交错被模型检查器精确复现了：**线程 A 读到 0，线程 B 也读到 0；A 在自己的局部变量中算出 1，B 也算出 1；两者先后把 1 写回。最终结果是 1。** 模型检查器系统地探索这些交错，并给出通向错误状态的轨迹——上面那 7 步的最短执行序列就是它算出来的。

修复方案讲义给了两个：把加一变成一个原子的读改写操作，或用锁保护整个过程。**随后应针对修复后的转移规则重新检查性质。** 上面第二行就是这个「重新检查」：可达状态从 22 个降到 5 个，坏状态消失，所有终止状态的 `sum` 都是 2。

讲义给小模型划定了诚实的边界：**这里的小模型并没有顺带证明任意线程数、任意循环次数下的全部性质，它准确回答的是我们交给它的模型问题。**

那么为什么穷举能算证明，而多跑几次测试不算？讲义的回答是本节理论上最核心的一段：区别在于**是否已经覆盖全部允许行为**。设探索得到的状态集合为 R：R 包含初态；R 对转移封闭——其中任意状态的任意后继仍在 R 中。于是**「所有可达状态都在 R 中」本身就是一个归纳不变式**。只要 R 中没有坏状态，坏状态就不可达。**穷举 = 自动构造出了上一节要人手工寻找的那个不变式。**

麻烦是状态爆炸：多个组件各有一些状态，组合起来的状态数可能成指数增长。讲义指出模型检查的发展很大程度上是在改变「如何表示和搜索这些状态」，并给出三条主线：

| 技术 | 做法 | 局限 |
|---|---|---|
| 符号模型检查 | 用布尔公式、二叉决策图（BDD）等结构表示**一整组状态**，不必逐个存储 | 经典论文标题即宣言：*Symbolic Model Checking: 10²⁰ States and Beyond* |
| 有界模型检查 (BMC) | 把「是否存在至多若干步就出错的执行」编码成 **SAT** | 找到解就得到反例；**但在某个步数界限内无解，还不能自动推广到任意长度** |
| IC3 等 | **让搜索帮助发现证明**：逐步生成归纳引理，排除一批不可能到达的坏状态 | 前面要求程序员费劲想出的 invariant，**也可以成为算法搜索的产物** |

## 五、把证明带进真实软件：三个切入点

讲义在这里转向案例陈列，引导句是：**人类从未放弃过把证明带进真实软件，只是选择了不同的切入点。**

**（1）TLA+：从模型出发。** 以事务提交为例，核心问题可以是：**参与者是否可能出现一个已经提交、另一个已经中止的矛盾结果？** 建模时先描述参与者状态、消息和允许的转移，再检查一致性性质。模型暂时不需要包含网络库怎样分配缓冲区、日志怎样格式化等实现细节，因而有机会把精力集中在协议本身。

但简化模型正确，为什么能说明真实系统正确？讲义给出本节的关键词——**refinement（精化）**：中间需要一座桥，说明具体系统的行为如何对应到抽象模型的行为。一个具体步骤可能对应模型中的一步，也可能只是抽象状态不变的「停顿」；整体上必须保持要证明的关系。讲义给的「停顿」例子很直观：**具体时钟每分钟变化一次，只观察小时数时，大多数步骤就表现为停顿。** 并且再次划清边界：**证明模型并不会自动补上实现与模型之间的这座桥。**

**（2）KLEE：从程序路径出发。** 普通执行给输入一个具体值，**符号执行则把输入保留为符号；遇到分支时，把分支条件加入路径约束**。一个函数按 `x == 0`、`x < 0`、其余情况分别返回 0、-1、1，**所有输入就按执行路径分成零、负数和正数三类。不必分别运行每一个整数，一条符号路径就可以代表一整类输入。**

判定规则是一个干净的 SAT 式提问：设当前路径约束为 PC，希望该路径满足性质 P，就询问求解器 `PC ∧ ¬P` 是否有解。有解，就存在一个沿这条路径执行却**违反性质**的输入（反例）；无解，则在所采用的语义和约束下，这条路径上的输入**不会违反 P**。讲义照例给出限定：**把输入按路径分组，并不意味着所有相似路径都能自动合并；循环、路径数量和外部环境仍然会限制搜索。**

**（3）CompCert 与 seL4：直接证明真实基础软件。** 我核对了两个项目的原始数据，与讲义一致：

| 项目 | 证明内容 | 成本（当时项目范围） |
|---|---|---|
| CompCert | **编译过程保持程序语义**，源码上的性质传递到编译后的程序 | 2009 年论文报告：形式化与证明约 **3 人年、4.2 万行 Coq，其中 76% 是证明** |
| seL4 | **内核 C 实现符合抽象规范** | 首次完成时，设计、文档、实现与验证共约 **25 人年，证明脚本约 20 万行** |

CompCert 的数字来自 [Leroy 的 CACM 2009 论文](https://gallium.inria.fr/~xleroy/publi/compcert-CACM.pdf)原文——「The whole Coq formalization and proof represents 42000 lines... approximately 3 person-years of work... The remaining 76% correspond to the correctness proof itself」。seL4 的数字来自[官方证明统计页](https://trustworthy.systems/projects/OLD/l4.verified/numbers)：全部约 20 万行 Isabelle 证明脚本，手写、机器检查，打印出来约 3500 页 A4。同一页还给出两个讲义没提、但更有说服力的数字：**seL4 内核共 8700 行 C 加 600 行 ARM 汇编，其中验证了 7500 行 C；验证过程中在 C 代码里发现了 160 个 bug，其中 144 个是在 C 验证阶段找到的，只有 16 个是此前测试阶段发现的。** 官方页还提醒这些数字是 2009 年首次完成时的统计，「随着新特性和新证明的加入，这些数字已经变化」——2015 年全部 seL4 证明文件约 50 万行。

为什么值得？讲义的回答是基础设施的杠杆效应：**因为它们是许多软件共同依赖的基础。一个编译错误可能破坏上层费尽力气证明的性质，一个内核错误可能影响整个系统。** 然后是那句很有 jyy 风格的收束：**疯狂的事情还是有人做，而且会被历史记住。**

## 六、证明助手：铁面无私的反馈，以及证明即程序

从这里开始，讲义转向 AI 时代。要理解 AI 为什么可能改变证明的成本，先看 proof assistant。

讲义用课堂经验作对照：**课堂上写数学证明，经常省略「显然」的中间步骤。改卷人可能理解了我们的意思，也可能被一段看起来很像证明的话糊弄过去。** 证明助手把工作台变得十分严格：**一边列出「已知什么」，另一边列出「还要证明什么」，我们只能通过允许的规则改变证明状态。** 讲义的强调句是：**不是敲一句「显然成立」，计算机就会通融。**

四种基本 tactic（讲义注明是**概念伪命令**，不是 Lean 语法）：

| 目标 | 操作 | 讲义的班级化解释 |
|---|---|---|
| ∃x. P(x)（存在一个满分的同学） | `choose A`：选出一个具体同学，再证明 P(A) | **只报名字不够，还得拿出他满分的证据** |
| ∀x. P(x)（所有同学都及格了） | `intro x`：任取一名同学，再证明 P(x) | **「任取」意味着不能偷偷假定他是班里的学霸** |
| P(x) ⇒ Q(x)（保研的同学都及格了） | `intro h`：把 P(x) 加入已知，在假设下证明 Q(x) | 假设成为「已知」清单的一部分 |
| ∀n ∈ ℕ. P(n) | `induction n`：拆成基础情形 P(0) 和归纳步骤 P(n) → P(n+1) | 与上一节的循环不变式同构 |

于是：**证明变成了一连串有明确输入、明确输出、明确合法性条件的操作。** 复杂的证明策略可以替我们搜索步骤，**AI 也可以尝试生成这些操作，但最终构造出的证明对象仍需要被内核检查。**

讲义随后给出 Curry–Howard 对应——**命题对应类型，证明对应这个类型的对象**。我把这条对应写成了一个能跑的最小实现：命题编码成 Python 的 type，证明编码成该类型的一个值；蕴含 = 函数构造，存在 = (见证, 证据) 对，归纳 = 递归：

```python
from typing import Callable, NamedTuple

class P: pass          # 命题 P
class Q: pass          # 命题 Q


def identity(p: P) -> P:          # 对应逻辑里的 P ⇒ P
    return p


class Exists(NamedTuple):
    witness: object
    evidence: Callable[[], bool]


def exists_five() -> Exists:
    """构造 ∃x. (x = 5) 的证明：见证 + 证据缺一不可。"""
    witness = 5
    return Exists(witness=witness, evidence=lambda: witness == 5)


def prove_all(n: int, base, step):
    """∀n∈N. P(n) 的证明，用 base/step 递归构造。"""
    return base if n == 0 else step(n - 1, prove_all(n - 1, base, step))


def base_zero() -> bool:
    return 0 >= 0


def step(k: int, ih: bool) -> bool:
    return ih and (k + 1) >= 0


print("P ⇒ P 的程序形态 =", identity.__name__, "（恒等函数）")
e = exists_five()
print("∃x. (x = 5) 的见证 =", e.witness, "，证据检验 =", e.evidence())
print("归纳证明 ∀n. n >= 0，在 n = 5 时 =", prove_all(5, base_zero, step))

# 终止性是这套对应能成立的前提
import sys
sys.setrecursionlimit(60)


def bad_step(k: int, ih):
    return bad_step(k + 1, ih)          # 永不减小 k → 永不终止


try:
    prove_all(3, base_zero, bad_step)
except RecursionError:
    print("把归纳步骤改成不终止 -> 递归爆栈：对应失效，证明不再是证明")
```

```text
P ⇒ P 的程序形态 = identity （恒等函数）
∃x. (x = 5) 的见证 = 5 ，证据检验 = True
归纳证明 ∀n. n >= 0，在 n = 5 时 = True
把归纳步骤改成不终止 -> 递归爆栈：对应失效，证明不再是证明
```

讲义对这段伪代码给了两个必要的限定：**返回类型依赖输入的 `n`，所以不能把它当成普通 JavaScript**；**递归必须有终止依据**——否则写一个永远调用自己的函数、声称它能返回任意命题的证明，整个对应就失去意义了。**逻辑一致性与程序终止性在这里是同一件事**，呼应了前面「总正确性」对终止的要求。上面最后两行就是这个边界的可执行版本：把归纳步骤改成不终止，同一套骨架立刻产出不了证明。

讲义对 ∃ 的刻画值得单独记：**不仅告诉我们谁满足条件，还提供他满足条件的证明。** 存在性证明 = 把见证和证据装在一起。

由此得到本节的枢纽结论：

> **从这个角度看，很多逻辑操作都变成了「类型体操」：找一个合适的构造，让要求的类型确实有对象。AI 擅长生成和修改程序，证明助手又提供严格反馈，两者自然就接到了一起。**

讲义接着给出一个对本博客读者更贴近的观察——**验证的不对称性**：**它不再只能反复问另一个模型「你觉得我的证明对吗」，而是可以运行检查，看到哪个目标没有完成、哪个类型不匹配，再修改。创造证明很难，检查一个已经写清楚的证明却可能机械得多。** 这正是「生成便宜、验证昂贵」这个不对称性在数学领域的一个实例：**验证器越铁面无私，生成器就越可靠。** 本博客此前写的 [Agent Native 开发：为智能体设计工作环境](/blog/agent-native-development-practices/) 讲的是同一件事在工程流程侧的做法。

## 七、证了个寂寞：形式化世界里的 reward hacking

讲义在这里转成全场最个人化的一段，从老师自己「烂尾的博士论文里留下过一个 conjecture」讲起。重新借助模型推进这个问题之后，讲述它的心情变成了——**「好消息，没有晚节不保；坏消息，连 proof 也开始变成一种 tax。」**

讲义把它接进课程已有的 tax 谱系：storytelling tax（一个想法变成别人能理解的叙述）、engineering tax（变成可以运行的系统）、formalization tax（变成机器可处理的形式表达），以及新增的 **proof tax**——连证明也越来越能够由机器承担。讲义对「tax」的用法做了精确限定：**表达的是对劳动成本变化的冲击感，并不是说证明从此没有价值。**

然后是最尖锐的问题：**怎样防止「证了个寂寞」？** 讲义给出两种典型的规格作弊，我把它写成了可运行的对照：

```python
def transfer_normal(balance, src, dst, amount):
    """正常实现：真的搬钱。"""
    balance[src] -= amount
    balance[dst] += amount
    return balance


def transfer_degenerate(balance, src, dst, amount):
    """退化实现：原地不动。余额非负永远成立，转账却从未发生。"""
    return balance


def check_spec(balance, spec):
    """规格检查器：只检查规格字面要求的行为，不看意图。"""
    if spec == "balance_nonneg":
        return all(v >= 0 for v in balance.values())
    if spec == "transfer_happened":
        # 「转账发生了」这条规格要求收款方余额确实增加
        return balance["bob"] > 50
    raise ValueError(spec)


b1 = transfer_normal({"alice": 100, "bob": 50}, "alice", "bob", 30)
b2 = transfer_degenerate({"alice": 100, "bob": 50}, "alice", "bob", 30)
print("正常实现后 =", b1, "-> 规格「余额非负」通过 =", check_spec(b1, "balance_nonneg"))
print("退化实现后 =", b2, "-> 规格「余额非负」通过 =", check_spec(b2, "balance_nonneg"))
print("但退化实现下规格「转账发生了」通过 =", check_spec(b2, "transfer_happened"),
      "（对照：正常实现 =", check_spec(b1, "transfer_happened"), "）")
```

```text
正常实现后 = {'alice': 70, 'bob': 80} -> 规格「余额非负」通过 = True
退化实现后 = {'alice': 100, 'bob': 50} -> 规格「余额非负」通过 = True
但退化实现下规格「转账发生了」通过 = False （对照：正常实现 = True ）
```

**退化实现**就这样通过了「余额非负」这条规格：所有操作都原地不动，余额确实永远非负，转账却从未发生。**前提走私**更隐蔽——把需要证明的结论偷偷写进前提（「转账后 alice 的余额恰好是 50」），后面的推导再严密，也没有回答原问题。

解法讲义说得很完整：**形式化本身也可以执行、也可以测试。** 具体动作是用熟悉的例子**运行规格**，检查它允许和拒绝哪些行为；给错误实现**构造反例**，看看规格是否真的排除了它；继续**核对抽象模型与真实实现的对应关系**（即前文的 refinement 之桥）。职责划分句是：**证明助手检查的是形式系统内部的推导，人还需要借助这些反馈，确认形式化表达对应了原本的意图。**

这与上一讲讲 Agent「删掉失败断言换取绿色 CI」是同一件事的两种形态：**当优化目标与真实意图之间有一条可被机器发现的捷径时，捷径一定会被发现。** 形式化验证把「检查」做到了极致，却把「规格是否忠实」这个更软的环节暴露成新的单点故障。

讲义还提到产业背景：[Anthropic 与 Theorem 的合作报告](https://www.anthropic.com/research/formal-verification)称，使用模型为一百多个开源软件库在 RISC-V 汇编层面证明了安全性质。这份报告的一个措辞值得记下来：**过去因人力成本过高而难以规模化的工作，正在获得新的实现途径。**

## 八、携带证明的代码，以及没有银弹的未来

**proof-carrying code（携带证明的代码）**：如果证明可以更便宜地构造，软件交付的形态也可能变化——**交付代码时，同时交付它满足某项策略的证明，接收方检查证明，再决定是否接受代码。**

讲义强调这**不是生成式 AI 时代才出现的想法**：1996 年 Necula 和 Lee 的《Safe Kernel Extensions without Run-time Checking》就讨论了用携带证明的方式接纳安全的内核扩展，并获得 OSDI 最佳论文奖。**到本课程的 2026 年，已经过去三十年。**

它的责任分工讲义称为「很清楚」：代码提供者承担**构造证明**的工作，接收者**根据自己的安全策略检查证明**。关键句是：**接收者不必因为「作者值得信任」或「模型看起来很厉害」就接受代码。** 信任的落点从人格信任、统计信任，转向**机械信任**——这是唯一可组合、可审计的一种。

「没有银弹」的部分讲义第五次呼应 Brooks：**形式化的价值，依赖于我们能否用比实现更简洁、独立的方式表达「正确」。** 两类性质形成鲜明对照：「所有数组访问都在合法范围内」特别适合交给验证系统（一条可以反复应用的规则），而「我要一个领导满意的教务系统」根本无从写起——**领导到底怎么想的？** 「我要一个用户满意的折叠屏关闭特效」同样写不出：**可以记录帧率和延迟，却不能直接把它们等同于满意。**

**自动形式化（autoformalization）**要把自然语言意图转成形式表达，但根本困难在于：**有些意图尚未清楚到可以直接翻译，甚至要在体验原型后才逐渐形成。**

于是得到全讲的结构性结论——**问题的前移**：

> **证明能力增强以后，问题会继续向前移动：从实现是否符合规格，移向规格是否符合意图。测试、原型和人的反馈不会因此失去作用，它们也在帮助我们决定究竟该证明什么。**

这一句同时给上一讲的所有内容续了命：**测试不会因证明而失业，它变成了「决定该证明什么」的探索手段。**

讲义最后把问题推到极端：人类，尤其是负责缓慢审慎思考的 System II，也许可以被理解为一个**最终由形式推理系统裁决的过程**；不稳定之处来自把现实转成形式表达时的随机性，以及推理中的错误注入。讲义立刻为这个暴论加了限定——**这是用来挑战直觉的猜想，并非已经得到证明的认知理论或技术预言**——并把全讲浓缩成一个留给读者的问题：**当构造程序、寻找证明都越来越容易时，谁来决定正确的含义，又用什么反馈确认，我们证明的确实是值得证明的事情？**

## FAQ（六、常见问题）

**Q：形式化验证是不是只适合操作系统、编译器这类底层软件？**

A：讲义列的三个切入点正好回答了这个问题：**从模型出发**（TLA+）适合协议与分布式一致性；**从程序路径出发**（KLEE）适合已有代码库，符号执行不必逐个跑输入；**直接证明真实基础软件**（CompCert、seL4）成本最高但杠杆最大——因为它们是许多软件共同依赖的基础。普通的业务逻辑则落回讲义的判断：**形式化的价值，取决于我们能否用比实现更简洁的方式表达「正确」。**

**Q：测试和形式化验证是竞争关系吗？**

A：不是。讲义的结论是**问题前移**：证明能力增强以后，问题从「实现是否符合规格」移向「规格是否符合意图」，而**测试、原型和人的反馈不会因此失去作用，它们在帮助我们决定究竟该证明什么**。上一讲讲的测试方法依然是规格的发现工具。

**Q：证明助手是不是只对数学家有用？**

A：讲义给的理由是验证的不对称性——**创造证明很难，检查一个已经写清楚的证明却可能机械得多**。这对 Agent 尤其关键：**它不再只能反复问另一个模型「你觉得我的证明对吗」，而是可以运行检查，看到哪个目标没有完成、哪个类型不匹配，再修改。**

**Q：怎么判断一篇文章的「证明」是不是在自欺欺人？**

A：讲义给的判据是**规格是否忠实于意图**，两种作弊是退化实现和前提走私。可执行的判别方法是：**给错误实现构造反例，看规格是否真的排除了它**——如果规格放行了一个明显错误的实现，问题出在规格而不是实现。

**Q：模型检查能证明任意程序吗？**

A：不能。讲义划了清楚的边界：模型检查只对**有限状态模型**有效，**它准确回答的是我们交给它的模型问题**，不保证任意线程数、任意循环次数下的全部性质。状态爆炸是它的根本限制；符号模型检查、有界模型检查、IC3 三条路线都是在改变「如何表示和搜索这些状态」。

## 延伸阅读

- [《生成式软件工程》2026 秋第 12 讲：软件质量保障 (2)](https://jyywiki.cn/GSE/2026/lect12.md) —— 本文整理自这一讲（主讲：jyy）
- [上一讲：软件质量保障 (1) — 错误如何传播与暴露](/blog/fault-error-failure-testing/) —— Fault/Error/Failure 与「架构决定质量」
- [Leroy — Formal Verification of a Realistic Compiler (CACM 2009)](https://gallium.inria.fr/~xleroy/publi/compcert-CACM.pdf) —— 4.2 万行 Coq、约 3 人年、76% 是证明
- [seL4 官方证明统计](https://trustworthy.systems/projects/OLD/l4.verified/numbers) —— 20 万行 Isabelle 脚本、约 25 人年、验证阶段找到 144 个 bug
- [Anthropic — LLMs are making formal software verification feasible at a much larger scale](https://www.anthropic.com/research/formal-verification) —— 与 Theorem 合作，为一百多个开源库在 RISC-V 汇编层证明安全性质
- [Necula & Lee — Safe Kernel Extensions without Run-time Checking (OSDI 1996)](https://www.usenix.org/legacy/publications/library/proceedings/osdi96/necula.html) —— proof-carrying code 的起点，距今三十年
- [Lamport — Refinement in State-Based Formalisms](https://lamport.azurewebsites.net/pubs/refinement.pdf) —— 抽象模型与真实系统之间的那座桥
- [KLEE 入门教程：Testing a Function](https://klee-se.org/tutorials/testing-function/) —— 符号执行按路径把输入分成三类
