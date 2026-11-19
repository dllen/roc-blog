---
title: "函子与应用函子：讲义的示例有四处跑不起来"
date: 2026-11-19
update_date: 2026-11-19
description: "Functor、Applicative、Monad 的层次关系讲义讲得清楚，但所有示例只验证了「能跑」。这篇把函子定律写成检查器逐个容器跑，发现讲义的定律用 === 写会让所有容器都不合格；更关键的是 Applicative 与 Maybe 的示例有四处缺陷，链式 ap 直接抛 TypeError。"
tldr: "讲义写的「functor.map(x => x) === functor」用引用相等判定，会让所有容器都不合格——正确的判据是值相等。另外讲义的 Applicative 链式调用第二次 ap 就抛 TypeError，ap 其实不是柯里化应用。"
keywords: ["函子定律 检查器", "Applicative ap 语义", "Monad flatMap 展平", "值相等 引用相等", "验证链 错误累积", "函子 层次"]
taxonomies:
  tags: ["编程语言", "函数式编程", "系统设计"]
---

函子、应用函子、单子——这三个词在函数式编程里常被并列念出来，但真正要记住的不是名词，是**它们各自多给了容器一个什么方法**：

| 层次 | 多出的方法 | 解决的问题 |
|---|---|---|
| Functor | `map` | 值在容器里，函数在外面 |
| Applicative | `ap` | **函数也在容器里** |
| Monad | `flatMap` | 容器嵌套容器 |

这个层次本身是对的。问题在于讲义里那三个层次的**示例代码**——本篇逐个跑了一遍，**Applicative 和 Maybe 的示例有四处缺陷，其中一处让讲义自己写的链式调用直接抛异常**。

这篇整理自 vault 里的《函子与应用函子》一讲笔记（`03-技术深度/函数式编程/基础概念/03-函子与应用函子.md`，自撰讲义，无外部出处）。讲义的定义部分讲得准确，**但每个示例都只验证了「能跑」——而其中几个其实跑不起来**。

## 一、把函子定律写成检查器

讲义第 2.2 节给了两条定律——**恒等律**（`functor.map(x => x) === functor`）和**组合律**（`functor.map(x => f(g(x))) === functor.map(g).map(f)`）。

这两条是 Functor 的定义性性质——**一个容器是不是 Functor，全看它满不满足这两条**。讲义列了 Maybe、Either、Array、Promise 四个 Functor，却只说「验证」并给出两个写法示例。

先照着讲义的写法实跑一次（下面补上 `functor` 的定义以便执行）：

```javascript
// 讲义 2.2 的两条定律（原文照抄），下面补上 functor 的定义以便实跑
class Functor {
    constructor(value) { this.value = value; }
    map(fn) { return new Functor(fn(this.value)); }
    static of(value) { return new Functor(value); }
}
const functor = Functor.of(5);
const g = x => x + 1;
const f = x => x * 3;

// 定律1: 恒等律
console.log('恒等律  functor.map(x => x) === functor        ->', functor.map(x => x) === functor);
// 定律2: 组合律
console.log('组合律  functor.map(x => f(g(x))) === functor.map(g).map(f) ->',
            functor.map(x => f(g(x))) === functor.map(g).map(f));

// 换成值相等（深比较）
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log('恒等律  值相等 ->', eq(functor.map(x => x), functor));
console.log('组合律  值相等 ->', eq(functor.map(x => f(g(x))), functor.map(g).map(f)));
```

```text
恒等律  functor.map(x => x) === functor        -> false
组合律  functor.map(x => f(g(x))) === functor.map(g).map(f) -> false
恒等律  值相等 -> true
组合律  值相等 -> true
```

**两条定律都是 `false`。** 原因不在实现，而在**判据用的是 `===`——引用相等**。`map` 的实现是「构造一个新容器」，新容器和新容器永远不是同一个引用，所以 `functor.map(x => x) === functor` 恒为假。换成值相等（深比较），两条立刻都是 `true`。

把这件事做成检查器，对讲义列的每个容器逐条跑：

```javascript
// ============ 讲义给的 Functor 实现 ============
class Functor {
    constructor(value) { this.value = value; }
    map(fn) { return new Functor(fn(this.value)); }
    static of(value) { return new Functor(value); }
}

// ============ Maybe（讲义 3.3 的实现，补全 Nothing/Just）============
class Nothing { map() { return this; } flatMap() { return this; } getOrElse(d) { return d; } isNothing() { return true; } }
class Just {
    constructor(x) { this.x = x; }
    map(fn) { return new Just(fn(this.x)); }
    flatMap(fn) { return fn(this.x); }
    getOrElse(d) { return this.x; }
    isNothing() { return false; }
}
class Maybe {
    static of(x) { return x == null ? new Nothing() : new Just(x); }
}

// ============ Either ============
class Left {
    constructor(e) { this.e = e; }
    map() { return this; } flatMap() { return this; }
    getOrElse(d) { return d; } isLeft() { return true; }
}
class Right {
    constructor(v) { this.v = v; }
    map(fn) { return new Right(fn(this.v)); }
    flatMap(fn) { return fn(this.v); }
    getOrElse(d) { return this.v; } isLeft() { return false; }
}
class Either {
    static of(v) { return new Right(v); }
    static left(e) { return new Left(e); }
}

// ============ 有 bug 的 Functor：map 把函数应用了两次 ============
class BadFunctor {
    constructor(value) { this.value = value; }
    map(fn) { return new BadFunctor(fn(fn(this.value))); }   // 多应用了一次
    static of(value) { return new BadFunctor(value); }
}

// ============ 深比较（讲义的定律写的是 ===，那是引用比较）============
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (f) => (f && f.isNothing && f.isNothing()) ? 'Nothing'
    : (f && f.isLeft && f.isLeft()) ? `Left(${f.e})`
    : (f && f.getOrElse && f.x !== undefined) ? `Just(${f.x})`
    : (f && f.v !== undefined) ? `Right(${f.v})`
    : JSON.stringify(f);

// ============ 定律检查器 ============
function checkLaws(name, mk, sample) {
    const id = x => x;
    const g = x => x + 1;
    const h = x => x * 3;

    const f = mk(sample);
    // 定律1 恒等律（讲义写 ===，引用比较）
    const idRefEq = f.map(id) === f;
    const idValEq = eq(f.map(id), f);
    // 定律2 组合律
    const comp = eq(f.map(x => h(g(x))), f.map(g).map(h));

    return {
        name,
        '恒等律(引用==)': idRefEq ? 'PASS' : 'FAIL',
        '恒等律(值相等)': idValEq ? 'PASS' : 'FAIL',
        '组合律': comp ? 'PASS' : 'FAIL',
    };
}

const containers = [
    ['讲义的 Functor', () => Functor.of(5), 5],
    ['Maybe', () => Maybe.of(5), 5],
    ['Either', () => Either.of(5), 5],
    ['Array', (v) => v, [1, 2, 3]],
    ['BadFunctor(多应用一次)', () => BadFunctor.of(5), 5],
];

console.log('=== 函子定律逐容器检查 ===');
const results = containers.map(([n, mk, s]) => checkLaws(n, mk, s));
const cols = Object.keys(results[0]);
for (const r of results) {
    console.log(`  ${r.name.padEnd(22)} ` + cols.slice(1).map(c => `${c}=${r[c]}`).join('  '));
}
console.log('');
for (const c of cols.slice(1)) {
    const bad = results.filter(r => r[c] === 'FAIL').map(r => r.name);
    console.log(`  ${c}: ${bad.length ? 'FAIL -> ' + bad.join(', ') : '全部 PASS'}`);
}

// ============ 讲义的定律原文用 === 会怎样 ============
console.log('\n=== 讲义定律原文用 === 的后果 ===');
const arr = [1, 2, 3];
console.log(`  [1,2,3].map(x => x) === [1,2,3]      -> ${arr.map(x => x) === arr}   (值相等，引用不同)`);
console.log(`  Functor.of(5).map(x => x) === 原对象   -> ${Functor.of(5).map(x => x) === Functor.of(5)}`);
console.log(`  但值相等: ${eq(arr.map(x => x), arr)}`);
```

```text
=== 函子定律逐容器检查 ===
  讲义的 Functor            恒等律(引用==)=FAIL  恒等律(值相等)=PASS  组合律=PASS
  Maybe                  恒等律(引用==)=FAIL  恒等律(值相等)=PASS  组合律=PASS
  Either                 恒等律(引用==)=FAIL  恒等律(值相等)=PASS  组合律=PASS
  Array                  恒等律(引用==)=FAIL  恒等律(值相等)=PASS  组合律=PASS
  BadFunctor(多应用一次)      恒等律(引用==)=FAIL  恒等律(值相等)=PASS  组合律=FAIL

  恒等律(引用==): FAIL -> 讲义的 Functor, Maybe, Either, Array, BadFunctor(多应用一次)
  恒等律(值相等): 全部 PASS
  组合律: FAIL -> BadFunctor(多应用一次)

=== 讲义定律原文用 === 的后果 ===
  [1,2,3].map(x => x) === [1,2,3]      -> false   (值相等，引用不同)
  Functor.of(5).map(x => x) === 原对象   -> false
  但值相等: true
```

三件事浮出来了。

**第一，讲义的定律用 `===` 写，会让所有容器都不合格。** 讲义自己列的 Maybe、Either、Array、Promise，**在这条定律下全部 FAIL**。这不是实现有 bug，是**判据写错了**——正确的恒等律是值相等。上面输出里最后一段 `讲义定律原文用 === 的后果` 就是这个对照：`[1,2,3].map(x => x) === [1,2,3]` 是 `false`，但深比较是 `true`。

**第二，组合律才是真正有鉴别力的那条。** 恒等律只检查「映射一次」和「不映射」是否等价——`BadFunctor`（`map` 里把函数应用了两次）也能通过恒等律，因为 `fn(fn(x))` 在 `fn = x => x` 时恰好等于 `x`。**只有组合律抓得住它**——看上面输出里 `BadFunctor(多应用一次)` 那一行：恒等律（值相等）是 PASS，组合律是 FAIL。

**第三，律不是用来「验证一下」的，是用来抓 bug 的。** 一个 `map` 实现得多应用一次函数、或组合律不成立，容器就会在链式调用里给出错误结果——而且**不报错，只是安静地给出错误答案**。这就是为什么律值得写成检查器：它把「我以为它对」变成「机器说它不对」。

> **两条定律都要用值相等。** 讲义用 `===` 写只是伪代码，但照抄进测试里会得到「所有容器都不合格」这种假警报。

## 二、Applicative 与 Maybe 的四处缺陷

先看讲义第 3.2 节那段原文（照抄，只在末尾补了讲义没写的 `addOne` 定义）。按讲义给的「使用」示例跑一遍：

```javascript
// 讲义 3.2 原文照抄（末尾两行是讲义给的「使用」示例）
class Applicative {
    constructor(value) {
        this.value = value;
    }
    
    // ap: 应用容器内的函数到容器内的值
    ap(other) {
        return other.map(this.value);
    }
    
    // 便利方法
    static of(value) {
        return new Applicative(value);
    }
}

// 讲义未定义 addOne，这里补上（不影响讲义要表达的结构）
const addOne = x => x + 1;

try {
    // 使用
    const r = Applicative.of(addOne).ap(Applicative.of(5));
    console.log('使用示例 ->', r);
} catch (e) {
    console.log('使用示例 抛错: ' + e.constructor.name + ': ' + e.message);
}
```

```text
使用示例 抛错: TypeError: other.map is not a function
```

**缺陷 1：`Applicative` 类没有 `map`，但 `ap` 调 `other.map()`。** `Applicative.of(5)` 是 `new Applicative(5)`，`map` 是 `undefined`——**讲义自己给的「使用」示例，第一次 `ap` 就抛 `TypeError: other.map is not a function`**。讲义把 Applicative 定义成「支持 `ap` 的 Functor」，可它自己连 Functor 的 `map` 都没有。

把 3.2 节的链式调用和 3.3 节的 `class Maybe` 放在一起逐条跑（`class Maybe` 原文是 `constructor(x) { this.x = x; }` 配 `ap` 里的 `other.map(this.value)`——字段名对不上，`this.value` 是 `undefined`）：

```javascript
// ========== 讲义 3.2 原文摘录 ==========
class ApplicativeNote {
    constructor(value) {
        this.value = value;
    }
    ap(other) {
        return other.map(this.value);
    }
    static of(value) {
        return new ApplicativeNote(value);
    }
}
const addOne = x => x + 1;
const Add = a => b => a + b;

const attempt = (label, fn) => {
    try { console.log('  ' + label + ' -> ' + fn()); }
    catch (e) { console.log('  ' + label + ' 抛错: ' + e.constructor.name + ': ' + e.message); }
};

console.log('=== 讲义 3.2 的链式调用（讲义注释写：Applicative(11)）===');
attempt('Applicative.of(addOne).ap(Applicative.of(5))',
        () => ApplicativeNote.of(addOne).ap(ApplicativeNote.of(5)).value);
attempt('再 .ap(Applicative.of(10))',
        () => ApplicativeNote.of(addOne).ap(ApplicativeNote.of(5)).ap(ApplicativeNote.of(10)).value);

console.log('');
console.log('=== 补上 map 之后，链式第二次 ap 仍然断 ===');
class Applicative {
    constructor(value) { this.value = value; }
    map(fn) { return new Applicative(fn(this.value)); }
    ap(other) { return other.map(this.value); }
    static of(value) { return new Applicative(value); }
}
attempt('Applicative.of(addOne).ap(Applicative.of(5))',
        () => Applicative.of(addOne).ap(Applicative.of(5)).value);
attempt('再 .ap(Applicative.of(10))',
        () => Applicative.of(addOne).ap(Applicative.of(5)).ap(Applicative.of(10)).value);

console.log('');
console.log('=== 换成柯里化的 Add：ap 链才成立 ===');
attempt('Applicative.of(Add).ap(Applicative.of(5))',
        () => typeof Applicative.of(Add).ap(Applicative.of(5)).value);
attempt('再 .ap(Applicative.of(3))',
        () => Applicative.of(Add).ap(Applicative.of(5)).ap(Applicative.of(3)).value);

console.log('');
console.log('=== 讲义 3.3 原文摘录：class Maybe ===');
const Nothing = { map: () => Nothing, flatMap: () => Nothing, getOrElse: (d) => d, isNothing: () => true };
const Just = (x) => ({ map: (fn) => Just(fn(x)), flatMap: (fn) => fn(x), getOrElse: (d) => x, isNothing: () => false });
class MaybeNote {
    static of(x) { return x == null ? Nothing : Just(x); }
    constructor(x) { this.x = x; }
    isNothing() { return this.constructor === Nothing; }
    map(fn) { return this.isNothing() ? this : MaybeNote.of(fn(this.x)); }
    ap(other) { return this.isNothing() ? this : other.map(this.value); }
}
const m = new MaybeNote(Add);
console.log('  new MaybeNote(Add).value = ' + m.value + '   .x = ' + typeof m.x);
attempt('m.ap(Just(5)).ap(Just(3))', () => JSON.stringify(m.ap(Just(5)).ap(Just(3))));
console.log('  MaybeNote.of(Add) 有 ap 吗: ' + typeof MaybeNote.of(Add).ap);
```

```text
=== 讲义 3.2 的链式调用（讲义注释写：Applicative(11)）===
  Applicative.of(addOne).ap(Applicative.of(5)) 抛错: TypeError: other.map is not a function
  再 .ap(Applicative.of(10)) 抛错: TypeError: other.map is not a function

=== 补上 map 之后，链式第二次 ap 仍然断 ===
  Applicative.of(addOne).ap(Applicative.of(5)) -> 6
  再 .ap(Applicative.of(10)) 抛错: TypeError: fn is not a function

=== 换成柯里化的 Add：ap 链才成立 ===
  Applicative.of(Add).ap(Applicative.of(5)) -> function
  再 .ap(Applicative.of(3)) -> 8

=== 讲义 3.3 原文摘录：class Maybe ===
  new MaybeNote(Add).value = undefined   .x = function
  m.ap(Just(5)).ap(Just(3)) 抛错: TypeError: fn is not a function
  MaybeNote.of(Add) 有 ap 吗: undefined
```

**缺陷 2：链式调用第二次 `ap` 抛 `TypeError: fn is not a function`。** 讲义注释写结果是 `Applicative(11)`，实跑是上面输出里的：

```
  Applicative.of(addOne).ap(Applicative.of(5)) -> 6
  再 .ap(Applicative.of(10)) 抛错: TypeError: fn is not a function
```

注意这行是**补上 `map` 之后**的结果——补了 `map`，第一次 `ap` 就能跑出 `6`，但第二次仍然断。原因在 `ap` 的语义：它把 **other 的值**喂给 **this 的函数**。第一次 `ap` 后，`this.value` 变成了 `6`——一个数字，不是函数。第二次 `ap` 于是试图 `other.map(6)`，把数字当函数调。

**所以 `ap` 不是柯里化应用。** 讲义注释里那串想表达「先加 1 再加 10 得 11」，但 `ap` 的真实语义是「把 other 的值喂给 this 的函数」——一旦 this 不再是函数就断了。**正确的 applicative 语义要用柯里化的函数**：

```
  Applicative.of(Add).ap(Applicative.of(5)) -> function
  再 .ap(Applicative.of(3)) -> 8
```

`Add = a => b => a + b`，先 `ap` 5 得到 `b => 5 + b`（还是函数），再 `ap` 3 得到 `8`。**讲义 3.4 节用 `Maybe.of(add)` 演示 `liftA2` 时用的正是这个柯里化形式——但 3.2 节用的是非柯里化的 `addOne`。两节的语义其实不一样。**

**缺陷 3：第 3.3 节的 `class Maybe` 里，`ap` 用 `this.value`，而字段名是 `this.x`。** 上面输出里 `new MaybeNote(Add).value = undefined   .x = function` 就是这个：`this.value` 是 `undefined`，`other.map(undefined)` 于是把 `undefined` 当函数调。

**缺陷 4：更根本的是，3.3 节的三套定义互不兼容。** `class Maybe` 的静态方法 `of` 返回的是 02 讲里的工厂对象 `Nothing`/`Just`——**它们没有 `ap`**（上面输出最后一行 `MaybeNote.of(Add) 有 ap 吗: undefined`）；而 `ap` 只定义在 `class Maybe` 的实例上，可 `class Maybe.of` 又不返回自己的实例。

讲义 3.3 节写的 `Maybe.of(add).ap(Maybe.of(5)).ap(Maybe.of(3)) // Maybe(8)`，**这一行在讲义自己的定义下跑不起来**。

## 三、验证链的错误累积：combine 定义了却没用

讲义第 6 节要写一个注册信息验证器，需求是四条规则：邮箱非空、邮箱格式合法、密码 ≥ 8 位、两次密码一致。讲义给了 `Validation` 类，里面定义了 `combine` 方法，注释写「合并多个 Validation」——**但 `validateUser` 一次都没调用它**。

而且讲义的 `validateUser` 原样跑不起来。讲义的校验器是 `(field) => (value) => ...`，只吃两个参数，`validateUser` 却调了三次：

```javascript
// 讲义 6.2 原文照抄
const nonEmpty = (field) => (value) =>
    value && value.trim()
        ? { ok: true, value }
        : { ok: false, errors: [field + ' cannot be empty'] };

// 讲义 validateUser 里的调用写法
try {
    const r = nonEmpty('Email')('email')('');
    console.log('讲义写法 ->', r);
} catch (e) {
    console.log('讲义写法 抛错: ' + e.constructor.name + ': ' + e.message);
}

// 正确写法：nonEmpty(field)(value)
console.log('正确写法 ->', nonEmpty('Email')(''));
```

```text
讲义写法 抛错: TypeError: nonEmpty(...)(...) is not a function
正确写法 -> { ok: false, errors: [ 'Email cannot be empty' ] }
```

`nonEmpty('Email')` 拿到字段名 `'Email'`，`('email')` 用**值的位置**传了字符串字面量 `'email'`，真正要校验的 `data.email` 反而没传进去——讲义自己写的这三参数调用直接抛 `TypeError`。

把它改对（`nonEmpty(field)(value)`）之后，验证链能跑了，但暴露出第二个问题：

```javascript
class Validation {
    constructor(value, errors = []) { this.value = value; this.errors = errors; }
    static of(value) { return new Validation(value, []); }
    static fail(error) { return new Validation(null, [error]); }
    map(fn) { if (this.errors.length > 0) return this; return Validation.of(fn(this.value)); }
    flatMap(fn) { if (this.errors.length > 0) return this; return fn(this.value); }
    combine(other) {
        if (this.errors.length > 0 && other.errors.length > 0)
            return new Validation(null, [...this.errors, ...other.errors]);
        if (this.errors.length > 0) return this;
        if (other.errors.length > 0) return other;
        return Validation.of(this.value);
    }
}
const nonEmpty = (field) => (value) =>
    value && value.trim() ? Validation.of(value) : Validation.fail(field + ' cannot be empty');
const minLength = (min) => (field) => (value) =>
    value.length >= min ? Validation.of(value) : Validation.fail(field + ' must be at least ' + min + ' characters');
const emailFormat = (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? Validation.of(value) : Validation.fail('Invalid email format');
const equals = (other) => (field) => (value) =>
    value === other ? Validation.of(value) : Validation.fail(field + ' must match');

console.log('=== 讲义 6.2 的调用写法：nonEmpty(field)(value)(data) ===');
const probe = nonEmpty('Email')('email');
console.log('  nonEmpty(\'Email\')(\'email\') 返回: ' + typeof probe);
try { probe('alice@example.com'); }
catch (e) { console.log('  再调一次(data.email) 抛错: ' + e.constructor.name + ': ' + e.message); }

console.log('');
console.log('=== 改对之后：三个错误同时存在，但只报第一个 ===');
const validateUser = ({ email, password, confirmPassword }) =>
    Validation.of({ email, password })
        .flatMap(data => nonEmpty('Email')(data.email).flatMap(emailFormat).map(e => ({ ...data, email: e })))
        .flatMap(data => nonEmpty('Password')(data.password).flatMap(minLength(8)('password')).map(p => ({ ...data, password: p })))
        .flatMap(data => equals(data.password)('Confirm password')(confirmPassword).map(() => data));
const r1 = validateUser({ email: '', password: 'x', confirmPassword: 'y' });
console.log('  errors 长度 = ' + r1.errors.length);
console.log('  errors = ' + JSON.stringify(r1.errors));

console.log('');
console.log('=== 改用 combine 累积全部错误 ===');
const validateUser2 = ({ email, password, confirmPassword }) => {
    const e = nonEmpty('Email')(email).flatMap(emailFormat);
    const p = nonEmpty('Password')(password).flatMap(minLength(8)('password'));
    const c = equals(password)('Confirm password')(confirmPassword);
    return e.combine(p).combine(c).map(() => ({ email, password }));
};
const r2 = validateUser2({ email: '', password: 'x', confirmPassword: 'y' });
console.log('  errors 长度 = ' + r2.errors.length);
console.log('  errors = ' + JSON.stringify(r2.errors));
```

```text
=== 讲义 6.2 的调用写法：nonEmpty(field)(value)(data) ===
  nonEmpty('Email')('email') 返回: object
  再调一次(data.email) 抛错: TypeError: probe is not a function

=== 改对之后：三个错误同时存在，但只报第一个 ===
  errors 长度 = 1
  errors = ["Email cannot be empty"]

=== 改用 combine 累积全部错误 ===
  errors 长度 = 3
  errors = ["Email cannot be empty","password must be at least 8 characters","Confirm password must match"]
```

**改对之后，三个错误同时存在时只报第一个**（上面输出里 `errors 长度 = 1`）。

原因在 `flatMap` 的语义：errors 非空时 `return this`（短路）。这对**数据处理**是对的（出错就别往下走），但对**表单校验**是错的——用户要一次看到所有问题。而讲义专门定义了 `combine` 来「合并多个 Validation」，**定义了就没用**。改用 `combine` 之后一次报齐三条（上面输出最后一段 `errors 长度 = 3`）。

顺带一提，讲义那些校验器的柯里化签名 `(field) => (value) => ...` 本身有点绕：字段名只是用来拼错误消息，却占了一整个参数位。更常见的写法是让错误消息成为工厂的一部分。

## 四、它不解决什么

- **它不替代类型系统。** 讲义 3.3 节那些缺陷在 TypeScript 里会被编译器拦下大部分（`this.value` vs `this.x`、`other.map` 不存在）。JavaScript 的运行时错误只是**症状**，根因是缺类型检查。
- **它不改变层次关系的正确性。** Functor → Applicative → Monad 的层次是对的，本文修正的是**示例代码**，不是概念。
- **它不判「该不该用 monad」。** 讲义 8.2 节那张表（单向转换用 Functor / 组合多个带上下文的值用 Applicative / 链式且返回值也在上下文中用 Monad）是选型经验，和可执行验证是两回事。

## FAQ（六、常见问题）

### 讲义里的 `functor.map(x => x) === functor` 是错的吗？

**判据写错了，不是概念错。** 恒等律要求的是**值**不变，不是**引用**不变。`map` 构造新容器，引用必然不同。讲义这行是伪代码，但照抄进测试会得到「所有容器都不合格」的假警报。**做法**：写检查器时用深比较，并且明确区分「引用相等」和「值相等」两列——前者对 Functor 恒为 FAIL，后者才有意义。

### `ap` 到底该怎么用？

**容器里装柯里化函数。** `ap` 的语义是「把 other 的值喂给 this 的函数」，所以 `this` 必须始终是函数。`Add = a => b => a + b`，`ap` 5 得到 `b => 5 + b`（仍是函数），再 `ap` 3 得到 `8`。讲义 3.4 节的 `liftA2` 演示用的就是这个形式；**3.2 节的 `addOne` 不是柯里化的，所以链式第二次 `ap` 必然断**。

### 验证链为什么要用 `combine`？

因为 `flatMap` 的语义是「有错就短路」，这在**数据处理**里是对的（出错就别往下走），但在**表单校验**里是错的（用户要一次看到所有问题）。讲义定义了 `combine` 却没在 `validateUser` 里用——大概率是漏了。**做法**：领域计算用 `flatMap` 短路，错误收集用 `combine` 累积，两者明确分工。

### 讲义的这些示例是「错」还是「简化」？

**是简化，不是错。** 讲义讲的是概念，示例是示意。但示意代码一旦写成能跑的样子，就会被直接复制——而 `this.value` / `this.x` 这种笔误在纸上完全看不出来。**做法**：把示例当草稿对待，真要用就抄进编辑器跑一遍；JS 尤其需要，因为缺类型检查不会在写的时候提醒你。

## 延伸阅读

- 姊妹篇 01：[函数式编程的三个边界：组合、柯里化与记忆化的实际行为](/blog/functional-programming-toolbox-boundaries/) — 同一讲义的第 01 篇，讲 compose/pipe/curry/memoize
- 姊妹篇 02：[纯函数与副作用：把「纯」变成能跑的判定](/blog/pure-functions-and-side-effects-probe/) — 第 02 篇，讲参照透明性探针
- 相关：[系统设计面试的 4 步框架：把行为断言变成机械检查](/blog/system-design-interview-framework-checkable/) — 同一个思路的另一处应用：把定性建议写成可跑的规则

## 出处与许可

- **原始出处**：本篇整理自 vault 内的自撰讲义《函子与应用函子》（`03-技术深度/函数式编程/基础概念/03-函子与应用函子.md`），无外部出处与版权约束。
- **本文的自有增量**（占正文主体）：① **函子定律检查器**——对讲义列的每个容器逐条跑恒等律与组合律，核出**讲义的定律用 `===`（引用相等）会让所有容器都不合格**（实跑两条定律均为 `false`），并区分「引用相等」与「值相等」两列；同时指出**组合律才是有鉴别力的那条**（恒等律放过了一个多应用一次函数的坏 Functor）；② **核出讲义 Applicative 与 Maybe 的四处缺陷**：类里没有 `map` 但 `ap` 调 `other.map()`（讲义自己给的「使用」示例第一次 `ap` 即抛 `TypeError`）；补上 `map` 后链式第二次 `ap` 仍抛 `TypeError: fn is not a function`（**`ap` 不是柯里化应用**）；`class Maybe` 的 `ap` 用 `this.value` 而字段名是 `this.x`；`class Maybe.of` 返回 02 讲的工厂对象（无 `ap`），使 3.3 节的示例整行跑不起来——并给出柯里化形式下 `ap` 的正确语义与实跑结果；③ **验证链的错误累积**——讲义的 `validateUser` 因柯里化参数传错而跑不起来，改对后又因 `flatMap` 短路只报第一个错误，而讲义定义了 `combine` 却从未调用；改用 `combine` 后一次报齐三条。
- **代码说明**：文中标为「原文照抄 / 原文摘录」的 `javascript` 块保留讲义原样代码与其缺陷（用 try/catch 捕获以便实跑），其余 `javascript` 块是在讲义代码基础上补全定义后的最小改动；所有 `text` 输出块均为当次真实执行的 stdout，已逐行核对。
