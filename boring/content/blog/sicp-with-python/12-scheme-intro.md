---
title: "12. 初识 Scheme：像 Lisp 程序员一样思考"
date: 2026-02-07T15:00:00+08:00
draft: false
tags: ["Scheme", "Lisp", "SICP", "函数式编程", "解释器"]
categories: ["SICP-Python"]
description: "SICP 3.1-3.2 核心内容：为什么要学习 Scheme？体验 Lisp 家族的优雅与简洁。从前缀表达式到 Lambda，探索一种纯粹的编程范式。"
---

# 第十二章：初识 Scheme——像 Lisp 程序员一样思考

> "Lisp is not a language, it's a building material." — Alan Kay

在前两部分中，我们主要使用 Python。Python 是一门多范式语言（面向对象、命令式、函数式）。
而在第三部分，为了深入理解**解释器 (Interpreter)** 的工作原理，我们将切换到一门更“纯粹”的语言：**Scheme**（Lisp 的一种方言）。

为什么要学习 Scheme？
1.  **极简主义**：它的核心语法规则一只手就能数过来。
2.  **代码即数据**：Scheme 代码本身就是 Scheme 的数据结构（列表）。这使得编写解释器变得异常简单。
3.  **函数式编程**：强制我们用纯函数思考，没有赋值语句（至少在我们使用的子集中）。

## 3.2.1 表达式 (Expressions)

Scheme 使用**波兰前缀表达式 (Polish Prefix Notation)**。
所有表达式都用括号包围：`(operator operand1 operand2 ...)`

```scheme
; Python: 1 + 2 * 3
(+ 1 (* 2 3))
; Value: 7

; Python: (10 - 6) / 2
(/ (- 10 6) 2)
; Value: 2
```

这种语法消除了对优先级规则（如先乘除后加减）的需求。解释器只需要简单地递归求值。

## 3.2.2 定义与特殊形式 (Definitions & Special Forms)

在 Scheme 中，并非所有东西都是函数调用。**特殊形式 (Special Forms)** 具有特殊的求值规则。

### `define`：定义变量和函数

```scheme
(define pi 3.14)
(* pi 2)

; 定义函数 (define (name params...) body)
(define (square x) (* x x))
(square 5) ; Value: 25
```

### `if`：控制流

`if` 是特殊形式，因为通过短路求值，它只执行其中一个分支。

```scheme
(if (> 3 2)
    'yes
    'no)
; Value: yes
```

### `lambda`：匿名函数

`lambda` 用来创建匿名函数。事实上，`define` 只是 `lambda` 的语法糖。

```scheme
(lambda (x) (* x x))
; 等价于
((lambda (x) (* x x)) 5) ; Value: 25
```

## 3.2.3 列表与引用 (Lists & Quotation)

Lisp 代表 "LISt Processing"。列表是其核心数据结构。

*   `cons`：构建序对 (Pair)。
*   `car`：获取第一个元素 (Contents of the Address part of Register)。
*   `cdr`：获取剩余部分 (Contents of the Decrement part of Register)。
*   `list`：构建列表。
*   `nil`：空列表。

```scheme
(define x (cons 1 2))
(car x) ; 1
(cdr x) ; 2

(define s (list 1 2 3))
(car s) ; 1
(cdr s) ; (2 3)
```

### 引用 (Quote)

如果我们输入 `(a b)`，Scheme 会尝试调用函数 `a`。
如果我们想表示“一个包含符号 a 和 b 的列表”，我们需要**引用**它。

```scheme
(list 'a 'b) ; (a b)
'(a b)       ; (a b) 的简写
```

这就是**代码即数据**：
*   `(+ 1 2)` 是代码（一个加法表达式）。
*   `'(+ 1 2)` 是数据（一个包含 `+`, `1`, `2` 的列表）。

这种同像性 (Homoiconicity) 使得我们可以轻松地编写程序来处理程序——也就是**解释器**。

## 总结

Scheme 看起来可能很奇怪（大量的括号），但它不仅是一门语言，更是一种**思想工具**。
它强迫我们剥离语法的干扰，直面计算的本质：**求值 (Evaluation)** 和 **应用 (Application)**。

下一章，我们将利用 Scheme 的这些特性，开始构建我们自己的解释器。

---
*参考链接：*
*   [Composing Programs 3.1 Introduction](https://www.composingprograms.com/pages/31-introduction.html)
*   [Composing Programs 3.2 Functional Programming](https://www.composingprograms.com/pages/32-functional-programming.html)
