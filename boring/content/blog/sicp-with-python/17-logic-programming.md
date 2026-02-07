---
title: "17. 逻辑编程：通过事实与规则进行推理"
date: 2026-02-07T20:00:00+08:00
draft: false
tags: ["Logic Programming", "Prolog", "Recursion", "Declarative Programming", "SICP"]
categories: ["SICP-Python"]
description: "SICP 4.4 核心内容：探索逻辑编程范式。通过定义事实（Facts）和规则（Rules），让计算机自动推导查询结果，实现祖先关系查找和列表拼接等复杂逻辑。"
---

# 第十七章：逻辑编程——通过事实与规则进行推理

> "In logic programming, we specify 'what is true', and the computer figures out 'how to prove it'."

在上一章的 SQL 中，我们通过声明“要什么数据”来进行查询。今天，我们将这种**声明式**思想推向极致：**逻辑编程 (Logic Programming)**。

我们将不再编写函数来计算结果，而是定义**事实 (Facts)** 和 **规则 (Rules)**，然后向计算机提问。计算机通过**推理 (Inference)** 来寻找答案。这种范式的代表语言是 **Prolog**。

## 4.4.1 事实与查询 (Facts and Queries)

在逻辑编程中，程序就是一系列事实的数据库。我们使用一种类似 Scheme 的语法来描述关系。

### 定义事实

假设我们要记录狗的族谱：

```scheme
(fact (parent abraham barack))
(fact (parent abraham clinton))
(fact (parent delano herbert))
(fact (parent fillmore abraham))
(fact (parent fillmore delano))
(fact (parent fillmore grover))
(fact (parent eisenhower fillmore))
```

这里 `(parent abraham barack)` 并不表示函数调用，而是声明一个关系：Abraham 是 Barack 的父亲。

### 进行查询

一旦有了事实，我们就可以提问。我们用 `?variable` 来表示未知量。

```scheme
(query (parent abraham ?child))
```

解释器会查找所有匹配的事实，并告诉我们 `?child` 可以是谁：
*   Success! `?child` = `barack`
*   Success! `?child` = `clinton`

## 4.4.2 复杂逻辑与规则

逻辑编程的强大之处在于定义**规则**。规则是基于其他事实的推论。

语法：`(fact <结论> <假设1> <假设2> ...)`
读作：“如果假设1、假设2...都成立，那么结论成立。”

### 示例 1：祖先关系 (Ancestor)

如果 A 是 Y 的父母，或者 A 是 Y 的父母的祖先，那么 A 就是 Y 的祖先。这是一个递归定义。

```scheme
; 基础情况：直接父母是祖先
(fact (ancestor ?a ?y) (parent ?a ?y))

; 递归情况：父母的祖先也是祖先
(fact (ancestor ?a ?y) (parent ?a ?z) (ancestor ?z ?y))
```

现在我们可以查询 Herbert 的所有祖先：

```scheme
(query (ancestor ?a herbert))
```
解释器会自动进行多步推理，找到 Delano, Fillmore, Eisenhower 等所有祖先。

### 示例 2：列表拼接 (Append)

在 Python 中，我们需要写代码来拼接列表。在逻辑编程中，我们定义“拼接关系”。

1.  **基础情况**：空列表拼上任何列表 `?x`，结果都是 `?x`。
2.  **递归情况**：如果 `?r` 和 `?y` 拼成 `?z`，那么 `(?a . ?r)` 和 `?y` 就能拼成 `(?a . ?z)`。

```scheme
(fact (append () ?x ?x))
(fact (append (?a . ?r) ?y (?a . ?z))
      (append ?r ?y ?z))
```

神奇的事情发生了：这个定义不仅能用来**计算**拼接结果，还能用来**反向求解**！

**正向计算**：
```scheme
(query (append (a b) (c d) ?result))
; Success! ?result = (a b c d)
```

**反向求解**：问“什么两个列表拼起来是 (a b c d e)？”
```scheme
(query (append ?left ?right (a b c d e)))
```
解释器会列出所有可能的组合：
*   `?left`=(), `?right`=(a b c d e)
*   `?left`=(a), `?right`=(b c d e)
*   ...
*   `?left`=(a b c d e), `?right`=()

## 总结

逻辑编程展示了一种完全不同的编程思维：

1.  **程序即逻辑**：你不需要思考控制流（循环、递归调用栈），只需要定义逻辑关系。
2.  **多向计算**：定义好的关系通常可以从任意方向使用（已知输入求输出，或已知输出求输入）。
3.  **模式匹配**：核心机制是**统一化 (Unification)**，即寻找变量的赋值使得两个表达式相等。

下一章，我们将深入逻辑解释器的内部，探索 **Unification 算法** —— 驱动这一切魔法的引擎。

---
*参考链接：*
*   [Composing Programs 4.4 Logic Programming](https://www.composingprograms.com/pages/44-logic-programming.html)
