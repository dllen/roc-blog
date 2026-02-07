---
title: "09. 对象抽象：接口与泛型操作"
date: 2026-02-07T12:00:00+08:00
draft: false
tags: ["Python", "SICP", "泛型", "多态", "接口", "魔术方法"]
categories: ["SICP-Python"]
description: "SICP 2.7 深入解析：从 `__str__` 与 `__repr__` 的区别切入，探讨 Python 的通用接口设计。如何实现跨越不同数据类型的泛型函数 (Generic Functions)？"
---

# 第九章：对象抽象——通用接口与泛型操作

> "A language that doesn't affect the way you think about programming, is not worth knowing." — Alan Perlis

在构建了对象系统之后，我们面临一个新的挑战：**如何让不同类型的对象协同工作？**
例如，我们希望 `add(x, y)` 既能计算 `1 + 2`，也能计算 `Complex(1, 2) + Complex(3, 4)`，甚至能处理 `Rational(1, 2) + 0.5` 这样的混合类型运算。

这就是本章的核心主题：**泛型操作 (Generic Operations)**。

## 2.7 对象抽象 (Object Abstraction)

### 2.7.1 字符串表示：`__repr__` vs `__str__`

Python 为对象提供了两种标准的字符串表示形式，这体现了**分层抽象**的思想：

1.  **`__repr__` (canonical representation)**：
    *   **目标**：准确、无歧义，最好能通过 `eval(repr(obj))` 还原对象。
    *   **受众**：开发者 (Developer)。
    *   **调用**：交互式解释器、`repr()` 函数。

2.  **`__str__` (human-readable representation)**：
    *   **目标**：可读性强，格式友好。
    *   **受众**：最终用户 (User)。
    *   **调用**：`print()`、`str()` 函数。

```python
class Rational:
    def __init__(self, n, d):
        self.numer = n
        self.denom = d

    def __repr__(self):
        return f"Rational({self.numer}, {self.denom})"

    def __str__(self):
        return f"{self.numer}/{self.denom}"

half = Rational(1, 2)
# >>> half
# Rational(1, 2)
# >>> print(half)
# 1/2
```

**多态的体现**：`print` 函数是一个**泛型函数**，它可以作用于任何实现了 `__str__` 方法的对象。

### 2.7.2 特殊方法 (Special Methods)

Python 的“魔术方法” (Magic Methods) 是实现通用接口的关键。通过实现特定的 `__method__`，我们可以让自定义对象表现得像内置类型一样。

*   **算术运算**：`__add__`, `__sub__`, `__mul__`
*   **布尔值**：`__bool__`
*   **长度**：`__len__`
*   **调用**：`__call__`

```python
class Complex:
    def __init__(self, real, imag):
        self.real = real
        self.imag = imag
    
    def __add__(self, other):
        return Complex(self.real + other.real, self.imag + other.imag)
    
    def __repr__(self):
        return f"Complex({self.real}, {self.imag})"

# >>> Complex(1, 2) + Complex(3, 4)
# Complex(4, 6)
```

这种机制被称为**接口 (Interface)**。只要对象遵守了协议（实现了特定方法），它就能被系统接纳。

### 2.7.3 多重表示与泛型函数 (Multiple Representations)

当我们需要处理多种数据类型（如复数的直角坐标表示和极坐标表示）时，有三种主要策略：

1.  **基于类型的分发 (Dispatch on Type)**：
    检查参数类型（`isinstance`），跳转到对应的处理逻辑。
    *优点*：简单直接。
    *缺点*：违反开闭原则，每增加新类型都要修改核心函数。

2.  **数据导向编程 (Data-Directed Programming)**：
    维护一个二维表格 `(操作, 类型)`，查表执行。
    这是大型系统常用的插件式架构基础。

3.  **消息传递 (Message Passing)**：
    即 OOP 的方法调用。对象自己决定如何处理操作。

### 2.7.4 强制转换 (Coercion)

如果我们要计算 `Rational(1, 2) + 0.5` 怎么办？
一种方法是**强制转换**：将低精度的类型（有理数）升级为高精度的类型（浮点数），然后运算。

```python
def add_complex_and_rational(c, r):
    return Complex(c.real + r.numer/r.denom, c.imag)
```

在 Python 中，这通常通过 `__radd__` (右加) 和类型检查来实现混合算术运算。

## 总结

**泛型操作**是构建可扩展系统的关键。
*   通过标准接口（如 `__str__`），我们统一了不同对象的行为。
*   通过多态和分发机制，我们实现了代码的解耦。

这是《SICP》第二部分“数据抽象”的最高潮：我们不仅抽象了数据，还抽象了**操作数据的操作**。

---
*注：Composing Programs 2.8 (Efficiency) 和 2.9 (Recursive Objects) 将作为本部分的补充阅读，接下来我们将进入激动人心的第三部分。*
