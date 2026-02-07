---
title: "18. Unification 算法：逻辑编程的引擎"
date: 2026-02-07T21:00:00+08:00
draft: false
tags: ["Logic Programming", "Unification", "Pattern Matching", "Algorithm", "SICP"]
categories: ["SICP-Python"]
description: "SICP 4.5 核心内容：深入逻辑编程的底层机制——Unification 算法。了解解释器如何通过模式匹配和递归搜索来证明查询。"
---

# 第十八章：Unification 算法——逻辑编程的引擎

> "Unification is a general method of matching a query to a fact, each of which may contain variables."

在上一章中，我们体验了逻辑编程的魔法：只需定义事实和规则，计算机就能自动回答问题。今天，我们将揭开魔术的幕布，看看**逻辑解释器 (Query Interpreter)** 是如何工作的。

核心机制有两个：
1.  **Unification (统一化)**：判断两个表达式是否可以“相等”，并确定变量的值。
2.  **Search (搜索)**：在所有事实中查找满足条件的组合。

## 4.5.1 模式匹配 (Pattern Matching)

最简单的情况是**模式匹配**：一个包含变量的查询去匹配一个不含变量的事实。

*   **事实**：`(parent abraham barack)`
*   **查询**：`(parent abraham ?child)`

如果让 `?child = barack`，那么这两个列表就完全一样了。这就是一次成功的匹配。

在 Python 中，我们可以用递归函数来实现。

## 4.5.2 Unification 算法

Unification 是模式匹配的推广：**两个表达式都可以包含变量**。

例如：
*   表达式 A: `(?x ?x)`
*   表达式 B: `((a ?y c) (a b ?z))`

为了让 A 和 B 相等，我们需要：
1.  `?x` 必须等于 `(a ?y c)`
2.  `?x` 也必须等于 `(a b ?z)`

这就意味着 `(a ?y c)` 必须等于 `(a b ?z)`。
进而推导出：
*   `?y = b`
*   `?z = c`
*   `?x = (a b c)`

### 算法实现 (Python 伪代码)

`unify` 函数接收两个表达式 `e` 和 `f`，以及一个环境 `env`。它的目标是修改 `env`，使得 `e` 和 `f` 在该环境下相等。

```python
def unify(e, f, env):
    """
    尝试统一 e 和 f。如果成功返回 True 并更新 env，否则返回 False。
    """
    # 1. 如果是变量，先查找它的当前值
    e = lookup(e, env)
    f = lookup(f, env)
    
    # 2. 如果两者相等，统一成功
    if e == f:
        return True
        
    # 3. 如果 e 是变量，将 e 绑定到 f
    elif isvar(e):
        env.define(e, f)
        return True
        
    # 4. 如果 f 是变量，将 f 绑定到 e
    elif isvar(f):
        env.define(f, e)
        return True
        
    # 5. 如果其中一个是原子值（且不相等），统一失败
    elif is_atom(e) or is_atom(f):
        return False
        
    # 6. 如果都是列表（Pair），递归统一头部和尾部
    else:
        return unify(e.first, f.first, env) and \
               unify(e.second, f.second, env)
```

## 4.5.3 搜索过程 (The Search Procedure)

有了 `unify`，我们还需要一个搜索过程来遍历数据库。

当我们发起一个查询 `(query <clause1> <clause2> ...)` 时，解释器会：

1.  尝试在数据库中找到一个事实（或规则结论），能与 `<clause1>` **Unify** 成功。
2.  如果这是一个规则，我们需要递归地证明规则的**假设**也成立。
3.  如果 `<clause1>` 成立了，我们带着新的变量绑定，继续去证明 `<clause2>`。
4.  如果所有子句都证明成功，返回当前的变量绑定作为结果。

### 变量重命名

为了避免不同规则中的同名变量冲突（比如两个规则都用了 `?x`），每次使用规则前，我们需要将规则中的变量重命名为唯一标识符（例如 `?x_1`, `?x_2`）。

## 总结

逻辑编程解释器的核心就是一个**递归的深度优先搜索**，配合**Unification** 来进行状态检查和传递。

*   **Unification** 负责处理“局部”的匹配逻辑。
*   **Search** 负责处理“全局”的逻辑推导路径。

这展示了计算机科学中一个深刻的思想：**计算即推导 (Computation is Deduction)**。

---
*参考链接：*
*   [Composing Programs 4.5 Unification](https://www.composingprograms.com/pages/45-unification.html)
