---
title: "02. 定义函数与控制流：掌握程序的控制权"
date: 2026-02-07T10:15:00+08:00
draft: false
tags: ["Python", "SICP", "函数定义", "控制流", "斐波那契"]
categories: ["SICP-Python"]
description: "SICP Python版 1.3-1.5：深入理解如何定义函数、使用环境图分析函数调用、编写高质量的文档字符串，以及掌握 if/while 控制流和布尔逻辑。"
---

# 第二章：定义函数与控制流

> "Software design is an exercise in human communication."

在掌握了基本的表达式和内置函数调用后，我们需要迈出关键的一步：**定义自己的函数**。这赋予了我们将复杂操作命名、抽象并重复使用的能力。同时，为了让程序不再只是从头执行到尾，我们需要引入**控制流**。

## 1.3 定义新函数 (Defining New Functions)

在 Python 中，我们使用 `def` 语句来定义函数。

```python
def square(x):
    return x * x
```

这里发生了两件事：
1.  创建了一个新的函数对象（代码逻辑）。
2.  将名字 `square` 绑定到这个函数对象上。

### 1.3.1 环境图 (Environment Diagrams) —— 理解程序运行的关键

SICP 最强调的工具之一就是**环境图**。当你调用一个自定义函数时，不仅仅是“跳转代码”，而是发生了一系列精确的步骤：

例如执行 `square(10)`：

1.  **创建新帧 (New Frame)**：创建一个新的局部环境（Local Frame）。
2.  **绑定参数 (Bind Arguments)**：在这个新帧中，将参数名 `x` 绑定到实参值 `10`。
3.  **执行函数体 (Execute Body)**：在这个新环境中执行函数体代码。

```text
Global frame
    square: func square(x)
    
f1: square [parent=Global]
    x: 10
    Return value: 100
```

这种“局部环境”的概念解释了为什么函数内的变量不会污染全局变量。

## 1.4 设计函数 (Designing Functions)

写出能跑的代码很容易，写出**好**的代码很难。SICP 在早期就引入了软件工程的设计原则。

### 1.4.1 文档字符串 (Docstrings)

Python 提倡代码即文档。每个函数的第一行应该是一个字符串，用来描述函数的行为。

```python
def pressure(v, t, n):
    """Compute the pressure in pascals of an ideal gas.

    Applies the ideal gas law: http://en.wikipedia.org/wiki/Ideal_gas_law

    v -- volume of gas, in cubic meters
    t -- absolute temperature in degrees kelvin
    n -- particles of gas
    """
    k = 1.38e-23  # Boltzmann's constant
    return n * k * t / v
```

你可以通过 `help(pressure)` 来查看这些信息。

### 1.4.2 函数设计原则

1.  **单一职责 (Do One Thing)**：每个函数应该只负责一个具体的任务。如果你发现函数名包含了 "and"（例如 `calculate_and_print`），这通常是个坏兆头。
2.  **不要重复自己 (DRY - Don't Repeat Yourself)**：如果发现自己在复制粘贴代码，就应该将其抽象为一个函数。
3.  **通用性 (Generalize)**：尽量让函数处理一般情况，而不是特殊情况（例如写 `square(x)` 而不是 `square_10()`）。

## 1.5 控制流 (Control)

到目前为止，我们的程序都是顺序执行的。控制语句允许我们根据条件改变执行路径。

### 1.5.1 Print vs Return

这是初学者最容易混淆的概念。

*   **Return**：函数的**结果**。程序后续可以使用这个值。
*   **Print**：函数的**副作用**（在屏幕上显示）。程序后续**无法**使用这个显示的内容。

```python
def f_return():
    return 10

def f_print():
    print(10)

x = f_return() + 10  # 正常，x 变为 20
y = f_print() + 10   # 报错！因为 f_print() 返回 None，None 不能和 10 相加
```

### 1.5.2 条件语句与布尔逻辑

Python 使用 `if`, `elif`, `else` 进行分支控制。

有趣的是 Python 的逻辑运算符 `and` 和 `or` 具有**短路 (Short-circuit)** 特性：

```python
>>> True or 1/0
True
```
这里 `1/0` 不会报错，因为 `True or ...` 已经确定结果为 `True`，Python 就不会去计算后面那个会报错的表达式了。

### 1.5.3 迭代 (Iteration) 与 实战案例

`while` 循环让我们能够重复执行代码。让我们通过两个经典数学问题来演练：

**案例 1：斐波那契数列 (Fibonacci Sequence)**

斐波那契数列是：0, 1, 1, 2, 3, 5, 8, 13, ...
每个数是前两个数之和。

```python
def fib(n):
    """Compute the nth Fibonacci number, for n >= 0."""
    pred, curr = 0, 1   # pred is the nth Fibonacci number, curr is the (n+1)th
    k = 0               # 当前计算的是第 k 个
    while k < n:
        pred, curr = curr, pred + curr
        k = k + 1
    return pred

print(fib(8))  # 输出 21
```

**案例 2：质数检测 (Prime Numbers)**

如何判断一个数 `n` 是否是质数？我们可以尝试除以从 2 到 $\sqrt{n}$ 的所有数。

```python
def is_prime(n):
    """Return True if n is a prime number, else False."""
    if n <= 1:
        return False
    k = 2
    while k * k <= n:
        if n % k == 0:
            return False
        k = k + 1
    return True
```

## 总结

本章我们掌握了编程的核心能力：
1.  **定义函数** (`def`) 让我们能创造新的工具。
2.  **环境图** 让我们理解变量的作用域和生命周期。
3.  **控制流** (`if`, `while`) 让我们能处理复杂的逻辑。

在下一章中，我们将进入函数式编程最迷人的领域：**高阶函数 (Higher-Order Functions)** —— 即“将函数作为参数传递”或“返回一个函数”的函数。
