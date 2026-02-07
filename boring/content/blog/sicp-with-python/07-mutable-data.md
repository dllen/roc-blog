---
title: "07. 可变数据：时间、状态与同一性"
date: 2026-02-07T11:30:00+08:00
draft: false
tags: ["Python", "SICP", "可变性", "状态", "nonlocal", "同一性"]
categories: ["SICP-Python"]
description: "SICP 2.4 深入解析：当引入赋值语句和状态后，程序的世界发生了翻天覆地的变化。探讨同一性（Identity）与相等性（Equality）的区别，以及非局部赋值（nonlocal）带来的副作用。"
---

# 第七章：可变数据——时间、状态与同一性

> "Change is the only constant in life."  
> — Heraclitus

在之前的章节中，我们的函数都是**纯函数**：对于相同的输入，永远返回相同的输出。这种特性被称为**引用透明性 (Referential Transparency)**。

但在现实世界中，事物是随**时间**变化的。为了模拟这种变化，我们需要引入**状态 (State)** 和 **可变性 (Mutation)**。

## 2.4 可变数据 (Mutable Data)

### 2.4.1 对象的隐喻 (The Object Metaphor)

对象不仅仅是数据和函数的集合，它还拥有**行为**和**状态**。
让我们看一个经典的例子：银行账户。

```python
def make_withdraw(balance):
    def withdraw(amount):
        nonlocal balance  # 声明 balance 不是局部变量
        if amount > balance:
            return 'Insufficient funds'
        balance = balance - amount
        return balance
    return withdraw
```

这里发生了一些神奇的事情：

```python
>>> withdraw = make_withdraw(100)
>>> withdraw(25)
75
>>> withdraw(25)
50
```

同一个函数 `withdraw`，输入相同的参数 `25`，却返回了不同的结果！
这是因为 `withdraw` 函数拥有了**局部状态 (Local State)** —— `balance`。

### 2.4.2 nonlocal 语句

在 Python 中，`nonlocal` 关键字至关重要。它告诉解释器：“不要在当前帧（Frame）中查找或创建 `balance`，而去父级帧中查找并修改它。”

如果没有 `nonlocal`，`balance = balance - amount` 会报错，因为 Python 会认为你在试图修改一个未定义的局部变量。

**这标志着我们失去了引用透明性。** 我们的替代模型从**代换模型 (Substitution Model)** 变成了更复杂的**环境模型 (Environment Model)**。

### 2.4.3 同一性与相等性 (Identity vs. Equality)

一旦引入了变化，我们就必须区分“同一个东西”和“看起来一样的东西”。

*   **相等性 (Equality, `==`)**：两个对象的内容是否相同？
*   **同一性 (Identity, `is`)**：两个名字是否指向内存中的同一个对象？

```python
>>> list_a = [1, 2, 3]
>>> list_b = [1, 2, 3]

>>> list_a == list_b
True  # 内容一样

>>> list_a is list_b
False # 它们是两个独立的列表

>>> list_c = list_a
>>> list_c is list_a
True  # 它们指向同一个列表
```

如果修改 `list_a`：
```python
>>> list_a.append(4)
>>> list_b
[1, 2, 3]  # list_b 不受影响
>>> list_c
[1, 2, 3, 4] # list_c 变了！因为它是 list_a 的别名
```

### 2.4.4 可变性的代价

引入可变性赋予了我们模拟真实世界的能力（如模拟银行系统、物理引擎），但也带来了巨大的代价：

1.  **时间维度**：以前我们只需要关心 `x` 是什么，现在我们需要关心 `x` **现在**是什么，以及它**之前**是什么。
2.  **并发问题**：如果两个线程同时修改同一个对象，会发生什么？（这是并发编程中最头疼的问题）。
3.  **测试困难**：无法再简单地通过输入输出来测试函数，必须先设置好特定的状态。

## 总结与思考

*   **状态**：让程序有了“记忆”。
*   **nonlocal**：打破了函数式编程的洁癖，引入了副作用。
*   **同一性**：在可变世界中，知道“你是谁”比“你像谁”更重要。

在下一章，我们将正式进入 **2.5 面向对象编程 (Object-Oriented Programming)**。我们将看到 Python 的 `class` 机制是如何封装这些状态管理逻辑的，以及继承、多态等核心概念。
