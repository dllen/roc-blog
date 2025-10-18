---
title: "1brc CalculateAverage_thomaswue 代码解读"
date: 2025-09-01T12:13:32+05:30
description: "这段代码是一个高性能的 Java 程序，用于计算一个大型文件（measurements.txt）中温度数据的统计信息（最小值、平均值、最大值）。它通过多线程、内存映射文件和优化算法实现了极高的性能（0.31 秒 vs 参考实现 120.37 秒）。"
tags: [Java]
---

这是一个高性能的Java程序，用于解决"1 Billion Row Challenge"（十亿行挑战）问题。该程序专门用于快速处理大量温度测量数据。详细解读：

## 程序整体架构

### 1. 多进程设计

```java
private static void spawnWorker() throws IOException {
    // 启动工作子进程，主进程负责启动和收集结果
    // 子进程负责实际的数据处理工作
}
```

- 使用子进程处理数据，主进程快速返回结果
- 避免内存映射清理延迟问题

### 2. 并行处理策略

```java
int numberOfWorkers = Runtime.getRuntime().availableProcessors();
// 每个CPU核心创建一个工作线程
```

## 核心优化技术

### 1. 内存映射 + Unsafe操作

```java
final long fileStart = fileChannel.map(FileChannel.MapMode.READ_ONLY, 0, fileSize, 
    java.lang.foreign.Arena.global()).address();
```

- 直接内存映射文件，避免传统IO开销
- 使用`sun.misc.Unsafe`进行底层内存操作

### 2. 分段并行处理

```java
private static final int SEGMENT_SIZE = 1 << 21; // 2MB段
```

- 将文件分成2MB的段
- 使用工作窃取模式而非简单的平均分配

### 3. 三路并行扫描

```java
long dist = (segmentEnd - segmentStart) / 3;
Scanner scanner1 = new Scanner(segmentStart, midPoint1);
Scanner scanner2 = new Scanner(midPoint1 + 1, midPoint2);
Scanner scanner3 = new Scanner(midPoint2 + 1, segmentEnd);
```

- 每个段内部再分成3部分，同时处理
- 提高单线程内的并行度

### 4. 无分支数字解析

```java
private static long convertIntoNumber(int decimalSepPos, long numberWord) {
    // Quan Anh Mai的无分支数字解析算法
    // 避免条件分支导致的CPU流水线停顿
}
```

### 5. 位操作优化的分隔符查找

```java
private static long findDelimiter(long word) {
    long input = word ^ 0x3B3B3B3B3B3B3B3BL; // 查找';'字符
    return (input - 0x0101010101010101L) & ~input & 0x8080808080808080L;
}
```

- 一次操作可以在8个字节中查找分隔符
- 避免逐字节比较

### 6. 高效哈希表

```java
private static final int HASH_TABLE_SIZE = 1 << 17; // 128K
```

- 使用开放寻址法处理哈希冲突
- 针对城市名称优化的哈希函数

### 7. 字符串比较优化

```java
// 直接比较内存中的long值而非字符串
if (existingResult.firstNameWord == word && existingResult.secondNameWord == word2) {
    return existingResult;
}
```

## 性能特点

### 处理速度

- 在Intel i9-13900K上运行时间：0.31秒
- 相比参考实现的120.37秒，提升约388倍

### 关键优化来源

1. **内存映射** - 消除文件IO开销
2. **SIMD式处理** - 8字节批量操作
3. **无分支算法** - 避免CPU分支预测失败
4. **多级并行** - 进程+线程+段内并行
5. **缓存友好** - 连续内存访问模式

## 数据结构

### Result类

```java
private static final class Result {
    long firstNameWord, secondNameWord; // 城市名前16字节
    short min, max;                     // 最小/最大温度
    int count;                          // 记录数量
    long sum;                           // 温度总和
    long nameAddress;                   // 名称在内存中的地址
}
```

这个程序展示了现代Java在极端性能优化方面的能力，通过底层内存操作、并行计算和算法优化，实现了接近C/C++级别的性能。
