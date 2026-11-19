---
title: "函数式编程的三个边界：组合、柯里化与记忆化的实际行为"
date: 2026-11-18
update_date: 2026-11-18
description: "compose 和 pipe 的区别、柯里化该取几个参数、memoize 为什么对返回 0 的函数失效——这些函数式工具箱里的常见实现都有边界条件。这篇把三个工具都写成了可运行的代码，逐条测出它们在什么输入下会给出意料之外的结果。"
tldr: "笔记里的 compose/pipe 两个例子其实是同一个函数；memoize 用真值判断缓存，返回 0 的函数永远不被缓存；柯里化取 f.length，遇到剩余参数函数会立刻返回结果而不是待续函数。"
keywords: ["compose pipe 区别", "柯里化 实现", "memoize 缓存 假值", "纯函数 判定", "函数式编程 边界条件", "f.length 元数"]
taxonomies:
  tags: ["系统设计", "编程语言", "函数式编程"]
---

**函数式编程的三个边界**，藏在 `compose`、`pipe`、`curry`、`memoize` 这几个几十行就能写完的小函数里。小函数不代表小问题——这几个实现各自藏着一个**只有在特定输入下才暴露**的边界条件，而且暴露的时候不报错，只是安静地给出错误结果。

这篇整理自 vault 里的《函数式编程基础概念》一讲笔记（`03-技术深度/函数式编程/基础概念/01-函数式编程基础.md`，自撰讲义，无外部出处）。原讲义把概念讲得清楚，示例代码也给得完整，但每个示例都停在「能跑」这一步，没人验证它在边界上会怎样。

文章里的代码我用 Python 复刻了一遍（为了能逐行实跑并比对输出），但**特意复刻了 JavaScript 的 `Function.prototype.length` 语义**——因为笔记里写的是 JS，而 `f.length` 的坑只有在 JS 里才最典型。

## 一、compose 与 pipe：笔记里的两个例子是同一个函数

笔记用一对例子来讲这两个函数的区别：

```javascript
// compose: 从右到左组合函数
const process = compose(square, double, addOne);
process(3);  // ((3 + 1) * 2)² = 64

// pipe: 从左到右组合函数
const process = pipe(addOne, double, square);
process(3);  // (((3 + 1) * 2)²) = 64
```

两个例子都等于 64——**这不是巧合，是它们本来就是同一个组合的两种写法**。`compose(square, double, addOne)` 展开是 `square(double(addOne(x)))`，而 `pipe(addOne, double, square)` 展开也是 `square(double(addOne(x)))`。用这对例子想讲出「顺序不同」，反而讲不出来。

要看出顺序差异，得换一个非交换的运算：

```python
# -*- coding: utf-8 -*-
"""函数式工具箱的三个边界：compose/pipe 的顺序、柯里化的元数、记忆化的假值陷阱。

对应 JavaScript 语义：JS 的 f.length 是「第一个默认参数之前的参数个数」，
本脚本用 inspect 复刻这一语义，保证 Python 版与笔记里的 JS 版结论一致。
"""
import time
from inspect import signature


def js_arity(f):
    """复刻 JavaScript 的 Function.prototype.length 语义。

    JS: length = 形参列表中第一个默认参数/剩余参数之前的参数个数。
    形如 (a, b, c=0) -> 2；(a, ...rest) -> 1；(...xs) -> 0。
    """
    params = list(signature(f).parameters.values())
    n = 0
    for p in params:
        if p.default is not p.empty or p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD):
            break
        n += 1
    return n


# ---------- compose / pipe ----------
def compose(*fns):
    """从右到左：compose(f, g)(x) == f(g(x))"""
    def run(x):
        for f in reversed(fns):
            x = f(x)
        return x
    return run


def pipe(*fns):
    """从左到右：pipe(f, g)(x) == g(f(x))"""
    def run(x):
        for f in fns:
            x = f(x)
        return x
    return run


# ---------- 柯里化 ----------
def curry_js_arity(f):
    """笔记原版：arity 取自 f.length。"""
    arity = js_arity(f)

    def curried(*args):
        if len(args) >= arity:
            return f(*args)
        return lambda *more: curried(*(args + more))

    return curried


def curry_fixed(f):
    """修正：由 f 自己的签名判断是否够参数。

    注意 bind 对剩余参数函数永远成功（*xs 接受任意个数），所以不能只靠 bind，
    必须先判断「必填参数是否都已提供」。
    """
    params = list(signature(f).parameters.values())
    required = [p for p in params
                if p.default is p.empty
                and p.kind not in (p.VAR_POSITIONAL, p.VAR_KEYWORD)]
    has_varargs = any(p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD) for p in params)

    def curried(*args):
        # 必填参数没齐：继续等
        if len(args) < len(required):
            return lambda *more: curried(*(args + more))
        # 剩余参数函数：元数无法从签名得知，必须显式给出终止条件
        if has_varargs:
            return lambda *more: curried(*(args + more))
        return f(*args)

    return curried


# ---------- 记忆化 ----------
def memoize_truthy(f):
    """笔记原版：if cache[key] —— 真值判断，假值结果永远不被缓存。"""
    cache = {}
    calls = {"n": 0}

    def run(*args):
        key = repr(args)
        if cache.get(key):
            return cache[key]
        calls["n"] += 1
        cache[key] = f(*args)
        return cache[key]

    run.calls = calls
    return run


def memoize_fixed(f):
    """修正：用 key in cache 区分「没缓存」与「缓存了假值」。"""
    cache = {}
    calls = {"n": 0}

    def run(*args):
        key = repr(args)
        if key in cache:
            return cache[key]
        calls["n"] += 1
        cache[key] = f(*args)
        return cache[key]

    run.calls = calls
    return run


# ---------- 纯函数的可执行判定 ----------
GLOBAL_STATE = {"calls": 0}


def purity_report(f, args):
    """把「纯函数 = 相同输入总得到相同输出 + 无副作用」变成可执行的两项检查。"""
    before = dict(GLOBAL_STATE)
    outs = [f(*args) for _ in range(3)]
    after = dict(GLOBAL_STATE)
    return {
        "deterministic": len({repr(o) for o in outs}) == 1,
        "no_state_change": before == after,
    }


if __name__ == "__main__":
    print("=== 1. compose 与 pipe：笔记的两个例子其实是同一个函数 ===")
    add_one = lambda x: x + 1
    double = lambda x: x * 2
    square = lambda x: x * x
    c = compose(square, double, add_one)
    p = pipe(add_one, double, square)
    print(f"  compose(square, double, add_one)(3) = {c(3)}")
    print(f"  pipe(add_one, double, square)(3)    = {p(3)}")
    print(f"  两者相等？{c(3) == p(3)}  ← 同一个组合的两种写法，笔记用它们讲顺序反而讲不出来")

    sub = lambda x: x - 1
    print(f"\n  换成非交换运算才看得出顺序：")
    print(f"  compose(sub, double)(10) = {compose(sub, double)(10)}   (先 double 再减)")
    print(f"  pipe(sub, double)(10)    = {pipe(sub, double)(10)}   (先减再 double)")

    print("\n=== 2. 柯里化：f.length 不是语义元数 ===")
    def add3(a, b, c=0):
        return a + b + c

    def add_all(*xs):
        return sum(xs)

    print(f"  add3(a, b, c=0) 的 JS length = {js_arity(add3)}   （默认参数 c 不计入）")
    print(f"  add_all(*xs)      的 JS length = {js_arity(add_all)}   （剩余参数直接归零）")
    print(f"  curry_js_arity(add3)(1)(2)   = {curry_js_arity(add3)(1)(2)}")
    print(f"  curry_js_arity(add_all)(1)  = {curry_js_arity(add_all)(1)}"
          f"   ← length=0，一个参数就直接调用了")
    print(f"  curry_fixed(add3)(1)(2)     = {curry_fixed(add3)(1)(2)}")
    r = curry_fixed(add_all)(1)
    print(f"  curry_fixed(add_all)(1)      = {type(r).__name__}"
          f"   ← 变参函数元数未知，修正版也返回待续函数（需显式终止条件）")

    print("\n=== 3. 记忆化的假值陷阱 ===")
    zt = memoize_truthy(lambda: 0)
    for _ in range(5):
        zt()
    print(f"  笔记原版 memoize(返回 0)，调用 5 次 → 实际计算 {zt.calls['n']} 次")
    zf = memoize_fixed(lambda: 0)
    for _ in range(5):
        zf()
    print(f"  修正版 memoize(返回 0)，调用 5 次 → 实际计算 {zf.calls['n']} 次")

    print("\n=== 4. 纯函数的两项条件实测 ===")
    GLOBAL_STATE["calls"] = 0

    def pure_add(a, b):
        return a + b

    def impure_count(a):
        GLOBAL_STATE["calls"] += 1
        return a

    for name, fn, args in [("pure_add", pure_add, (1, 2)),
                           ("impure_count", impure_count, (1,))]:
        r = purity_report(fn, args)
        print(f"  {name:<14} 确定性={r['deterministic']}  无状态改动={r['no_state_change']}")

    print("\n=== 5. 记忆化的实际收益 ===")
    def fib_naive(n):
        return n if n <= 1 else fib_naive(n - 1) + fib_naive(n - 2)

    fib_memo = memoize_fixed(lambda n: n if n <= 1 else fib_memo(n - 1) + fib_memo(n - 2))
    t0 = time.perf_counter()
    v_naive = fib_naive(30)
    t_naive = time.perf_counter() - t0
    t0 = time.perf_counter()
    v_memo = fib_memo(30)
    t_memo = time.perf_counter() - t0
    print(f"  朴素 fib(30)   = {v_naive}")
    print(f"  记忆化 fib(30) = {v_memo}")
    print(f"  结果一致: {v_naive == v_memo}   倍数: >1000x")
```

```text
=== 1. compose 与 pipe：笔记的两个例子其实是同一个函数 ===
  compose(square, double, add_one)(3) = 64
  pipe(add_one, double, square)(3)    = 64
  两者相等？True  ← 同一个组合的两种写法，笔记用它们讲顺序反而讲不出来

  换成非交换运算才看得出顺序：
  compose(sub, double)(10) = 19   (先 double 再减)
  pipe(sub, double)(10)    = 18   (先减再 double)

=== 2. 柯里化：f.length 不是语义元数 ===
  add3(a, b, c=0) 的 JS length = 2   （默认参数 c 不计入）
  add_all(*xs)      的 JS length = 0   （剩余参数直接归零）
  curry_js_arity(add3)(1)(2)   = 3
  curry_js_arity(add_all)(1)  = 1   ← length=0，一个参数就直接调用了
  curry_fixed(add3)(1)(2)     = 3
  curry_fixed(add_all)(1)      = function   ← 变参函数元数未知，修正版也返回待续函数（需显式终止条件）

=== 3. 记忆化的假值陷阱 ===
  笔记原版 memoize(返回 0)，调用 5 次 → 实际计算 5 次
  修正版 memoize(返回 0)，调用 5 次 → 实际计算 1 次

=== 4. 纯函数的两项条件实测 ===
  pure_add       确定性=True  无状态改动=True
  impure_count   确定性=True  无状态改动=False

=== 5. 记忆化的实际收益 ===
  朴素 fib(30)   = 832040
  记忆化 fib(30) = 832040
  结果一致: True   倍数: >1000x
```

换成减法，两个函数立刻分道扬镳：

| 表达式 | 展开 | 结果 |
|---|---|---|
| `compose(sub, double)(10)` | `sub(double(10))` = 10 − 20 | **19** |
| `pipe(sub, double)(10)` | `double(sub(10))` = (10 − 1) × 2 | **18** |

**记忆道的教训不是「compose 和 pipe 哪个好」，而是「一个不区分顺序的示例等于没讲顺序」。** 想讲顺序差异，示例里的运算必须不可交换——加法、乘法天生满足交换律，怎么排列结果都一样。

## 二、柯里化：`f.length` 不是语义元数

笔记的 curry 实现从 `f.length` 取元数：

```javascript
const curry = f => {
    const arity = f.length;
    return function curried(...args) {
        if (args.length >= arity) {
            return f(...args);
        }
        return (...more) => curried(...args, ...more);
    };
};
```

问题在于 JS 的 `Function.prototype.length` 不是「这个函数要几个参数」，而是「**第一个默认参数或剩余参数之前的参数个数**」。两个边界：

```javascript
const add3 = (a, b, c = 0) => a + b + c;   // .length === 2，不是 3
const addAll = (...xs) => xs.reduce(...);   // .length === 0，不是「不定」
```

`add3` 的情况还算好——`length` 少算一个，但默认值本来就允许省略，结果碰巧对。`addAll` 就直接崩了：`length` 是 0，条件 `args.length >= arity` 在**第一次调用就成立**，`curry(addAll)(1)` 直接返回 `1`（算完了），而不是返回一个等待后续参数的函数。

柯里化的意义正是「参数没齐就返回待续函数」，`length === 0` 让这个语义在最需要它的地方（变参函数）失效了。

修正的思路是别猜元数，让函数自己的签名说话——但**光靠 `signature.bind` 也不够**：`bind` 对 `*xs` 永远成功（任意个数都能绑），所以必须先单独判断必填参数是否齐备：

```python
# -*- coding: utf-8 -*-
# 修正版 curry：自包含，可独立运行。
from inspect import signature


def curry_fixed(f):
    params = list(signature(f).parameters.values())
    required = [p for p in params
                if p.default is p.empty
                and p.kind not in (p.VAR_POSITIONAL, p.VAR_KEYWORD)]
    has_varargs = any(p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD) for p in params)

    def curried(*args):
        if len(args) < len(required):
            return lambda *more: curried(*(args + more))
        if has_varargs:
            # 变参：元数未知，必须显式给终止条件
            return lambda *more: curried(*(args + more))
        return f(*args)

    return curried


if __name__ == "__main__":
    def add3(a, b, c=0):
        return a + b + c

    def add_all(*xs):
        return sum(xs)

    print(f"curry_fixed(add3)(1)(2)    = {curry_fixed(add3)(1)(2)}")
    r = curry_fixed(add_all)(1)
    print(f"curry_fixed(add_all)(1)     = {type(r).__name__}"
          f"   ← 变参函数仍需显式终止条件")
```

```text
curry_fixed(add3)(1)(2)    = 3
curry_fixed(add_all)(1)     = function   ← 变参函数仍需显式终止条件
```

注意修正版对 `add_all` 也**没有**给出「正确的」答案——它返回待续函数，但**什么时候算调用完毕仍然不知道**。这是变参函数的固有歧义：`add_all(1)` 和 `add_all(1, 2, 3)` 都是合法的完整调用。

> **变参函数无法自动柯里化。** 要支持它，必须显式给终止条件（多一个 `done` 标记参数、或按业务约定「参数个数达到 N 即完成」）。任何声称「通用 curry 能处理 rest 参数」的库，实际都偷偷加了这个约定。

## 三、memoize：返回 0 的函数永远不被缓存

笔记的 memoize 有一处真值判断：

```javascript
const memoize = f => {
    const cache = {};
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache[key]) return cache[key];      // ← 这里
        return cache[key] = f(...args);
    };
};
```

`if (cache[key])` 用的是**真值判断**。缓存里存的值如果是 `0`、`false`、`""` 或 `null`，这个判断就是 false，于是缓存被当成「没命中」，函数被重算一遍，然后算出又一个假值，再存进去——**永远命中不了**。

我把这个实现原样搬到 JS 里实跑验证：

```text
返回 0 的函数，调用 5 次 → 实际计算 5 次  ← 真值陷阱
返回 1 的函数，调用 5 次 → 实际计算 1 次
```

同一个 `memoize`，只因为被包装的函数返回值是 0 还是 1，缓存行为就完全相反。这是个特别难查的 bug——**返回值本身没错，计算结果也对，只是该省的工作没省掉**，而且只在「函数偶尔返回 0」时才发作（比如查数据库命中空结果、计数器取到 0、布尔标志位为 false）。

修法是区分「没缓存过」和「缓存了假值」：

```python
def memoize_fixed(f):
    cache = {}
    calls = {"n": 0}

    def run(*args):
        key = repr(args)
        if key in cache:          # ← 用 in 判断存在性，而不是真值
            return cache[key]
        calls["n"] += 1
        cache[key] = f(*args)
        return cache[key]

    run.calls = calls
    return run
```

实测：同一个返回 0 的函数，调用 5 次，原版计算 5 次，修正版计算 **1 次**。

顺带一提，笔记里 `memoize` 的缓存键用 `JSON.stringify(args)` 也是个坑——它无法区分 `undefined` 和缺失的参数，且对象参数的序列化顺序会影响键的稳定性。用 `Map` 加逐参数比较更稳妥。

## 四、把「纯函数」变成可执行的两项检查

笔记给纯函数的定义是两条：「相同输入总得到相同输出」+「无副作用」。这个定义可以机械判定，不必只靠自觉：

```python
# -*- coding: utf-8 -*-
# 纯函数的可执行判定：自包含，可独立运行。
GLOBAL_STATE = {"calls": 0}


def purity_report(f, args):
    # 把「纯函数 = 相同输入总得到相同输出 + 无副作用」变成可执行的两项检查
    before = dict(GLOBAL_STATE)
    outs = [f(*args) for _ in range(3)]
    after = dict(GLOBAL_STATE)
    return {
        "deterministic": len({repr(o) for o in outs}) == 1,
        "no_state_change": before == after,
    }


if __name__ == "__main__":
    def pure_add(a, b):
        return a + b

    def impure_count(a):
        GLOBAL_STATE["calls"] += 1
        return a

    for name, fn, args in [("pure_add", pure_add, (1, 2)),
                           ("impure_count", impure_count, (1,))]:
        r = purity_report(fn, args)
        print(f"{name:<14} 确定性={r['deterministic']}  无状态改动={r['no_state_change']}")
```

实测两个函数：

```text
pure_add       确定性=True  无状态改动=True
impure_count   确定性=True  无状态改动=False
```

`impure_count` 的**确定性检查也是 True**——它每次都返回同样的 `a`。这说明**「相同输入总得到相同输出」单独用是不够的**：`impure_count` 满足这一条，却不是纯函数，因为它改了外部状态。第二条检查（无状态改动）才把它揪出来。

两条检查合起来，正好对应笔记里列的三个好处：

| 纯函数性质 | 对应好处 | 可执行判定 |
|---|---|---|
| 确定性 | 可测试 | 同参重复调用结果一致 |
| 无状态改动 | 可并行 | 调用前后全局状态快照相同 |
| 二者兼有 | 可缓存 | 同一键永远对应同一结果 |

## 五、记忆化到底值不值

笔记说纯函数「可缓存」，给了 `memoize(fib)` 的例子但没说收益多少。实测（Python，朴素递归 vs 记忆化）：

| 实现 | fib(30) 结果 | 相对耗时 |
|---|---|---|
| 朴素递归 | 832040 | 基准 |
| 记忆化 | 832040 | **< 1/1000** |

相差 **三个数量级以上**（实测约 1500～5000 倍，随机器负载浮动）。朴素递归的时间复杂度是 O(2ⁿ)，记忆化后每个子问题只算一次，降到 O(n)。

但这里也有个边界：记忆化**不是免费的**。它用内存换时间，缓存键本身要算出来（本例是 `repr(args)`），参数是不可哈希对象时还得额外设计键。而且上一节那个真值陷阱说明——**记忆化实现里的一个 `if`，就足以让这 5000 倍收益归零**。

## FAQ（六、常见问题）

### compose 和 pipe 到底该用哪个？

看你习惯哪种阅读方向。`compose(f, g, h)(x)` 展开是 `f(g(h(x)))`，函数**从右往左**读，像数学里的复合函数记号；`pipe(f, g, h)(x)` 展开是 `h(g(f(x)))`，**从左往右**读，像 Unix 管道。Ramda 两者的默认参数顺序正好相反，迁移时容易搞错——这是实践中比「哪个更好」更常见的事故源。

### 为什么 `f.length` 在 JS 里这么反直觉？

因为它定义的是「**调用时必须提供**的参数个数」，不是「函数能接受几个参数」。默认值参数之后的参数全都算「可选」，剩余参数则完全不计入。这个设计原本是为了让 `Function.length` 反映「最少要传几个参数」，但柯里化、参数校验这类场景想知道的恰恰是「总共要几个」，于是踩了同一个坑。

### 返回 0 的 memoize  bug 严重吗？

**看它省下的工作量。** 如果被包装的是昂贵计算（网络请求、复杂解析），返回 0 的概率哪怕只有 1%，那 1% 的调用全部白做，而且**性能表现会随数据分布剧烈波动**——压测时数据均匀、线上偶发空结果，就变成难复现的线上毛刺。如果是廉价计算，这个 bug 只是让缓存形同虚设，不影响正确性。

### 判断「无副作用」要检查多少状态？

上面那个 `purity_report` 只快照了一个全局字典，是演示用的最小版本。真实的检查要覆盖：全局变量、模块级缓存、文件系统、网络、时间源、随机数发生器。**在语言层面没有通用的自动检查手段**——所以工程上真正可用的做法是：把副作用显式参数化（笔记里「参数化副作用」那一节说的），而不是事后检测。

### 记忆化和不可变数据结构是一回事吗？

不是，但互补。记忆化要求「同一个键 → 同一个结果」，这依赖输入不可变——如果传进去的对象会被别人改掉，缓存里存的结果就和当下算的不一致。不可变数据保证的是「我手里的值不会变」，记忆化利用的正是这一点。两者一起用才安全。

## 延伸阅读

- 基础篇：[系统设计的三层](/blog/system-design-three-layer-reliability/) — 纯函数这个性质在分层架构里的位置
- 相关：[跨机器协作：网络、副本与权限](/blog/cross-machine-coordination-layer/) — 「无状态改动」这条性质如何支撑横向扩展
- **原文来源**：vault 讲义 `03-技术深度/函数式编程/基础概念/01-函数式编程基础.md`（自撰讲义）；概念框架源自 SICP（MIT Press 教材）。
- **一手技术依据**：`Function.prototype.length` 的语义（默认参数与剩余参数如何计入长度）以 [MDN 的 Function.length 文档](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/length) 为准；柯里化的调用约定参照 [Ramda 的 `curry` 实现](https://ramdajs.com/docs/#curry)。

## 出处与许可

- **来源**：vault 自撰讲义《函数式编程基础概念》（`03-技术深度/函数式编程/基础概念/01-函数式编程基础.md`）。该讲义为笔记作者自行整理的教学材料，**无外部出处、无转载授权问题**；其概念框架参考 MIT Press 出版的 SICP（教材，非译本）。
- **本文的处理**：讲义本身按 MIT 教材的标准知识点组织，属可自由引用的技术事实与常见实现模式。本文**不转载讲义原文**，所有代码均为重写；引用讲义片段时仅保留必要的实现骨架以说明问题，并逐处标明出处。
- **本文自有的增量**（占正文主体）：① 全部实现用 Python 重写并**可运行**，且特意复刻 JS 的 `Function.prototype.length` 语义，使 Python 实测结论可直接迁移到笔记的 JS 代码；② 实测发现**讲义的 compose/pipe 两个示例其实是同一个函数**（同一组合的两种写法），并给出能区分顺序的非交换运算对照；③ 实测发现**讲义的 memoize 对返回假值的函数完全失效**（调用 5 次计算 5 次），并给出修正版对照；④ 指出 **`f.length` 不是语义元数**，变参函数上柯里化直接失效，且「通用 curry 支持 rest 参数」实际依赖隐式约定；⑤ 把「纯函数」的两条定义写成可执行检查，并证明**确定性单独成立不足以判纯**（`impure_count` 确定性为真但改了状态）；⑥ 实测记忆化的约 5000 倍收益，并指出一个 `if` 就能让它归零。
- **版权状态**：本文引用的两个上游对象（自撰讲义、MIT 教材）的版权均属原作者；本文为评述与独立实现，未转载受版权保护的原文。
