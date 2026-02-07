---
title: "13. 构建计算器解释器：从语法分析到求值"
date: 2026-02-07T16:00:00+08:00
draft: false
tags: ["Interpreter", "Scheme", "Python", "Parsing", "REPL", "SICP"]
categories: ["SICP-Python"]
description: "SICP 3.3-3.4 核心内容：动手实现一个 Scheme 语法的计算器。深入理解解释器的核心循环：Read-Eval-Print Loop。"
---

# 第十三章：构建计算器解释器——元语言抽象的起点

> "The evaluator, which determines the meaning of expressions in a programming language, is just another program." — SICP

在上一章中，我们体验了 Scheme 的简洁语法。今天，我们将跨越使用语言和设计语言的界限，利用**元语言抽象 (Metalinguistic Abstraction)** 的思想，用 Python 实现一个简单的 Scheme 语法计算器 (Calculator)。

虽然它只能做加减乘除，但它包含了所有解释器的核心组件：**解析 (Parsing)** 和 **求值 (Evaluation)**。

## 3.4.1 核心组件概览

一个解释器通常由四个主要部分组成，构成经典的 **REPL** 循环：

1.  **Read (读取)**: 将用户输入的字符串转换为计算机可处理的数据结构（表达式树）。
2.  **Eval (求值)**: 确定表达式树的意义（计算结果）。
3.  **Print (打印)**: 将结果转换回人类可读的字符串。
4.  **Loop (循环)**: 不断重复上述过程，并处理可能出现的**异常 (Exceptions)**。

## 3.4.2 表达式树 (Expression Trees)

在解释器内部，代码不是字符串，而是数据结构。我们使用嵌套的 `Pair` 对象（我们在第十章定义的链表）来表示 Scheme 表达式。

例如，Scheme 表达式 `(+ 1 (* 2 3))` 在 Python 中被表示为：

```python
Pair('+', Pair(1, Pair(Pair('*', Pair(2, Pair(3, nil))), nil)))
```

这不仅是数据，更是**抽象语法树 (AST)**。

## 3.4.3 解析 (Parsing)

解析过程分为两步：

1.  **词法分析 (Lexical Analysis)**: 将字符流拆分为 Token 序列。
    *   输入: `'(+ 1 2)'`
    *   输出: `['(', '+', 1, 2, ')']`

2.  **语法分析 (Syntactic Analysis)**: 将 Token 序列组装成表达式树。
    *   这是一个递归过程：遇到 `(` 开始读取一个列表，遇到 `)` 结束。

```python
def scheme_read(src):
    """读取下一个完整的表达式。"""
    if src.current() is None:
        raise EOFError
    val = src.pop()
    if val == '(':
        return read_tail(src) # 读取列表内容
    else:
        return val # 数字或符号

def read_tail(src):
    """读取列表的剩余部分。"""
    if src.current() == ')':
        src.pop()
        return nil
    first = scheme_read(src)
    rest = read_tail(src)
    return Pair(first, rest)
```

## 3.4.4 求值 (Evaluation)

这是解释器的心脏。对于我们的计算器，求值规则非常简单：

1.  **自求值表达式 (Self-Evaluating)**: 数字的值就是它本身。
2.  **调用表达式 (Call Expressions)**:
    *   递归求值所有操作数 (Operands)。
    *   将操作符 (Operator) 应用于求值后的参数 (Arguments)。

```python
def calc_eval(exp):
    """求值表达式。"""
    if type(exp) in (int, float):
        return exp
    elif isinstance(exp, Pair):
        # 1. 递归求值操作数
        arguments = exp.rest.map(calc_eval)
        # 2. 应用操作符
        return calc_apply(exp.first, arguments)
    else:
        raise TypeError(f"{exp} is not a number or call expression")
```

`calc_apply` 函数负责根据操作符（`+`, `-`, `*`, `/`）执行实际的 Python 运算。

```python
def calc_apply(operator, args):
    """将操作符应用于参数。"""
    if operator == '+':
        return sum(args)
    elif operator == '*':
        return reduce(mul, args, 1)
    # ... 处理 - 和 /
```

## 3.3 异常处理 (Exceptions)

一个健壮的解释器必须能优雅地处理错误，而不是直接崩溃。Python 的 `try...except` 机制在这里发挥了关键作用。

在 REPL 循环中，我们捕获所有预期的错误（如语法错误、除零错误），打印错误信息，然后开始下一次循环。

```python
def read_eval_print_loop():
    while True:
        try:
            src = buffer_input() # 获取用户输入
            while src.more_on_line:
                expression = scheme_read(src) # Read
                result = calc_eval(expression) # Eval
                print(result)                  # Print
        except (SyntaxError, TypeError, ZeroDivisionError) as err:
            print(type(err).__name__ + ':', err) # Handle Error
        except (KeyboardInterrupt, EOFError):
            break # Exit
```

## 总结

通过构建这个简单的计算器，我们揭示了编程语言的魔法：**语言只是另一种程序**。

*   **Read** 将文本转化为树。
*   **Eval** 遍历树并计算结果。
*   **REPL** 让这一切动起来。

下一章，我们将面对真正的挑战：让我们的解释器支持变量定义、环境模型和用户自定义函数，从而构建一个完整的 Scheme 解释器。

---
*参考链接：*
*   [Composing Programs 3.3 Exceptions](https://www.composingprograms.com/pages/33-exceptions.html)
*   [Composing Programs 3.4 Interpreters for Languages with Combination](https://www.composingprograms.com/pages/34-interpreters-for-languages-with-combination.html)
