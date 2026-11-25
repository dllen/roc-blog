---
title: "第 13 讲：软件分析工具买了什么、漏了什么"
date: 2026-11-25
description: "《生成式软件工程》第 13 讲把软件分析工具分成「数学对象」与「概率采样」两个视角，逐一点出每种工具保留了什么、忘掉了什么。本文用三段可运行代码把讲义里三处定性断言变成可机械检查的规则：判定器为什么必然出错、十种工具在同一组缺陷样本上各自买到什么、informal verification 回路报出的到底是哪一种证据。"
tldr: "工具的绿色对勾不是「没问题」的证明，而是一份有边界的购买清单：判定器必然错、差分测试会被共享错误骗过、静态分析只能回答 unknown；而 informal verification 回路报出的是「这个维度承重」，不是「这一行写反了」。"
keywords: ["软件分析工具", "Rice 定理", "informal verification", "差分测试", "生成式软件工程"]
taxonomies:
  tags: ["软件工程", "生成式 AI", "课程笔记", "静态分析"]
---

上一讲以「问题前移」收尾：证明变便宜之后，问题从「实现是否符合规格」移向「规格是否符合意图」。《生成式软件工程》第 13 讲把镜头拉远到工具本身，问一个更朴素的问题——**看到工具给出的绿色对勾，它究竟买到了什么？**

讲义用两个对偶的视角回答：前半把程序当作数学对象，靠执行语义与性质判定；后半把程序当作人类活动采样出的样本，因此第一次有可能检查那些「很难写成规则、但人知道不对」的东西。视角是讲义的；这篇想做的是把其中三处定性断言变成能跑的检查器，并如实报告它们抓到了什么、漏了什么。

## 一、为什么不存在「验证一切程序」的算法

讲义给出的理论边界是 Rice 定理：对一般程序，不存在一个既能终止又能正确判定任意非平凡语义性质的万能方法（非平凡指该性质既非对所有程序成立，也非对所有程序都不成立）。配套的例子只有几行——枚举所有正整数四元组，一旦找到 `a**n + b**n == c**n`（n>2）就中止；「它永远不会中止」恰好对应费马大定理。

这段代码可以真的跑起来，但它暴露的是两种跑法的差别。下面第一段是有界枚举，第二段是把同一问题放进一个有限的程序族里，穷举所有可能的判定器：

```python
"""Rice 边界的工程版本：判定器为什么会错，以及「做取舍」能把错误降到什么程度。

1. 讲义给的费马程序，跑有界版本
2. 有限程序族上穷举：完美判定器有且仅有 1 个，其余候选判定器至少错 1 个程序
3. 限制程序族后，某个性质变成平凡、可判定 —— 这就是讲义的工程回答
"""

# ---- 1. 讲义给的费马程序，跑有界版本 ----
def fermat_search(max_val=12):
    """讲义程序的有界版本：枚举正整数四元组，找 a^n + b^n == c^n (n>2)。"""
    hits = []
    for n in range(3, 5):
        for a in range(1, max_val + 1):
            for b in range(1, max_val + 1):
                for c in range(1, max_val + 1):
                    if a ** n + b ** n == c ** n:
                        hits.append((a, b, c, n))
    return hits


hits = fermat_search()
print("[1] 有界枚举 a,b,c <= 12, n in {3,4}: 找到反例", len(hits), "个 ->", hits if hits else "无")
print("    这说明的是「在这个范围内没找到」，不是「不存在」——讲义要的判定器要覆盖所有四元组")


# ---- 2. 有限程序族上穷举判定器 ----
N_INPUTS = 2
N_PROGRAMS = 2 ** (2 ** N_INPUTS)      # 布尔函数 {0,1}^2 -> {0,1}，共 16 个
ZERO_INPUT = 0


def program_outputs(prog, x):
    """prog 是 2^N_INPUTS 位的真值表，第 x 位是输入 x 时的输出。"""
    return (prog >> x) & 1


def P(prog):
    """性质 P：程序在「全 0 输入」上输出 True（非平凡：有的程序满足，有的不满足）。"""
    return program_outputs(prog, ZERO_INPUT) == 1


def wrong_program(decider_mask):
    """返回该判定器第一个判错的程序编号；全对则 None。"""
    for prog in range(N_PROGRAMS):
        if ((decider_mask >> prog) & 1) != int(P(prog)):
            return prog
    return None


total_deciders = 0
perfect = 0
first_bad = None
for mask in range(2 ** N_PROGRAMS):
    total_deciders += 1
    w = wrong_program(mask)
    if w is None:
        perfect += 1
    else:
        if first_bad is None:
            first_bad = (mask, w)
print("[2] 程序族 = %d 个布尔函数（2 个输入），候选判定器 = %d 个" % (N_PROGRAMS, total_deciders))
print("    完美判定器个数 =", perfect, "（就是性质本身）；其余", total_deciders - perfect, "个至少错 1 个程序")
print("    抽查：mask=%d 在程序 %d 上判错（该程序实际满足 P = %s）" % (first_bad[0], first_bad[1], bool(P(first_bad[1]))))


# ---- 3. 限制程序族：性质变成平凡、可判定 ----
def restricted_family():
    """只保留 f(x) = (x+1) mod 2 这一族。"""
    return [p for p in range(N_PROGRAMS)
            if all(program_outputs(p, x) == (x + 1) % 2 for x in range(N_INPUTS))]


fam = restricted_family()
vals = sorted(set(int(P(p)) for p in fam))
print("[3] 限制程序族后（只保留 f(x) = (x+1) mod 2）：族内程序数 =", len(fam))
print("    性质 P 在受限族上的取值集合 =", vals, "-> 非平凡性质在受限族上变成平凡，可判定")
print("    -> 讲义的工程回答：限制程序/性质/输入，把「不可判定」换成「可判定但更窄」")
```

```text
[1] 有界枚举 a,b,c <= 12, n in {3,4}: 找到反例 0 个 -> 无
    这说明的是「在这个范围内没找到」，不是「不存在」——讲义要的判定器要覆盖所有四元组
[2] 程序族 = 16 个布尔函数（2 个输入），候选判定器 = 65536 个
    完美判定器个数 = 1 （就是性质本身）；其余 65535 个至少错 1 个程序
    抽查：mask=0 在程序 1 上判错（该程序实际满足 P = True）
[3] 限制程序族后（只保留 f(x) = (x+1) mod 2）：族内程序数 = 4
    性质 P 在受限族上的取值集合 = [1] -> 非平凡性质在受限族上变成平凡，可判定
    -> 讲义的工程回答：限制程序/性质/输入，把「不可判定」换成「可判定但更窄」
```

三段输出各有含义。

第一段：**有界枚举找到 0 个反例**，说的是「在这个范围内没找到」，而不是「不存在」。讲义要的判定器要覆盖所有正整数四元组，这个差别正是不可判定性的入口。

第二段把「判定器为什么会错」变成可数的：16 个布尔函数构成一个有限的程序族，65536 种可能的判定器全部枚举出来，**完美判定器只有 1 个**（就是性质本身），其余 65535 个每一个都至少在某个程序上判错。这里的数是有限域上的数，不是定理的证明——Rice 定理的一般性论证来自对角化，有限穷举只能展示机制。但机制本身足够说明工程问题：判定器不是「配得好就准」，而是**必然在某处失手**。

第三段是讲义给的工程回答的可执行版本：既然没有银弹，就把程序族限制住。把程序族缩到只剩 `f(x) = (x+1) mod 2` 这一族之后，原先非平凡的性质在受限族上变成平凡——取值集合只剩一个元素，于是可判定。**限制程序、限制性质、限制输入，或者允许工具回答 unknown**：讲义说「重要的是，这些取舍能否换来对软件工程有用的结果」，这段脚本把「换来的是什么」写成了数字。

## 二、十种工具，同一组缺陷样本

讲义把十种工具逐一过堂，每种都问同一组问题：保留了什么、忘掉了什么、知识从哪来、绿色意味着什么。与其复述这张表，不如拿同一组带缺陷的样本去跑五种典型工具——**表格说的是设计取舍，矩阵说的是取舍落在具体样本上是什么样子**。

样本六个：正常实现、差一错、只在负数上错、恒定错、两个实现共享同一个错误、除零崩溃。工具五个：单元测试、性质测试、差分测试、模糊测试，以及一个极简的静态检查（区间分析，只处理除法）。下面这段代码给出矩阵：

```python
"""十种工具的最小对照实验：同一组带缺陷的样本，每种工具买到什么、漏掉什么。

样本：正常 / 差一错 / 负数错 / 恒定错 / 两个实现共享同一错误 / 除零崩溃
工具：单元测试、性质测试、差分测试、模糊测试、静态检查（区间分析）
"""
import ast
import random

SAMPLES = {
    "S1 正常":       lambda x: x + 1,
    "S2 差一错":     lambda x: x,
    "S3 负数错":     lambda x: (x + 2) if x < 0 else (x + 1),
    "S4 恒定错":     lambda x: 42,
    "S5 共享错误":   lambda x: x,
    "S6 除零崩溃":   lambda x: 1 // x,
}
REFERENCE = lambda x: x + 1
# 差分测试要比的是「另一个实现」。只有 S5 的同伴实现犯了同一个错：
# 两个实现互相一致，却一起错 —— 差分测试因此看不见。
PEERS = {
    "S1 正常": REFERENCE, "S2 差一错": REFERENCE, "S3 负数错": REFERENCE,
    "S4 恒定错": REFERENCE, "S5 共享错误": lambda x: x, "S6 除零崩溃": REFERENCE,
}
UNIT_INPUTS = [1, 2, 3]                 # 单元测试的固定样本（不含 0、不含负数）
PROPERTY_INPUTS = list(range(-2, 6))    # 性质测试的采样域

SOURCES = {
    "S1 正常": "def f(x):\n    return x + 1\n",
    "S2 差一错": "def f(x):\n    return x\n",
    "S3 负数错": "def f(x):\n    if x < 0:\n        return x + 2\n    return x + 1\n",
    "S4 恒定错": "def f(x):\n    return 42\n",
    "S5 共享错误": "def f(x):\n    return x\n",
    "S6 除零崩溃": "def f(x):\n    return 1 // x\n",
}


def unit_test(fn):
    for x in UNIT_INPUTS:
        if fn(x) != REFERENCE(x):
            return "抓到"
    return "漏过"


def property_test(fn):
    for x in PROPERTY_INPUTS:
        if fn(x) != REFERENCE(x):
            return "抓到"
    return "漏过"


def differential_test(fn, peer):
    for x in PROPERTY_INPUTS:
        try:
            a, b = fn(x), peer(x)
        except Exception:
            return "抓到"
        if a != b:
            return "抓到"
    return "漏过"


def fuzz_test(fn):
    rng = random.Random(20261125)
    for _ in range(200):
        x = rng.randint(-50, 50)
        try:
            fn(x)
        except Exception:
            return "抓到"
    return "漏过"


def static_check(src):
    """极简区间分析：除以常量 0 -> 确定有 bug；除以变量 -> 区间未知，报 unknown。"""
    for node in ast.walk(ast.parse(src)):
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Div, ast.FloorDiv)):
            if isinstance(node.right, ast.Constant) and node.right.value == 0:
                return "抓到"
            if isinstance(node.right, ast.Name):
                return "unknown"
    return "漏过"


def cell(name, label):
    if label == "静态检查":
        return static_check(SOURCES[name])
    if label == "差分测试":
        return differential_test(SAMPLES[name], PEERS[name])
    if label == "单元测试":
        return unit_test(SAMPLES[name])
    if label == "性质测试":
        return property_test(SAMPLES[name])
    return fuzz_test(SAMPLES[name])


TOOLS = ["单元测试", "性质测试", "差分测试", "模糊测试", "静态检查"]
print("%-12s %-8s %-8s %-8s %-8s %-8s" % ("样本", "单元测试", "性质测试", "差分测试", "模糊测试", "静态检查"))
for name in SAMPLES:
    print("%-12s %-8s %-8s %-8s %-8s %-8s"
          % tuple([name] + [cell(name, t) for t in TOOLS]))
print()
print("各工具实际抓到的样本：")
for t in TOOLS:
    caught = []
    for name in SAMPLES:
        c = cell(name, t)
        if c == "抓到":
            caught.append(name)
        elif c == "unknown":
            caught.append(name + "(报 unknown)")
    print("  %-6s 抓到 %d 个: %s" % (t, len(caught), "、".join(caught) if caught else "无"))
```

```text
样本           单元测试     性质测试     差分测试     模糊测试     静态检查    
S1 正常        漏过       漏过       漏过       漏过       漏过      
S2 差一错       抓到       抓到       抓到       漏过       漏过      
S3 负数错       漏过       抓到       抓到       漏过       漏过      
S4 恒定错       抓到       抓到       抓到       漏过       漏过      
S5 共享错误      抓到       抓到       漏过       漏过       漏过      
S6 除零崩溃      抓到       抓到       抓到       抓到       unknown 

各工具实际抓到的样本：
  单元测试   抓到 4 个: S2 差一错、S4 恒定错、S5 共享错误、S6 除零崩溃
  性质测试   抓到 5 个: S2 差一错、S3 负数错、S4 恒定错、S5 共享错误、S6 除零崩溃
  差分测试   抓到 4 个: S2 差一错、S3 负数错、S4 恒定错、S6 除零崩溃
  模糊测试   抓到 1 个: S6 除零崩溃
  静态检查   抓到 1 个: S6 除零崩溃(报 unknown)
```

矩阵里有三处结果值得单独说。

**差分测试在 S5 上漏过。** S5 的同伴实现犯了同一个错，两个实现互相一致——差分测试的前提是「存在一个可信的对照」，而共享错误时对照本身不可信。讲义原文已经点明「多个实现也可能共享同一个错误」，这里把它落成一次可复现的漏检。

**模糊测试只抓到 1 个样本。** 它抓到的是崩溃，不是逻辑错误：在 200 次变异里，除零那次抛异常被捕获，其余样本的错误逻辑它一概没看见。这正对应讲义对 fuzzing 的定位——它最有价值的产物之一是**一个可以反复运行的触发输入**，而不是对语义的判断。

**静态检查对 S6 只能回答 unknown。** 除数是运行时变量，区间未知，排除不了除零，于是它报「unknown」而不是「有 bug」。讲义说工具可以「允许回答 unknown」，这里是一次具体的 unknown：它没有撒谎，也没有抓到，只是把问题交回去。

至于单元测试与性质测试的差别也很具体：单元测试的固定样本（正数、不含 0）漏掉了 S3，而性质测试的采样域含负数，抓到了。**样本决定了视野**——这是讲义那句「生成器决定能看到哪些输入，性质决定能识别哪些错误」的可运行版本。

回到讲义的收束句：绿色对勾买到的是「排除了某一类错误」，红色留下的是「一个可复现输入、一条反例轨迹，或者一个未完成的证明目标」。上面矩阵里三种证据的形态差别，正是这句话的具体内容。

## 三、把执行轨迹翻译回人类世界

讲义后半讲换了个视角：代码是人在某种需求、上下文和编程习惯下写出的样本，携带着关于这些背景的线索。例子是两段结构完全相同的表达式，名字恢复之后立刻变得可质疑：

```python
def can_watch_huang_guo_tv(visitor):
    return not visitor.inside('China') and visitor.age >= 18

def can_watch_huang_guo_tv(visitor):
    return visitor.inside('China') and visitor.age <= 18
```

讲义由此提出 informal verification：对于形式化世界中的 execution trace，把它翻译回人类世界之后，行为是否符合 intent 和 spec？落地形态是一个回路——模型怀疑年龄条件写反了，就构造不同年龄和地区的访客、运行代码、记录谁被允许、谁被拒绝，再把这些具体行为与需求对照。

这个回路可以整个跑起来。下面这段脚本把它拆成四步：行为表、与需求逐条对照、按怀疑维度做敏感性检查、给出具体反例访客：

```python
"""informal verification 回路：怀疑 -> 构造访客 -> 执行 -> 与需求对照 -> 生成具体反例与待澄清问题。

讲义例子 can_watch_huang_guo_tv：两段代码逻辑结构完全相同，差别只在语义方向。
"""
VISITORS = [
    {"name": "境外-20岁", "inside": False, "age": 20},
    {"name": "境外-17岁", "inside": False, "age": 17},
    {"name": "境内-20岁", "inside": True, "age": 20},
    {"name": "境内-17岁", "inside": True, "age": 17},
]

# 实现写成「地区谓词 + 年龄谓词」两份数据，方向才谈得上被取反
IMPLS = {
    "候选 A":     {"region": lambda v: not v["inside"], "age": lambda v: v["age"] >= 18},
    "候选 B":     {"region": lambda v: v["inside"],     "age": lambda v: v["age"] <= 18},
    "年龄写反":   {"region": lambda v: not v["inside"], "age": lambda v: v["age"] <= 18},
    "地区写反":   {"region": lambda v: v["inside"],     "age": lambda v: v["age"] >= 18},
}


def build(spec):
    return lambda v: spec["region"](v) and spec["age"](v)


def flip(spec, dim):
    """把某个维度的判定方向取反，得到一个变体实现。"""
    s = dict(spec)
    s[dim] = (lambda f: (lambda v: not f(v)))(spec[dim])
    return s


def requirement(v):
    """需求：只服务境外观众，且要求年满 18 岁。"""
    return (not v["inside"]) and v["age"] >= 18


def behavior_table(fn):
    return [(v["name"], fn(v)) for v in VISITORS]


print("候选 A 的行为表:", behavior_table(build(IMPLS["候选 A"])))
print("候选 B 的行为表:", behavior_table(build(IMPLS["候选 B"])))
diff = [n for (n, a), (_, b) in zip(behavior_table(build(IMPLS["候选 A"])),
                                   behavior_table(build(IMPLS["候选 B"]))) if a != b]
print("两者行为不一致的访客:", diff)
print("注意：行为表只证明「两者不等价」，不能证明「谁对」——需求还没给")
print()


def check_against_requirement(spec, name):
    """把行为与需求逐条对照，输出具体违反项。"""
    fn = build(spec)
    violations = []
    for v in VISITORS:
        allowed, expected = fn(v), requirement(v)
        if allowed != expected:
            violations.append((v["name"], "被允许" if allowed else "被拒绝"))
    print("%-8s 对照需求 -> 违反 %d 条: %s" % (name, len(violations), violations if violations else "无"))
    return violations


for name in ("候选 A", "候选 B", "年龄写反", "地区写反"):
    check_against_requirement(IMPLS[name], name)
print()


def loop(spec, suspicions):
    """回路：只对被怀疑的维度取反构造变体，比较行为差异，给出具体访客。

    报出的是「该维度是承重的」，不是「该维度写错了」。
    """
    fn = build(spec)
    findings = []
    for dim in sorted(suspicions):
        variant = build(flip(spec, dim))
        for v in VISITORS:
            if fn(v) != variant(v):
                findings.append((dim, v["name"]))
                break
    return findings


for name in ("年龄写反", "地区写反"):
    for suspicions in ({"region"}, {"age"}, {"region", "age"}):
        res = loop(IMPLS[name], suspicions)
        text = "; ".join("%s：%s" % (d, who) for d, who in res) if res else "无"
        print("实现=%s 怀疑字段=%s -> 报出 %d 条: %s"
              % (name, "{" + ",".join(sorted(suspicions)) + "}", len(res), text))
print()
print("-> 报出的是「这个维度承重」，不是「这个维度写反」：")
print("   真正错在「年龄写反」时，怀疑 age 才能指向它；怀疑 region 同样会报（境外访客受地区条件影响），")
print("   但指向的是错误维度——这就是回路的盲区：怀疑方向错，会给出承重但不对口的证据。")
```

```text
候选 A 的行为表: [('境外-20岁', True), ('境外-17岁', False), ('境内-20岁', False), ('境内-17岁', False)]
候选 B 的行为表: [('境外-20岁', False), ('境外-17岁', False), ('境内-20岁', False), ('境内-17岁', True)]
两者行为不一致的访客: ['境外-20岁', '境内-17岁']
注意：行为表只证明「两者不等价」，不能证明「谁对」——需求还没给

候选 A     对照需求 -> 违反 0 条: 无
候选 B     对照需求 -> 违反 2 条: [('境外-20岁', '被拒绝'), ('境内-17岁', '被允许')]
年龄写反     对照需求 -> 违反 2 条: [('境外-20岁', '被拒绝'), ('境外-17岁', '被允许')]
地区写反     对照需求 -> 违反 2 条: [('境外-20岁', '被拒绝'), ('境内-20岁', '被允许')]

实现=年龄写反 怀疑字段={region} -> 报出 1 条: region：境外-17岁
实现=年龄写反 怀疑字段={age} -> 报出 1 条: age：境外-20岁
实现=年龄写反 怀疑字段={age,region} -> 报出 2 条: age：境外-20岁; region：境外-17岁
实现=地区写反 怀疑字段={region} -> 报出 1 条: region：境外-20岁
实现=地区写反 怀疑字段={age} -> 报出 1 条: age：境内-20岁
实现=地区写反 怀疑字段={age,region} -> 报出 2 条: age：境内-20岁; region：境外-20岁

-> 报出的是「这个维度承重」，不是「这个维度写反」：
   真正错在「年龄写反」时，怀疑 age 才能指向它；怀疑 region 同样会报（境外访客受地区条件影响），
   但指向的是错误维度——这就是回路的盲区：怀疑方向错，会给出承重但不对口的证据。
```

输出里有两处不能忽略的限定。

第一，**行为表只证明「两者不等价」，不证明「谁对」**。境外-20 岁与境内-17 岁这两个访客上，两个候选给出相反结果——但要判断谁符合需求，必须先有一份可判定的需求。讲义说「名字提供了意图线索，却不自动成为需求的权威来源」，脚本把它落实成一步：需求写成谓词，才能逐条对照；需求没写出来之前，检查器能给出的最强结论只是「不等价」。

第二，**敏感性检查报出的是「这个维度承重」，不是「这个维度写反了」**。看年龄写反那个实现：怀疑 age 报出一条（境外-20 岁），怀疑 region 同样报出一条（境外-17 岁）——因为境外访客确实同时受地区条件影响。证据是真的，指向却是错的维度。这正是「怀疑什么」这一环缺少机制保障的后果：**回路的前三步都有机制兜底，唯独怀疑方向来自采样**。讲义那句「常见也不等于符合需求，异常信号仍需要解释」，在工具这一侧就是同一个问题。

所以这一讲最有价值的产物不是某个更强的检查器，而是一个提醒：这类回路能可靠地把怀疑变成证据，但不能可靠地产生怀疑。

## 四、策略交给模型，机制必须到位

讲义把这一讲的方向收在一句改写的口号上：**Heuristics is dead, Policy is Heuristics, LLM is Policy, Mechanism is King.** 启发式是方法，策略是决定做什么，机制是让事情得以执行的底层能力。解读很直接：过去写死在工具里的部分经验策略可以交给模型，但工具必须提供可靠的**观察、执行、控制和重放**四样能力。

四个探索方向也都指向机制这一侧：从系统日志里学习正常模式再找偏离（SOSP 2009 的工作）；设想从全量日志轨迹恢复一种面向人类理解的非形式化语义；让模型组织调试视图，而底层负责提供真实状态；以及「no doc」的新解——能从代码可靠提取的结构按需解释，真正需要长期记录的是代码里提取不出来的设计理由。

这与[第 9 讲的 harness](/blog/harness-engineering/)是同一条原则：**策略可以换成模型，机制不能省**。模型决定查哪里、追问什么、如何理解观察结果；它不负责保证被观察到的状态是真的。

## 五、生成三目标与架构失败

收尾节区分了三个彼此相关又不相同的目标：语法正确、语义正确、阅读自然。能编译、读着顺，不等于实现了想要的功能——语义正确始终需要一个参照，究竟相对于哪一份需求和规格。讲义的判断是：一定程度上可以靠不断试错、调用更多工具来诊断和修复，但过程可能相当低效，依靠的仍然是人类工程师积累的经验与工具。

更要紧的是架构失败：一个补丁让当前测试通过，却可能增加新的耦合，下次改动就要理解更多例外、跑更多验证、再打更多补丁。单次修复成功与持续演化能力，是两种不同的质量。由此讲义给出一个值得一试的机制设想：**让 Agent 在隔离的分支中演练一次合理的需求变更，观察修改波及哪些模块、打破哪些假设、需要重做哪些验证**。这不证明架构优良，但能把「这里以后恐怕难改」变成可讨论的证据——和第 10 讲把品味变成待测量的量是同一种思路。

## 六、这三条检查器判不了什么

自检工具不是评分标准，这一篇的三个脚本同样有明确边界，写在这里以免被当成结论：

- **判定器的穷举只在有限域上成立。** 16 个程序、65536 个判定器里的那个「完美判定器有且仅有 1 个」是有限域的事实，不是 Rice 定理；定理的一般性来自对角化，那部分不可执行。
- **矩阵里的工具是极简实现。** 真实的单元测试有断言与覆盖率，性质测试有生成器与收缩，模糊测试有语料与字典；这里只保留了各自最核心的判定逻辑，因此矩阵说明的是**取舍的方向**，不是各家工具的能力上限。
- **回路的输出止于「承重的维度」。** 它能指出哪个维度一旦取反行为就变，不能指出哪个方向才对——那一步需要需求，而不是更多的自动化。
- **静态检查报 unknown 不是缺陷。** 区间未知时诚实地说 unknown，比给一个可能的误报更有用；但它确实没帮上忙。

## FAQ（七、常见问题）

**Q：Rice 定理是不是说「程序不能被证明」？**

A：不是。讲义把这条边界划得很清楚：定理不是说某个具体程序无法被证明，而是说不能指望同一种算法包办所有情况。单个性质、限定的程序族、限定的输入域上，判定器完全做得出来——第一段脚本里受限族的性质变成平凡，就是这个意思。

**Q：既然有 LLM，为什么不直接让模型判断代码对错？**

A：讲义在开篇就说过传统工具围绕语法或形式语义工作，而「这段代码符合人的真实目的么」通常仍要由人回答。模型带来的是新的连接方式：它读得懂代码携带的上下文线索，因此能提出「这个年龄条件是不是写反了」这种可被具体证据检验的怀疑。但怀疑从哪来、工具能给什么证据，是两件事——第三节的脚本显示，把怀疑变成证据可靠，把怀疑本身生产出来还缺机制。

**Q：informal verification 里的「验证」是不是数学证明？**

A：不是。讲义说得很明确：「验证」表达的是希望完成的任务，并不意味着 LLM 的判断已经具有数学证明的保证。脚本里那句「行为表只证明两者不等价，不能证明谁对」，就是这条限定的可运行版本。

**Q：差分测试和单元测试该怎么选？**

A：矩阵给出的答案是它们漏的东西不一样：单元测试的固定样本可能覆盖不到某个输入区间（S3），差分测试则可能被共享错误骗过（S5），而它的对照关系往往正是最难保证的那部分。实用做法是按证据形态分工：需要「可复现输入」用 fuzzing，需要「反例轨迹」用模型检验，需要逻辑保证用性质测试或证明。

## 延伸阅读

- [《生成式软件工程》2026 秋第 13 讲：软件分析工具](https://jyywiki.cn/GSE/2026/lect13.md) —— 本文整理自这一讲（主讲：jyy）；讲义与幻灯片以 CC BY-NC 4.0 协议发布
- [课程地图：13 讲骨架与三个实验](/blog/generative-software-engineering-course-map/) —— 这一讲是 14 讲版本里的新内容
- [第 12 讲：从测试到证明](/blog/formal-verification-testing-to-proof/) —— 强度阶梯与「证了个寂寞」；本讲的工具清单是同一批工具的成本收益账单
- [第 11 讲：错误如何传播与暴露](/blog/fault-error-failure-testing/) —— oracle 的盲区决定测试的盲区
- [第 9 讲：DeepSeek Harness](/blog/deepseek-harness-agent-runtime/) 与 [harness 工程](/blog/harness-engineering/) —— 「机制不能省」的同一条原则
- [Detecting large-scale system problems by mining console logs (SOSP 2009)](https://dl.acm.org/doi/10.1145/1629575.1629587) —— Xu / Huang / Fox / Patterson / Jordan；讲义用它代表「从日志学正常模式再找偏离」。ACM 页面有 Cloudflare 挑战，脚本访问返回 403，题录经 Semantic Scholar API 核对
- [DDD—a free graphical front-end for UNIX debuggers (SIGPLAN 1996)](https://dl.acm.org/doi/10.1145/249094.249108) —— Zeller & Lütkehaus；讲义用它代表「把数据结构投射成人可以查看和探索的图」。注意 DDD 指调试器前端，不是领域驱动设计；同样因 ACM 的 Cloudflare 挑战无法被脚本抓取，题录经 Semantic Scholar API 核对

本文的三个脚本为自写增量，仅依赖 Python 标准库（ast、random），在 Python 3.9.6 上实跑通过，输出与正文中的结果块逐行一致。
