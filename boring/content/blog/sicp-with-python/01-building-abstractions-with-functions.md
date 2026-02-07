---
title: "01. 函数抽象：编程的基石"
date: 2026-02-07T10:01:00+08:00
draft: false
tags: ["Python", "SICP", "函数", "抽象", "表达式"]
categories: ["SICP-Python"]
description: "SICP Python版第一章：从交互式编程开始，探索表达式、函数调用、变量绑定以及纯函数与非纯函数的区别。理解计算机程序的基本构造元素。"
---

# 第一章：使用函数构建抽象

> "A language isn't something you learn so much as something you join."  
> — Arika Okrent

计算机科学不仅仅是关于计算机的学科，它是关于**抽象**的艺术。所有的计算都始于三个基本要素：
1.  **表示信息** (Representing information)
2.  **处理逻辑** (Specifying logic)
3.  **设计抽象** (Designing abstractions) —— 用于管理复杂性。

本章我们将使用 Python 语言来探索这些基本思想。

## 1.1 起步 (Getting Started)

Python 是一门非常适合教学和生产的语言，它强调代码的**可读性**和**简洁性**。

### 1.1.1 交互式会话 (Interactive Sessions)

学习 Python 最好的方式就是直接与它“对话”。在终端输入 `python3` 即可进入交互式模式（看到 `>>>` 提示符）。

```python
>>> 2 + 2
4
```

在这里，你输入**代码**（表达式），解释器**读取**并**执行**它，然后打印**结果**。这被称为 REPL (Read-Eval-Print Loop)。

### 1.1.2 初体验：莎士比亚的词汇 (First Example)

让我们来看一个稍微复杂一点的例子。Python 内置了强大的库，可以轻松处理网络数据。

我们要做的任务是：**统计莎士比亚所有作品中，既是回文（正着读反着读都一样）且长度为 6 的单词。**

```python
# 1. 导入处理 URL 的模块
from urllib.request import urlopen

# 2. 读取莎士比亚全集文本
# 这一步会从网络下载数据，可能需要一点时间
shakespeare = urlopen('http://composingprograms.com/shakespeare.txt')

# 3. 将文本解码、拆分成单词，并放入一个集合(set)中去重
# set 是一个“对象”，它包含数据（单词）和操作（如去重）
words = set(shakespeare.read().decode().split())

# 4. 使用“集合推导式”找出符合条件的单词
# 条件：长度为6 (len(w) == 6) 且 翻转后仍在集合中 (w[::-1] in words)
palindromes = {w for w in words if len(w) == 6 and w[::-1] in words}

print(palindromes)
```

**运行结果可能包含：**
`{'redder', 'drawer', 'reward', 'diaper', 'repaid'}`

> **注**：`diaper` (尿布) 倒过来是 `repaid` (偿还)，很有趣的文字游戏。

这个例子展示了 Python 的强大之处：短短几行代码，就完成了**数据获取**、**处理**、**逻辑判断**和**输出**。

### 1.1.3 关于错误 (Errors)

计算机是非常“死板”的。哪怕少了一个括号，或者拼错了一个字母，它都会报错。

```python
>>> print("Hello"
  File "<stdin>", line 1
    print("Hello"
                ^
SyntaxError: unexpected EOF while parsing
```

**调试 (Debugging) 的原则：**
1.  **增量测试**：写一点测一点，不要写完几百行再运行。
2.  **隔离错误**：将问题缩小到最小的代码片段。
3.  **检查假设**：解释器永远是对的，如果结果不对，说明你对代码行为的假设错了。

---

## 1.2 编程的基本元素 (Elements of Programming)

任何强大的编程语言都包含三种机制：

1.  **基本表达式 (Primitive expressions)**：语言中最简单的个体（如数字、字符串）。
2.  **组合手段 (Means of combination)**：将简单元素组合成复杂元素的方法。
3.  **抽象手段 (Means of abstraction)**：为复杂元素命名，并将其作为单元来操作。

### 1.2.1 表达式 (Expressions)

最基本的表达式是数字。

```python
>>> 42
42
```

我们可以用**中缀运算符** (infix notation) 将它们组合起来：

```python
>>> 1/2 + 1/4 + 1/8
0.875
```

### 1.2.2 调用表达式 (Call Expressions)

这是编程中最重要的一类复合表达式。它将**函数**应用于**参数**。

```python
#   函数名   参数列表
#     ↓       ↓
>>> max(7.5, 9.5)
9.5
```

*   **操作符 (Operator)**：`max`（表示一个函数）
*   **操作数 (Operands)**：`7.5` 和 `9.5`（参数）

函数调用可以**嵌套**：

```python
>>> max(min(1, -2), min(pow(3, 5), -4))
-2
```

这里的逻辑是：先计算内部的 `min`，再将结果传给外部的 `max`。

### 1.2.3 导入库函数 (Importing Library Functions)

Python 的核心很小，但它的**标准库**非常大。我们需要用 `import` 语句来加载它们。

```python
>>> from math import sqrt, pi
>>> sqrt(256)
16.0
```

### 1.2.4 命名与环境 (Names and the Environment)

**赋值语句** (Assignment statement) 是我们最基本的**抽象手段**。它允许我们给计算结果起个名字。

```python
>>> radius = 10
>>> area = pi * radius * radius
>>> area
314.1592653589793
```

*   **绑定 (Binding)**：`radius` 这个名字被绑定到了值 `10` 上。
*   **环境 (Environment)**：解释器用来存储这些名字和值对应关系的地方。

**多重赋值**：
Python 允许一行给多个变量赋值，这在交换变量值时非常有用：

```python
>>> x, y = 3, 4.5
>>> y, x = x, y  # 交换 x 和 y 的值
>>> x
4.5
```

### 1.2.5 嵌套表达式的求值 (Evaluating Nested Expressions)

理解 Python 如何求值至关重要。对于调用表达式 `f(x)`，求值过程是**递归**的：

1.  **求值操作符** (Evaluate the operator)：找到 `f` 对应的函数。
2.  **求值操作数** (Evaluate the operands)：计算 `x` 的值。
3.  **应用函数** (Apply the function)：将函数应用于参数值。

例如：`sub(pow(2, add(1, 10)), pow(2, 5))`

我们可以用**表达式树 (Expression Tree)** 来可视化这个过程：

```text
          sub
        /     \
    pow         pow
   /   \       /   \
  2    add    2     5
      /   \
     1    10
```

求值顺序是**从下往上**，先算出 `add(1, 10) -> 11`，再算 `pow(2, 11) -> 2048`，最后算 `sub(...)`。

### 1.2.6 纯函数与非纯函数 (Pure vs Non-Pure Functions)

这是函数式编程中的核心概念。

**纯函数 (Pure Functions)**：
*   **输入决定输出**：给定相同的输入，永远返回相同的输出。
*   **无副作用**：不会改变环境状态（如打印内容、修改全局变量）。
*   例子：`abs(-2)`, `pow(2, 3)`, `max(1, 2)`

```python
>>> abs(-2)
2
# 再次调用，结果依然是 2，且没有其他事情发生
```

**非纯函数 (Non-Pure Functions)**：
*   会有**副作用 (Side effects)**。
*   例子：`print()`

```python
>>> print(1, 2, 3)
1 2 3      # 副作用：在屏幕上显示了字符
None       # 返回值：print 函数本身没有有意义的返回值，所以返回 None
```

**为什么要区分？**
纯函数更容易测试、组合和并行化，因为它们是独立的。在编写程序时，我们应尽量多使用纯函数，将非纯函数（如输入输出）限制在特定区域。

---

## 总结

本章我们学习了：
*   如何启动 Python 交互式会话。
*   **表达式**是值的表现形式，**语句**（如赋值）产生改变。
*   **函数调用**是组合逻辑的核心。
*   **环境**存储了名字和值的绑定。
*   **纯函数**与**非纯函数**的区别。

在下一章中，我们将深入探讨**如何定义自己的函数**，从而构建更强大的抽象。
