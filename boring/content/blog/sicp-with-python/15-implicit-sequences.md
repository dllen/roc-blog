---
title: "15. 隐式序列与生成器：惰性计算的力量"
date: 2026-02-07T18:00:00+08:00
draft: false
tags: ["Python", "Iterator", "Generator", "Lazy Evaluation", "SICP"]
categories: ["SICP-Python"]
description: "SICP 4.2 核心内容：深入 Python 的迭代器协议与生成器，理解惰性计算如何处理无限序列与大数据流。"
---

# 第十五章：隐式序列与生成器——惰性计算的力量

> "Computer science is the study of how to describe and process information."

在前面的章节中，我们处理的数据结构（如列表、元组）都是**显式**的：所有的元素都完整地存储在内存中。如果我们要处理一个包含 10 亿个数字的序列，或者一个无限的质数序列，显式存储显然是不可能的。

今天，我们将探索**隐式序列 (Implicit Sequences)**，也就是 Python 中最强大的特性之一：**迭代器 (Iterators)** 和 **生成器 (Generators)**。它们允许我们按需计算数据，从而处理无限或巨大的数据集。

## 4.2.1 惰性计算 (Lazy Computation)

考虑 `range(10000, 1000000000)`。Python 并没有在内存中真的创建 10 亿个整数。相反，它创建了一个 `range` 对象，这个对象只记住了起点、终点和步长。

只有当你请求第 n 个元素时，它才通过公式 `start + n * step` 计算出来。这就是**惰性计算**：将计算推迟到真正需要结果的那一刻。

## 4.2.2 迭代器协议 (The Iterator Protocol)

Python 通过两个魔术方法定义了迭代器协议：

1.  **`__iter__`**: 返回迭代器对象本身。
2.  **`__next__`**: 返回序列的下一个元素；如果没有元素了，抛出 `StopIteration` 异常。

让我们手动模拟一个 `for` 循环的过程：

```python
primes = [2, 3, 5]
iterator = iter(primes) # 调用 primes.__iter__()

try:
    while True:
        elem = next(iterator) # 调用 iterator.__next__()
        print(elem)
except StopIteration:
    pass # 循环结束
```

这就是 Python `for` 循环背后的真相：它只是 `while` 循环 + 异常处理的语法糖。

## 4.2.3 生成器 (Generators)

虽然我们可以通过编写类并实现 `__iter__` 和 `__next__` 来创建迭代器，但这很繁琐。Python 提供了**生成器函数**，让这一切变得极其简单。

只要函数中包含 `yield` 关键字，它就变成了一个生成器函数。

```python
def letters_generator():
    current = 'a'
    while current <= 'd':
        yield current
        current = chr(ord(current) + 1)

for letter in letters_generator():
    print(letter)
```

### 生成器的魔法

当生成器函数被调用时，它**不执行任何代码**，而是立即返回一个生成器对象。

只有当你调用 `next()` 时，代码才开始执行，直到遇到 `yield`。此时：
1.  函数**暂停**执行。
2.  `yield` 后面的值被返回。
3.  函数的**状态（局部变量）被保存**。

下一次调用 `next()` 时，函数从上次暂停的地方**恢复**执行。

## 4.2.4 实例：自然数序列

生成器最强大的用途之一是表示**无限序列**。在传统的列表思维中，你无法创建一个包含所有自然数的列表。但在生成器思维中，这轻而易举：

```python
def naturals():
    x = 1
    while True:
        yield x
        x += 1

# 使用它
ns = naturals()
print(next(ns)) # 1
print(next(ns)) # 2
# ... 可以永远继续下去
```

我们可以编写通用的流处理函数来操作这些无限序列，例如 `map` 和 `filter` 的惰性版本：

```python
def lazy_map(func, iterable):
    for x in iterable:
        yield func(x)

def lazy_filter(pred, iterable):
    for x in iterable:
        if pred(x):
            yield x
```

## 总结

*   **Iterable (可迭代对象)**: 有 `__iter__` 方法，代表一个数据集（如 list, range）。可以被循环多次。
*   **Iterator (迭代器)**: 有 `__next__` 方法，代表一个数据流的**游标**。只能消耗一次。
*   **Generator (生成器)**: 编写迭代器的简便方式，利用 `yield` 实现状态保存和恢复。

掌握生成器，意味着你从“静态数据处理”进化到了“流式数据处理”。这是构建高效、低内存消耗 Python 程序的基石，也是处理大数据流的核心思想。

---
*参考链接：*
*   [Composing Programs 4.2 Implicit Sequences](https://www.composingprograms.com/pages/42-implicit-sequences.html)
