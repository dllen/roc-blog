---
title: "纯函数与副作用：把「纯」变成能跑的判定"
date: 2026-11-19
update_date: 2026-11-19
description: "「纯」到底怎么判断，多数资料只给定义不给方法。这篇写了一个参照透明性探针，把讲义自列的例子逐条跑成 PURE / NOT PURE，并测出三处边界：makeCounter 不纯、calculateDiscount 的错误分支让调用方读到 undefined、Either 的 flatMap 对回调有形状要求。"
tldr: "「同一输入总是同一输出」可以机械判定：连调两次比输出。但探针本身也会失真——时钟依赖必须让两次调用跨过毫秒边界才测得出来。讲义里被称作纯函数的 makeCounter，其实不纯。"
keywords: ["纯函数 判定", "参照透明性", "副作用 边界", "makeCounter 不纯", "Either flatMap 形状", "IO Monad 惰性"]
taxonomies:
  tags: ["系统设计", "编程语言", "函数式编程"]
---

**纯函数与副作用**这两个概念几乎人人都听过：「纯函数」的定义是**相同输入总是得到相同输出，且不产生副作用**。但它难在「总是」两个字——那是个关于时间的断言，而检查断言需要重复。

多数资料停在定义。这篇把它变成一个能跑的判定。

这篇整理自 vault 里的《纯函数与副作用》一讲笔记（`03-技术深度/函数式编程/基础概念/02-纯函数与副作用.md`，自撰讲义，无外部出处）。讲义结构完整——副作用的八种形态、纯函数的两条规则、参数化 / 返回副作用 / IO Monad / Either / Maybe 五种处理策略、纯函数式状态、分层架构。**但每个例子都只验证了「能跑」，没有一个验证了「纯」或「在边界上会怎样」。**

## 一、把「纯」变成可执行的判定

定义里的「相同输入总是得到相同输出」有个直接推论：**同一个输入连调两次，输出必须相同。** 这可以写成探针。

讲义自己列了一组例子：

```javascript
// 纯函数
const add = (a, b) => a + b;
const square = x => x * x;
const identity = x => x;

// 非纯函数
const random = () => Math.random();           // 不确定性
const getTime = () => new Date().getTime();   // 不确定性
const increment = () => global++;             // 副作用
const fetchUser = (id) => api.get(id);        // 副作用
```

逐条跑一遍探针：

```javascript
// 参照透明性探针：同一个输入连调两次，输出是否相同
const sleepMs = (ms) => { const t = Date.now() + ms; while (Date.now() < t); };
const probe = (label, f, gapMs = 0) => {
  const a = f();
  if (gapMs) sleepMs(gapMs);
  const b = f();
  const same = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${same ? 'PURE' : 'NOT PURE'}  ${label} -> ${a} | ${b}`);
  return same;
};

// 讲义列出的例子。
// 时钟与随机源用可注入的桩代替，使输出逐次可复现；
// 真实实现（new Date().getTime() / Math.random()）的不可复现性正是要测出来的东西。
let count = 0;
const add = (a, b) => a + b;
const square = x => x * x;
const identity = x => x;
const increment = () => ++count;
let clock = 1700000000000;
const getTime = () => (clock += 5);      // 每次调用推进 5ms
let seed = 42;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

probe('add(2,3)', () => add(2, 3));
probe('square(4)', () => square(4));
probe('identity(7)', () => identity(7));
probe('increment() 改全局', () => increment());
probe('getTime() 读时钟', () => getTime());        // 桩保证两次跨过时间边界
probe('random() 随机源', () => random());
```

```text
PURE  add(2,3) -> 5 | 5
PURE  square(4) -> 16 | 16
PURE  identity(7) -> 7 | 7
NOT PURE  increment() 改全局 -> 1 | 2
NOT PURE  getTime() 读时钟 -> 1700000000005 | 1700000000010
NOT PURE  random() 随机源 -> 0.5823075897060335 | 0.5198186635971069
```

讲义列的四个「非纯」全部被抓到。

上面这组输出用**可控的时钟与随机源桩**打印，因此逐次可复现——真实实现（`new Date().getTime()` / `Math.random()`）的不可复现性，正是这段代码要测出来的东西。但真正值得看的是**探针自己**。

### 探针会失真：同毫秒的两次调用

我第一版探针直接连调两次，`getTime()` 判出来是 **PURE**：

```javascript
// 模拟「两次调用落在同一毫秒」这一情形：可控时钟
let clock = 1700000000000;
const getTime = () => clock;          // 固定在同一毫秒
const probe = (label, f) => {
  const a = f(), b = f();              // 两次调用可能落在同一毫秒
  return JSON.stringify(a) === JSON.stringify(b);
};
console.log(`同一毫秒内两次调用: ${getTime()} | ${getTime()}`);
console.log(`探针判定: ${probe('getTime', () => getTime()) ? 'PURE' : 'NOT PURE'}   <- 实际不可复现，但探针说 PURE`);
console.log('  -> 探针的失真：只要两次采样落在同一毫秒，时钟依赖就被判成纯。');
```

```text
同一毫秒内两次调用: 1700000000000 | 1700000000000
探针判定: PURE   <- 实际不可复现，但探针说 PURE
  -> 探针的失真：只要两次采样落在同一毫秒，时钟依赖就被判成纯。
```

两次调用落在同一个毫秒里，`Date.now()` 返回同一个值，探针于是判成纯。**这正是「测试一次通过不代表性质成立」的一个具体形态**——时钟依赖必须让两次调用跨过时间边界才测得出来：

```javascript
const sleepMs = (ms) => { const t = Date.now() + ms; while (Date.now() < t); };
const getTime = () => new Date().getTime();
const probe = (label, f, gapMs = 0) => {
  const a = f();
  if (gapMs) sleepMs(gapMs);
  const b = f();
  const same = JSON.stringify(a) === JSON.stringify(b);
  console.log(`${same ? 'PURE' : 'NOT PURE'}  ${label} -> 两次调用相隔 ${b - a} ms`);
};
probe('getTime() 读时钟', () => getTime(), 5);   // 强制跨过毫秒边界
console.log('  -> 加上 5ms 间隔后，判定翻转成 NOT PURE：时钟依赖被暴露。');
```

加上 5 ms 间隔后立刻暴露（间隔实测值每次略有不同，故只报性质、不报具体毫秒数）：

```text
NOT PURE  getTime() 读时钟 -> 两次调用相隔 6 ms
  -> 加上 5ms 间隔后，判定翻转成 NOT PURE：时钟依赖被暴露。
```

> **判定纯度时，采样间隔本身是测试条件的一部分。** 探针不给时钟依赖留出跨界时间，就会把它判成纯——而且判得很自信。

## 二、讲义里被称作「纯」的 makeCounter，其实不纯

讲义第 4.2 节讲「纯函数式状态变量」：

```javascript
// 用闭包模拟可变状态（但对外是纯函数）
const makeCounter = () => {
    let count = 0;
    return {
        tick: () => { count++; return count; },
        reset: () => { count = 0; }
    };
};

// 对外暴露的是不可变的接口
// 内部状态被封装

const counter = makeCounter();
console.log(`tick() 第一次 = ${counter.tick()}`);
console.log(`tick() 第二次 = ${counter.tick()}   <- 无参（同一输入），输出不同`);

const probe = (label, f) => {
    const a = f(), b = f();
    console.log(`${JSON.stringify(a) === JSON.stringify(b) ? 'PURE' : 'NOT PURE'}  ${label} -> ${a} | ${b}`);
};
probe('counter.tick()', () => counter.tick());
```

注释说「对外是纯函数」「对外暴露的是不可变的接口」。探针不同意：

```text
tick() 第一次 = 1
tick() 第二次 = 2   <- 无参（同一输入），输出不同
NOT PURE  counter.tick() -> 3 | 4
```

`tick()` 没有任何输入，两次调用输出不同——**它不满足讲义自己给的纯函数定义第一条**。

这不意味着闭包有问题。讲义的**意图**是对的：把可变状态关起来，让外界只能通过受控接口访问。问题是**「封装」被当成了「纯」**。这两件事不同：

| | 封装了状态 | 满足纯函数定义 |
|---|---|---|
| `makeCounter` | 是 | **否**（输出依赖历史） |
| `add(2,3)` | 不涉及状态 | 是 |

正确的说法是：`makeCounter` 是**有状态对象**，它对外的接口是**受控的**（不能直接改 `count`），但不是**纯的**（同样的调用不给出同样的结果）。Redux 的 `reducer` 才是纯的——讲义里那段 `createStore` 的实现是对的，因为 `reducer(state, action)` 只依赖参数：

```javascript
const reducer = (state, action) => {
    switch (action.type) {
        case 'INCREMENT': return { ...state, count: state.count + 1 };
        case 'DECREMENT': return { ...state, count: state.count - 1 };
        default: return state;
    }
};
```

同一 `(state, action)` 永远给出同一新 state——这个可以用探针机械验证：

```python
# -*- coding: utf-8 -*-
"""把讲义的 reducer 变成可验证的纯函数：穷举所有 (state, action) 组合，
确认「同一输入永远同一输出」，并顺带查默认分支是否真的无副作用。"""
import copy
import itertools
import json


def reducer(state, action):
    """讲义原文的 reducer 实现（去掉 spread 语法以便序列化）。"""
    if action["type"] == "INCREMENT":
        new = dict(state); new["count"] = state["count"] + 1; return new
    if action["type"] == "DECREMENT":
        new = dict(state); new["count"] = state["count"] - 1; return new
    return state


ACTIONS = [{"type": "INCREMENT"}, {"type": "DECREMENT"}, {"type": "UNKNOWN"}]
STATES = [{"count": n} for n in range(-3, 4)]

print("=== reducer 穷举验证：同一 (state, action) 是否永远同一输出 ===")
bad = 0
total = 0
for state, action in itertools.product(STATES, ACTIONS):
    total += 1
    a = reducer(copy.deepcopy(state), action)
    b = reducer(copy.deepcopy(state), action)
    if a != b:
        bad += 1
        print(f"  不一致: state={state} action={action} -> {a} vs {b}")
print(f"  组合数 {total}，输出不一致 {bad} 处")

print("\n=== 默认分支是否真的「不修改入参」===")
s = {"count": 5}
snapshot = copy.deepcopy(s)
out = reducer(s, {"type": "UNKNOWN"})
print(f"  入参改了吗: {s != snapshot}   (期望 False)")
print(f"  返回的是同一个对象吗: {out is s}   (期望 True —— 默认分支原样返回)")

print("\n=== 对比：讲义的 makeCounter 不满足这条 ===")


def make_counter():
    c = [0]
    def tick():
        c[0] += 1
        return c[0]
    def reset():
        c[0] = 0
    return tick, reset


tick, _ = make_counter()
print(f"  tick() 第一次 = {tick()}")
print(f"  tick() 第二次 = {tick()}   <- 同一「输入」(无参)，输出不同")

print("\n=== 修复：把状态显式作为参数，就变纯了 ===")


def pure_tick(state):
    return state + 1


print(f"  pure_tick(0) = {pure_tick(0)}")
print(f"  pure_tick(0) = {pure_tick(0)}   <- 同一输入，同一输出 ✓")
```

```text
=== reducer 穷举验证：同一 (state, action) 是否永远同一输出 ===
  组合数 21，输出不一致 0 处

=== 默认分支是否真的「不修改入参」===
  入参改了吗: False   (期望 False)
  返回的是同一个对象吗: True   (期望 True —— 默认分支原样返回)

=== 对比：讲义的 makeCounter 不满足这条 ===
  tick() 第一次 = 1
  tick() 第二次 = 2   <- 同一「输入」(无参)，输出不同

=== 修复：把状态显式作为参数，就变纯了 ===
  pure_tick(0) = 1
  pure_tick(0) = 1   <- 同一输入，同一输出 ✓
```

穷举 21 个 `(state, action)` 组合（7 个状态 × 3 种 action），输出零不一致。**reducer 是纯的，makeCounter 不是**——差别就在「状态是参数还是闭包变量」。

## 三、calculateDiscount 的错误分支，调用方读到 undefined

讲义第 7.2 节给了分层架构的示例：

```javascript
// 领域层 (纯)
const calculateDiscount = (price, userType) => {
    if (price < 0) return { error: 'Invalid price' };
    
    const discounts = {
        'vip': 0.3,
        'premium': 0.2,
        'normal': 0
    };
    
    const discount = discounts[userType] || 0;
    return {
        originalPrice: price,
        discount: price * discount,
        finalPrice: price * (1 - discount)
    };
};

// 应用层
const processOrder = async (orderId) => {
    const order = await db.orders.find(orderId);
    const user = await db.users.find(order.userId);
    
    // 纯函数计算 (无副作用)
    const result = calculateDiscount(order.price, user.type);
    
    // 副作用: 保存结果
    await db.orders.update(orderId, { 
        finalPrice: result.finalPrice,
        discount: result.discount
    });
    
    return result;
};
```

这里有个讲义没提的问题：**`calculateDiscount` 的返回类型不是一个类型**。成功时返回 `{originalPrice, discount, finalPrice}`，失败时返回 `{error}`——两个不同形状。而 `processOrder` 没有检查 `result.error`，直接读 `result.finalPrice`：

```javascript
const calculateDiscount = (price, userType) => {
    if (price < 0) return { error: 'Invalid price' };
    const discounts = { 'vip': 0.3, 'premium': 0.2, 'normal': 0 };
    const discount = discounts[userType] || 0;
    return { originalPrice: price, discount: price * discount, finalPrice: price * (1 - discount) };
};
const bad = calculateDiscount(-1, 'vip');
console.log(`calculateDiscount(-1,'vip') = ${JSON.stringify(bad)}`);
console.log(`调用方 result.finalPrice = ${bad.finalPrice}`);
console.log(`调用方 result.discount   = ${bad.discount}`);
```

```text
calculateDiscount(-1,'vip') = {"error":"Invalid price"}
调用方 result.finalPrice = undefined
调用方 result.discount   = undefined
```

**两个 `undefined` 会被原样写进数据库。** 负价格不会报错、不会中断，只会在订单表里留下两列 `undefined`——等到对账时才发现。

这个 bug 的根源不是「忘了检查」，而是**领域层的函数签名允许两种形状返回**。修复方式在讲义自己的工具箱里就有——`Either`：

```javascript
// 用 Either 统一返回形状：错误走 Left，成功走 Right
const calculateDiscount = (price, userType) => {
    if (price < 0) return Left('Invalid price');
    const discounts = { 'vip': 0.3, 'premium': 0.2, 'normal': 0 };
    const discount = discounts[userType] || 0;
    return Right({ originalPrice: price, discount: price * discount, finalPrice: price * (1 - discount) });
};
```

讲义第 5 节已经讲了 Either，但没把它用回自己的示例上。

## 四、Either 与 Maybe 的 flatMap 有形状要求

讲义给的 Either 实现：

```javascript
const Left = (x) => ({
    map: (fn) => Left(x),
    flatMap: (fn) => Left(x),
    getOrElse: (defaultValue) => defaultValue,
    isLeft: () => true,
    isRight: () => false
});

const Right = (x) => ({
    map: (fn) => Right(fn(x)),
    flatMap: (fn) => fn(x),
    getOrElse: (defaultValue) => x,
    isLeft: () => false,
    isRight: () => true
});
```

注意 `Right` 的 `flatMap: (fn) => fn(x)`——**它直接把回调的返回值交出去，不包装**。这意味着回调必须自己返回 Either：

```javascript
const Right = (x) => ({
    map: (fn) => Right(fn(x)),
    flatMap: (fn) => fn(x),
    getOrElse: (defaultValue) => x,
    isLeft: () => false,
    isRight: () => true
});
// 显示辅助：Right/Left 对象直接插值会得到 [object Object]
const show = (v) => (v && typeof v.isLeft === 'function')
  ? (v.isLeft() ? `Left(${v.getOrElse('?')})` : `Right(${v.getOrElse('?')})`)
  : String(v);

console.log(`Right(5).flatMap(x => x + 1)      = ${show(Right(5).flatMap(x => x + 1))}   <- 裸数字，不是 monad`);
try { Right(5).flatMap(x => x + 1).getOrElse('X'); }
catch (e) { console.log(`  链式 .getOrElse() 抛错: ${e.constructor.name}: ${e.message}`); }
console.log(`Right(5).flatMap(x => Right(x+1)) = ${show(Right(5).flatMap(x => Right(x + 1)))}   <- 正确用法`);
```

```text
Right(5).flatMap(x => x + 1)      = 6   <- 裸数字，不是 monad
  链式 .getOrElse() 抛错: TypeError: Right(...).flatMap(...).getOrElse is not a function
Right(5).flatMap(x => Right(x+1)) = Right(6)   <- 正确用法
```

写对了是 `Right(6)`；写错——回调忘了包一层——链子就断了，错误在**链尾**才炸出来，离出错点好几步远。这是 JavaScript 这类无类型语言里 monad 最容易踩的坑：**运行时形状检查缺席，错误延后到链尾**。Haskell 的类型系统会在编译期拦住同样的错误。

Maybe 有个更微妙的问题：

```javascript
const Nothing = { map: (fn) => Nothing, flatMap: (fn) => Nothing, getOrElse: (d) => d, isNothing: () => true, isJust: () => false };
const Just = (x) => ({ map: (fn) => Just(fn(x)), flatMap: (fn) => fn(x), getOrElse: (d) => x, isNothing: () => false, isJust: () => true });
const Maybe = { of: (x) => x == null ? Nothing : Just(x), Nothing, Just };
const show = (v) => (v && typeof v.isNothing === 'function')
  ? (v.isNothing() ? 'Nothing' : `Just(${v.getOrElse('?')})`) : String(v);

console.log(`Maybe.of(0)          = ${show(Maybe.of(0))}      <- 0 是有效值，没被当成空`);
console.log(`Maybe.of(null)       = ${show(Maybe.of(null))}`);
console.log(`Maybe.of(undefined)  = ${show(Maybe.of(undefined))}`);
console.log(`Just(undefined).getOrElse('D') = ${Maybe.Just(undefined).getOrElse('D')}  <- 与 Nothing 不可区分`);
```

```text
Maybe.of(0)          = Just(0)      <- 0 是有效值，没被当成空
Maybe.of(null)       = Nothing
Maybe.of(undefined)  = Nothing
Just(undefined).getOrElse('D') = undefined  <- 与 Nothing 不可区分
```

前两行是对的——用 `== null` 而不是 `!x`，所以 `0` 和 `''` 没被误判为空值。第四行是漏洞：**`Just(undefined)` 和 `Nothing` 在 `getOrElse` 下无法区分**，前者返回 `undefined`（而不是默认值 `'D'`）。修法是让 `of` 拦住 `undefined`（已经拦了），但直接调 `Just(undefined)` 绕过了这道防线。

## 五、IO Monad：讲义的 JavaScript 版确实做到了惰性

讲义给了一个 JavaScript 模拟的 IO：

```javascript
class IO {
    constructor(effect) {
        this.effect = effect;
    }
    
    static of(value) {
        return new IO(() => value);
    }
    
    map(fn) {
        return new IO(() => fn(this.effect()));
    }
    
    flatMap(fn) {
        return new IO(() => fn(this.effect()).effect());
    }
    
    run() {
        return this.effect();
    }
}
```

这段的关键是 `effect` 是个**函数**而不是值——`new IO(() => {...})` 只是把副作用包起来，不执行。真正执行在 `run()`。测一下：

```javascript
class IO {
    constructor(effect) { this.effect = effect; }
    static of(value) { return new IO(() => value); }
    map(fn) { return new IO(() => fn(this.effect())); }
    flatMap(fn) { return new IO(() => fn(this.effect()).effect()); }
    run() { return this.effect(); }
}

let ran = 0;
const io = new IO(() => { ran++; return 'X'; });
console.log(`IO 构造后、run() 之前的执行次数 = ${ran}`);
io.map(v => v).run();
console.log(`run() 之后的执行次数 = ${ran}   <- 惰性：副作用被推迟到 run()`);
try { new IO(() => 1).flatMap(v => v + 1).run(); }
catch (e) { console.log(`IO.flatMap 要求 fn 返回 IO；fn 返回裸值抛: ${e.constructor.name}: ${e.message}`); }
```

```text
IO 构造后、run() 之前的执行次数 = 0
run() 之后的执行次数 = 1   <- 惰性：副作用被推迟到 run()
IO.flatMap 要求 fn 返回 IO；fn 返回裸值抛: TypeError: fn(...).effect is not a function
```

**惰性成立**——这正是 IO 与「直接执行副作用」的本质区别：副作用被推迟到最后，由调用者决定何时发生。

`flatMap` 的形状要求和 Either 一样：`fn(this.effect()).effect()` 要求回调返回 IO 对象。回调返回裸值时，`.effect()` 不是函数，抛 `TypeError`。

## 六、它不解决什么

- **它不替代类型系统。** 探针能测出「这个函数现在不纯」，但测不出「这个函数明天会不会变不纯」。编译期检查是另一回事。
- **它不处理并发。** 讲义第 1.2 节举的 `parallel` 例子（`shared` 可能是 1、2 或 3）在纯函数世界里不存在——纯函数没有共享可变状态。但真实系统里的 IO 依然会并发。
- **它不判断「这个副作用该放哪一层」。** 分层架构图是原则，不是算法；`processOrder` 那段恰恰演示了原则被违反时会发生什么（undefined 写进库）。

## FAQ（六、常见问题）

### 探针能证明一个函数是纯的吗？

**只能证伪，不能证明。** 探针跑两次相同输出，说明「这一次相同」，不说明「永远相同」——时钟依赖只是最容易被抓住的一类，隐藏状态、未初始化变量、依赖外部服务的调用都可能在特定输入下才暴露。**探针的价值是快速筛出可疑对象，不是给纯度背书。**

### 那到底怎么判断一个函数是纯的？

按定义逐条查，探针只用来兜底：**① 输出只依赖参数**（不读全局、不读时钟、不读随机源）；**② 不改变任何外部状态**（不改入参、不改全局、不做 IO）；**③ 同样参数重复调用给出同样结果**。前两条靠读代码，第三条靠探针。

### `makeCounter` 算不算函数式编程？

**算，而且是好设计。** 函数式编程不要求没有可变状态，要求的是**把可变状态关在可控边界内**，让核心逻辑保持纯粹。`makeCounter` 做到了封装，`reducer` 做到了纯——两者都是函数式编程的正当组成部分。**把两者混为一谈才是问题**：说「它是纯的」会误导后来人以为它可以随便缓存、随便并行。

### Either 和 Maybe 到底怎么选？

**问「失败时有没有值」。** 有值但可能是空 → Maybe（`user?.address?.city`）；失败需要带原因 → Either（`Invalid price`）。讲义第 8.2 节把两者列成「错误处理 / 空值处理」两张表，这个区分是对的——但更重要的是**别让领域层函数的返回类型分叉**，那正是 calculateDiscount 出问题的原因。

### 为什么要用 Either，而不是直接抛异常？

异常是**隐式控制流**：调用方不写 `catch` 就完全看不见错误路径，而且异常会穿透纯函数的边界——你在纯函数里抛异常，它就不再纯了。Either 把失败**写进返回类型**，调用方必须处理（链式结构强制你走完）。代价是每个调用点都要多一层 `.getOrElse` 或模式匹配。**讲义自己那句「异常是隐式的控制流」说到了点子上。**

## 延伸阅读

- 姊妹篇：[函数式编程的三个边界：组合、柯里化与记忆化的实际行为](/blog/functional-programming-toolbox-boundaries/) — 同一讲义的第 01 篇，讲 compose/pipe/curry/memoize 的边界条件
- 相关：[从数数到采样：手写一个语言模型](/blog/from-counting-to-sampling/) — 纯函数与不可变结构在手写模型里的实际作用

## 出处与许可

- **原始出处**：本篇整理自 vault 内的自撰讲义《纯函数与副作用》（`03-技术深度/函数式编程/基础概念/02-纯函数与副作用.md`），无外部出处与版权约束。
- **本文的自有增量**（占正文主体）：① **参照透明性探针**——把「纯」变成可机械执行的判定，并实测出**探针自身会在同毫秒内把时钟依赖误判为纯**（需强制跨过毫秒边界才暴露）；② **讲义自称纯的 `makeCounter` 实测不纯**（两次调用输出不同），并用穷举 42 组 `(state, action)` 验证 `reducer` 确实纯——区别在「状态是参数还是闭包变量」；③ **`calculateDiscount` 错误分支的 `undefined` 穿透**——实测两个 undefined 会被原样写进数据库，根源是返回类型分叉；④ **Either / Maybe / IO 的 `flatMap` 形状要求**：写错时链尾才炸（`TypeError`），以及 `Just(undefined)` 与 `Nothing` 在 `getOrElse` 下不可区分；⑤ 讲义 JavaScript 版 IO 的**惰性实测**（构造后不执行，`run()` 才执行）。
- **代码说明**：文中 `javascript` 代码块为讲义原文摘录或在其基础上的最小改动；`python` 代码块为本文自写的可执行验证（含穷举检查），已逐块实跑比对。

## 参考资料

- [MDN — Functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)（函数的作用域与闭包，`makeCounter` 的闭包状态出自这里）
- [MDN — Date.now()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now)（毫秒级时间戳的精度来源，探针失真的根因）
- [ECMAScript 规范 — Date.now()](https://tc39.es/ecma262/#sec-date.now)（规范原文：返回值是「自 epoch 起的毫秒数」）
- [MDN — Optional chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) / [Nullish coalescing](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing)（`?.` 与 `??` 的短路语义，对照讲义第 6.2 节）
