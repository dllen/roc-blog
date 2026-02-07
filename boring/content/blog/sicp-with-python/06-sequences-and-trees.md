---
title: "06. 序列与树：数据的递归结构"
date: 2026-02-07T11:15:00+08:00
draft: false
tags: ["Python", "SICP", "链表", "树", "递归", "数据结构"]
categories: ["SICP-Python"]
description: "SICP 2.3 深入解析：从 Python 的列表推导式，到手写递归链表（Linked Lists），再到树形结构（Trees）的递归处理。掌握如何用递归思想操纵复杂数据。"
---

# 第六章：序列与树——数据的递归结构

> "Bad programmers worry about the code. Good programmers worry about data structures and their relationships."  
> — Linus Torvalds

在上一章，我们学会了如何定义抽象数据类型（如`rational`）。今天，我们将探索计算机科学中最基础也最重要的两种数据结构：**序列 (Sequences)** 和 **树 (Trees)**。

有趣的是，我们依然不依赖 Python 的类（class），而是仅用函数和简单的列表来实现它们。这能让我们看清数据结构的**递归本质**。

## 2.3 序列 (Sequences)

序列是有序元素的集合。

### 2.3.1 列表推导式 (List Comprehensions)

Python 提供了一种极其优雅的方式来处理序列——列表推导式。它直接对应数学中的**集合构建符号 (Set Builder Notation)**。

数学写法：$\{x^2 \mid x \in \mathbb{N}, x < 10\}$

Python 写法：
```python
squares = [x * x for x in range(10)]
```

这也体现了**声明式编程 (Declarative Programming)** 的思想：告诉计算机**要什么**（平方），而不是**怎么做**（for 循环 + append）。

### 2.3.2 递归列表 (Linked Lists)

Python 的内置 `list` 是基于数组实现的。但在 SICP 和函数式编程中，**链表 (Linked List)** 才是王道。

链表是一种递归定义的数据结构：
*   一个链表要么是空的。
*   要么是一个**首元素 (First)** 和一个**剩余部分 (Rest)**，其中剩余部分也是一个链表。

我们可以用嵌套的列表来模拟它：

```python
empty = 'empty'

def link(first, rest):
    """Construct a linked list from its first element and the rest."""
    return [first, rest]

def first(s):
    """Return the first element of a linked list s."""
    return s[0]

def rest(s):
    """Return the rest of the linked list s."""
    return s[1]
```

**示例**：
构造序列 `[1, 2, 3]`：
```python
four_numbers = link(1, link(2, link(3, link(4, empty))))
```

虽然看起来很繁琐，但它非常适合**递归处理**。

**递归实现 `len` 和 `getitem`**：

```python
def len_link(s):
    """Return the length of linked list s."""
    if s == empty:
        return 0
    return 1 + len_link(rest(s))

def getitem_link(s, i):
    """Return the element at index i of linked list s."""
    if i == 0:
        return first(s)
    return getitem_link(rest(s), i - 1)
```

这就是**数据结构的递归定义**与**算法的递归实现**之间的完美对应。

### 2.3.3 树 (Trees)

树是比链表更通用的递归结构。
*   树有一个**根节点 (Root)**。
*   根节点有一组**分支 (Branches)**，每个分支本身也是一棵树。

**实现树**：

```python
def tree(root_label, branches=[]):
    return [root_label] + list(branches)

def label(t):
    return t[0]

def branches(t):
    return t[1:]
```

**构造一棵树**：

```python
#    3
#   / \
#  1   2
#     / \
#    1   1
t = tree(3, [tree(1), tree(2, [tree(1), tree(1)])])
```

### 2.3.4 树的递归处理

处理树的核心思想是：**对根节点做点事，然后递归地对所有分支做同样的事。**

**案例 1：计算树中叶子节点 (Leaves) 的数量**

```python
def is_leaf(t):
    return not branches(t)

def count_leaves(t):
    if is_leaf(t):
        return 1
    branch_counts = [count_leaves(b) for b in branches(t)]
    return sum(branch_counts)
```

**案例 2：打印树 (Pretty Print)**

```python
def print_tree(t, indent=0):
    print('  ' * indent + str(label(t)))
    for b in branches(t):
        print_tree(b, indent + 1)
```

输出：
```text
3
  1
  2
    1
    1
```

这段代码虽然短，但它能处理任意深度的树。这就是递归的威力——它能让我们用有限的代码处理无限复杂的结构。

## 总结与思考

*   **递归数据结构**：链表和树本质上都是递归定义的（自己包含自己）。
*   **处理模式**：处理递归数据结构的最佳方式就是编写递归函数。
*   **声明式思维**：列表推导式让我们关注数据的变换，而不是循环的细节。

在下一章，我们将进入 **2.4 可变数据 (Mutable Data)**。
到目前为止，我们的函数都是**纯函数**，数据都是**不可变**的。一旦引入**状态 (State)** 和**变化 (Mutation)**，编程的世界将变得更加强大，但也更加危险（因为时间成为了一个复杂的维度）。
