---
title: "08. 面向对象编程：万物皆对象"
date: 2026-02-07T11:45:00+08:00
draft: false
tags: ["Python", "SICP", "面向对象", "继承", "多态", "消息传递"]
categories: ["SICP-Python"]
description: "SICP 2.5 深入解析：从消息传递（Message Passing）的本质出发，剖析类（Class）与实例（Instance）的关系。探讨继承与多态如何实现代码复用与接口统一。"
---

# 第八章：面向对象编程——万物皆对象

> "Alan Kay (Smalltalk 发明者) 曾说：'OOP to me means only messaging, local retention and protection and hiding of state-process, and extreme late-binding of all things.'"

在上一章，我们通过 `make_withdraw` 函数和 `nonlocal` 模拟了拥有状态的“对象”。这种手动管理状态的方式虽然强大，但不够通用。

本章我们将介绍 Python 内置的 **对象系统 (Object System)**。

## 2.5 面向对象编程 (OOP)

### 2.5.1 类与实例 (Classes and Instances)

OOP 的核心是将数据（属性）和操作数据的方法（函数）捆绑在一起。

*   **类 (Class)**：蓝图、模板。描述了一类对象的共同特征。
*   **实例 (Instance)**：根据蓝图造出来的具体对象。

```python
class Account:
    """A bank account that has a non-negative balance."""
    
    interest = 0.02  # 类属性 (Class Attribute)，所有实例共享

    def __init__(self, account_holder):
        self.balance = 0                # 实例属性 (Instance Attribute)
        self.holder = account_holder

    def deposit(self, amount):
        self.balance = self.balance + amount
        return self.balance

    def withdraw(self, amount):
        if amount > self.balance:
            return 'Insufficient funds'
        self.balance = self.balance - amount
        return self.balance
```

**深入理解 `self`**：
当你调用 `a.deposit(100)` 时，Python 实际上在执行 `Account.deposit(a, 100)`。`self` 就是那个具体的实例 `a`。

### 2.5.2 消息传递 (Message Passing)

SICP 独特之处在于它从**消息传递**的角度解释 OOP。
当我们调用 `a.withdraw(10)` 时，我们实际上是在向对象 `a` 发送了一条消息：“请执行 `withdraw` 操作，参数是 `10`”。

对象根据自己的内部逻辑（方法定义）来响应这条消息。这种**动态分发 (Dynamic Dispatch)** 是多态的基础。

### 2.5.3 继承 (Inheritance)

继承允许我们定义一个新类（子类），它继承了现有类（基类）的所有属性和方法。这极大地促进了**代码复用**。

```python
class CheckingAccount(Account):
    """A bank account that charges for withdrawals."""
    
    withdraw_charge = 1
    interest = 0.01

    def withdraw(self, amount):
        return Account.withdraw(self, amount + self.withdraw_charge)
```

**Is-a 关系**：`CheckingAccount` **is a** `Account`。
这里我们**重写 (Override)** 了 `withdraw` 方法，但通过 `Account.withdraw(...)` 复用了父类的逻辑。

### 2.5.4 多态 (Polymorphism)

多态意味着“多种形态”。在编程中，它指**不同的对象对相同的消息做出不同的响应**。

```python
def make_payment(account, amount):
    return account.withdraw(amount)
```

`make_payment` 函数根本不需要知道 `account` 是普通的 `Account` 还是 `CheckingAccount`。只要它能响应 `withdraw` 消息，代码就能工作。

这就是**鸭子类型 (Duck Typing)**：“如果它走起来像鸭子，叫起来像鸭子，那它就是鸭子。”

### 2.5.5 多重继承 (Multiple Inheritance)

Python 支持一个类继承多个父类。这虽然强大，但也带来了复杂性（如菱形继承问题）。Python 使用 **C3 线性化算法 (MRO)** 来确定方法解析顺序。

```python
class SavingsAccount(Account):
    deposit_charge = 2
    def deposit(self, amount):
        return Account.deposit(self, amount - self.deposit_charge)

class CleverBank(CheckingAccount, SavingsAccount):
    """同时拥有取款手续费和存款手续费的黑心银行"""
    pass
```

## 总结与思考

*   **封装**：将状态和行为打包，隐藏内部细节。
*   **继承**：避免重复造轮子。
*   **多态**：编写通用的接口，适应不同的实现。

至此，SICP 的第二部分（数据抽象）告一段落。
在接下来的第三部分，我们将进入更加抽象和底层的领域——**解释计算机程序的程序**（解释器）。但在那之前，SICP 2.9 还探讨了**泛型操作 (Generic Operations)**，这是构建大型系统的关键技术。
