---
title: "11. 算法效率：增长阶数与大O表示法"
date: 2026-02-07T14:00:00+08:00
draft: false
tags: ["Python", "SICP", "算法", "复杂度", "大O表示法", "记忆化"]
categories: ["SICP-Python"]
description: "SICP 2.8 核心内容：如何衡量程序的效率？从斐波那契数列的递归噩梦说起，探讨记忆化 (Memoization) 技术，并深入理解算法的增长阶数 (Orders of Growth) 与大 O 表示法。"
---

# 第十一章：算法效率——增长阶数与大O表示法

> "Premature optimization is the root of all evil." — Donald Knuth

在前几章中，我们关注的是**正确性**和**抽象**。我们学习了如何写出优雅、可维护的代码。
但在现实世界中，**效率 (Efficiency)** 同样至关重要。一个计算需要几秒钟还是几百年，决定了它是否可用。

本章（Composing Programs 2.8）将带我们进入算法分析的世界。

## 2.8.1 衡量效率 (Measuring Efficiency)

### 递归的噩梦：斐波那契数列

让我们回顾那个经典的树递归函数：

```python
def fib(n):
    if n == 0:
        return 0
    if n == 1:
        return 1
    return fib(n-2) + fib(n-1)
```

这个函数看起来很简洁，但它的性能极其糟糕。
我们可以写一个装饰器来统计函数被调用的次数：

```python
def count(f):
    def counted(*args):
        counted.call_count += 1
        return f(*args)
    counted.call_count = 0
    return counted

fib = count(fib)
fib(19)  # 结果 4181
print(fib.call_count)  # 输出 13529
```

计算 `fib(19)` 竟然调用了 13,529 次函数！
随着 $n$ 的增加，调用次数呈**指数级爆炸**。计算 `fib(30)` 可能需要几秒，而 `fib(100)` 可能需要宇宙毁灭的时间。

### 空间效率

除了时间，我们还要考虑空间。
对于树递归，虽然计算步数很多，但**同时活跃的栈帧 (Stack Frames)** 数量其实并不多。
`fib(n)` 的最大递归深度是 $n$。这意味着它的**空间复杂度**是线性的 $O(n)$。

## 2.8.2 记忆化 (Memoization)

如何拯救 `fib` 函数？
观察发现，我们在重复计算大量相同的值（例如 `fib(3)` 在 `fib(5)` 的计算树中出现了两次）。

我们可以使用**记忆化**技术：把算过的结果存起来。

```python
def memo(f):
    cache = {}
    def memoized(n):
        if n not in cache:
            cache[n] = f(n)
        return cache[n]
    return memoized

fib = count(fib)  # 重置计数器
fib = memo(fib)
fib(19)
print(fib.call_count) # 输出 20 (如果不算 memo 内部调用，实际计算仅 n+1 次)
```

通过一个简单的装饰器，我们将一个指数级算法变成了线性算法！
这展示了**空间换时间**的经典权衡。

## 2.8.3 增长阶数 (Orders of Growth)

我们很难精确预测程序运行的确切秒数（受硬件、系统影响），但我们可以预测**当输入规模 $n$ 变大时，资源消耗增长的趋势**。
这就是**增长阶数**，通常用 $\Theta$ (Theta) 或 $O$ (Big O) 表示。

常见的时间复杂度（按效率从高到低）：

1.  **$\Theta(1)$ 常数时间**：如访问列表索引 `lst[i]`。
2.  **$\Theta(\log n)$ 对数时间**：如二分查找，快速幂。
3.  **$\Theta(n)$ 线性时间**：如遍历列表。
4.  **$\Theta(n^2)$ 二方时间**：如嵌套循环，冒泡排序。
5.  **$\Theta(2^n)$ 指数时间**：如未优化的斐波那契递归。

### 示例：求幂 (Exponentiation)

计算 $b^n$。

**方法 1：线性递归**
$$b^n = b \cdot b^{n-1}$$

```python
def exp(b, n):
    if n == 0:
        return 1
    return b * exp(b, n-1)
```
时间复杂度：$\Theta(n)$

**方法 2：快速幂 (Successive Squaring)**
利用 $$b^{2n} = (b^n)^2$$ 的性质。
如果 $n$ 是偶数，$b^n = (b^{n/2})^2$。
如果 $n$ 是奇数，$b^n = b \cdot b^{n-1}$。

```python
def square(x):
    return x * x

def fast_exp(b, n):
    if n == 0:
        return 1
    if n % 2 == 0:
        return square(fast_exp(b, n//2))
    else:
        return b * fast_exp(b, n-1)
```
时间复杂度：$\Theta(\log n)$。
当 $n=1000$ 时，线性算法需要 1000 次乘法，而快速幂只需要约 14 次！

## 总结

效率分析是程序员的必修课。
*   **不要过早优化**，但要避免明显的低效（如指数级递归）。
*   **记忆化**是优化递归的利器。
*   理解**增长阶数**，能让你在设计系统时做出正确的算法选择。

至此，SICP Python 版的第二部分（抽象与数据）全部结束。
下一章，我们将进入更为神秘的领域：**解释计算机程序**。我们将学习一门新语言 Scheme，并最终用 Python 写一个解释器来运行它。

---
*参考链接：*
*   [Composing Programs 2.8 Efficiency](https://www.composingprograms.com/pages/28-efficiency.html)
