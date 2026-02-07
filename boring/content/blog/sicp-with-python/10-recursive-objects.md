---
title: "10. 递归对象：链表与树的类实现"
date: 2026-02-07T13:00:00+08:00
draft: false
tags: ["Python", "SICP", "递归", "数据结构", "OOP", "链表", "树"]
categories: ["SICP-Python"]
description: "SICP 2.9 深入解析：如何用类 (Class) 实现递归数据结构？从 `Link` 类到 `Tree` 类，探索对象系统的递归本质，并将其应用于集合 (Sets) 的实现。"
---

# 第十章：递归对象——链表与树的类实现

> "To understand recursion, you must first understand recursion."

在前面的章节中，我们使用函数和元组实现了链表和树。那时候，数据（元组）和行为（处理函数）是分离的。
现在，我们已经掌握了面向对象编程 (OOP)，是时候将这两者结合起来，构建**递归对象 (Recursive Objects)**。

当一个对象的属性值是该对象所属类的实例时，我们称其为递归对象。

## 2.9.1 链表类 (Linked List Class)

我们在 2.3 节中用嵌套元组 `(1, (2, (3, empty)))` 模拟了链表。现在，我们可以定义一个 `Link` 类来封装这种逻辑。

### 定义 `Link` 类

核心思想依然不变：链表由 **first** (第一个元素) 和 **rest** (剩余部分) 组成。`rest` 必须也是一个 `Link` 实例，或者是空链表 (`Link.empty`)。

```python
class Link:
    """A linked list with a first element and the rest."""
    empty = ()

    def __init__(self, first, rest=empty):
        assert rest is Link.empty or isinstance(rest, Link)
        self.first = first
        self.rest = rest

    def __getitem__(self, i):
        if i == 0:
            return self.first
        else:
            return self.rest[i-1]

    def __len__(self):
        return 1 + len(self.rest)

    def __repr__(self):
        if self.rest is Link.empty:
            rest = ''
        else:
            rest = ', ' + repr(self.rest)
        return 'Link({0}{1})'.format(self.first, rest)
```

**代码解析：**
1.  **递归定义**：`__len__` 和 `__getitem__` 都调用了 `self.rest` 的对应方法。
2.  **魔术方法**：实现了 `__len__` 和 `__getitem__` 后，`Link` 对象就可以使用 `len()` 函数和索引 `[]` 访问，表现得像 Python 内置序列一样。
3.  **`__repr__`**：提供了友好的字符串表示，方便调试。

```python
s = Link(3, Link(4, Link(5)))
# >>> len(s)
# 3
# >>> s[1]
# 4
# >>> s
# Link(3, Link(4, Link(5)))
```

### 链表的递归操作

有了 `Link` 类，我们可以定义各种高阶函数来处理它。注意，这些操作通常也是递归的。

```python
def extend_link(s, t):
    """连接两个链表 s 和 t"""
    if s is Link.empty:
        return t
    else:
        return Link(s.first, extend_link(s.rest, t))

def map_link(f, s):
    """对链表 s 的每个元素应用函数 f"""
    if s is Link.empty:
        return s
    else:
        return Link(f(s.first), map_link(f, s.rest))

def filter_link(f, s):
    """过滤链表 s，只保留满足 f 的元素"""
    if s is Link.empty:
        return s
    else:
        filtered = filter_link(f, s.rest)
        if f(s.first):
            return Link(s.first, filtered)
        else:
            return filtered
```

这不仅演示了递归处理，也展示了 OOP 如何与函数式编程（Map/Filter）完美融合。

## 2.9.2 树类 (Tree Class)

同样地，我们在 2.3 节用列表嵌套列表实现了树。现在，我们定义一个 `Tree` 类。
一棵树包含一个 **label** (根节点值) 和一组 **branches** (分支，每个分支也是一棵 `Tree`)。

```python
class Tree:
    def __init__(self, label, branches=()):
        self.label = label
        for branch in branches:
            assert isinstance(branch, Tree)
        self.branches = list(branches)

    def __repr__(self):
        if self.branches:
            branch_str = ', ' + repr(self.branches)
        else:
            branch_str = ''
        return 'Tree({0}{1})'.format(self.label, branch_str)

    def is_leaf(self):
        return not self.branches
```

### 应用：斐波那契树

我们可以构建一棵树来可视化斐波那契数列的计算过程。这极好地展示了树递归的结构。

```python
def fib_tree(n):
    if n == 0 or n == 1:
        return Tree(n)
    else:
        left = fib_tree(n-2)
        right = fib_tree(n-1)
        fib_n = left.label + right.label
        return Tree(fib_n, [left, right])

# >>> fib_tree(5)
# Tree(5, [Tree(2, [Tree(1, [Tree(0), Tree(1)]), Tree(1)]), Tree(3, [Tree(1), Tree(2, [Tree(1, [Tree(0), Tree(1)]), Tree(1)])])])
```

### 记忆化 (Memoization) 与效率

递归对象的一个潜在问题是效率。例如 `fib_tree(35)` 会生成海量的节点。
通过结合 **Memoization (记忆化)** 技术，我们可以确保相同的子树只被创建一次。

```python
def memo(f):
    cache = {}
    def memoized(n):
        if n not in cache:
            cache[n] = f(n)
        return cache[n]
    return memoized

fib_tree = memo(fib_tree)
big_fib_tree = fib_tree(35)
# 此时，计算瞬间完成，且内存占用极低，因为大量子树被共享引用了。
```

这展示了对象模型的一个重要特性：**对象标识 (Identity)**。虽然逻辑上树很大，但物理上许多分支指向的是同一个内存对象。

## 2.9.3 集合 (Sets) 的实现

最后，我们来看看如何利用递归对象来实现**集合 (Set)**。
集合的特性是：元素不重复、无序。

如果我们用 `Link` 来实现集合（作为无序序列）：

```python
def set_contains(s, v):
    """判断集合 s 是否包含 v"""
    if s is Link.empty:
        return False
    elif s.first == v:
        return True
    else:
        return set_contains(s.rest, v)

def adjoin_set(s, v):
    """向集合 s 添加元素 v"""
    if set_contains(s, v):
        return s
    else:
        return Link(v, s)
```

**效率分析**：
*   `set_contains` 需要遍历整个链表，时间复杂度为 $O(n)$。
*   `adjoin_set` 也需要调用 `set_contains`，所以也是 $O(n)$。
*   两个集合的交集或并集操作，则可能达到 $O(n^2)$。

这为我们后续讨论**效率 (Efficiency)** 埋下了伏笔：如果我们使用**排序链表**或**二叉搜索树**来实现集合，能否将复杂度降低到 $O(\log n)$？

## 总结

递归对象是数据结构课程的核心。通过 `Link` 和 `Tree` 类，我们：
1.  将**递归结构**封装在类定义中。
2.  利用**特殊方法**让自定义对象融入 Python 生态。
3.  结合**记忆化**优化了递归结构的性能。

至此，SICP Python 版的第二部分“数据抽象”的主要内容已经完成。我们从简单的数字，到函数，再到序列、树，最后到通用的对象系统。

下一章，我们将稍作停顿，专门探讨**效率 (Efficiency)**，用大 O 表示法来量化我们的代码性能。

---
*参考链接：*
*   [Composing Programs 2.9 Recursive Objects](https://www.composingprograms.com/pages/29-recursive-objects.html)
