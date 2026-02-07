---
title: "21. 并行计算：驾驭多线程的野兽"
date: 2026-02-08T00:00:00+08:00
draft: false
tags: ["Parallel Computing", "Concurrency", "Threading", "Multiprocessing", "Locks", "Deadlocks", "SICP"]
categories: ["SICP-Python"]
description: "SICP 4.8 核心内容：探索并行计算的世界。理解多线程与多进程的区别，掌握锁（Locks）、信号量（Semaphores）和屏障（Barriers）等同步机制，学会避免竞态条件与死锁。"
---

# 第二十一章：并行计算——驾驭多线程的野兽

> "The speed of individual processor cores has increased much more slowly... Instead, CPU manufacturers began to place multiple cores in a single processor."

随着摩尔定律的放缓，单核 CPU 的性能提升遭遇瓶颈。为了追求更快的速度，硬件厂商转向了多核架构。这意味着，作为程序员，我们必须学会**并行计算 (Parallel Computing)**，让程序同时做多件事。

## 4.8.1 并行 vs 并发 (Parallelism vs Concurrency)

*   **并发 (Concurrency)**: 指系统**管理**多个任务的能力。即使在单核 CPU 上，操作系统通过快速切换上下文 (Context Switching)，让我们感觉多个程序在同时运行。
*   **并行 (Parallelism)**: 指系统**同时执行**多个任务的能力。这通常需要多核 CPU 或多台机器。

### Python 中的并行

Python 提供了两种主要的并行方式：

1.  **Threading (多线程)**: 
    *   所有线程运行在同一个进程中，共享内存。
    *   **GIL (Global Interpreter Lock)**: CPython 解释器的全局锁限制了同一时刻只能有一个线程执行 Python 字节码。因此，Python 多线程适合 **I/O 密集型**任务（如爬虫、文件读写），但不适合 CPU 密集型任务。
    
    ```python
    import threading

    def hello():
        print('Hello from', threading.current_thread().name)

    t = threading.Thread(target=hello)
    t.start()
    t.join()
    ```

2.  **Multiprocessing (多进程)**:
    *   启动多个独立的解释器进程。
    *   每个进程有独立的内存空间，避开了 GIL 的限制。
    *   适合 **CPU 密集型**任务（如科学计算、图像处理）。

## 4.8.2 共享状态的危机：竞态条件 (Race Conditions)

并行编程最大的挑战在于**共享可变状态 (Shared Mutable State)**。当多个线程同时修改同一个变量时，结果可能不可预测。

### 示例：不安全的计数器

```python
import threading

counter = [0]

def increment():
    current = counter[0]
    # 线程可能在这里被切换！
    counter[0] = current + 1

threads = [threading.Thread(target=increment) for _ in range(100)]
for t in threads: t.start()
for t in threads: t.join()
```

如果两个线程同时读取了 `current=0`，然后都写入 `1`，那么计数器只增加了 1，而不是 2。这就是**竞态条件**。

## 4.8.3 同步机制 (Synchronization)

为了解决竞态条件，我们需要保护共享资源，确保同一时刻只有一个线程能访问它。

### 1. 锁 (Locks)

锁是最基本的同步原语。
*   `acquire()`: 获取锁。如果锁已被占用，则等待。
*   `release()`: 释放锁。

```python
lock = threading.Lock()

def safe_increment():
    with lock:  # 自动 acquire 和 release
        current = counter[0]
        counter[0] = current + 1
```

### 2. 队列 (Queues)

`queue.Queue` 是线程安全的队列，非常适合**生产者-消费者**模型。它内部实现了锁，程序员无需手动管理。

```python
from queue import Queue
q = Queue()

# 生产者
q.put(item)

# 消费者
item = q.get()
# 处理 item...
q.task_done()
```

### 3. 屏障 (Barriers)

`threading.Barrier(n)` 允许 n 个线程相互等待，直到所有线程都到达屏障点，然后再同时继续执行。

## 4.8.4 死锁 (Deadlocks)

同步带来了新的问题：**死锁**。
如果线程 A 持有锁 1 等待锁 2，而线程 B 持有锁 2 等待锁 1，两者就会永远僵持下去。

**避免死锁的策略**：
*   按固定顺序获取锁。
*   使用超时机制。
*   尽量减少锁的使用，优先使用消息传递 (Message Passing) 或无锁数据结构。

## 总结：从函数式到分布式

至此，我们完成了 SICP (Composing Programs) 的所有核心章节。回顾我们的旅程：

1.  **函数抽象**: 构建复杂系统的基石。
2.  **数据抽象**: 隔离实现细节与使用接口。
3.  **解释器构造**: 理解编程语言的执行模型。
4.  **分布式与并行**: 跨越单机的界限，连接世界。

计算机科学的本质，就是**管理复杂性**。无论是通过函数封装逻辑，还是通过锁同步线程，我们都在试图在一个混乱的世界中建立秩序。

希望这系列博客能成为你编程之路上的坚实阶梯。

---
*参考链接：*
*   [Composing Programs 4.8 Parallel Computing](https://www.composingprograms.com/pages/48-parallel-computing.html)
