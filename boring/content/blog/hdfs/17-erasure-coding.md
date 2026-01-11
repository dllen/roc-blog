---
title: "HDFS 源码阅读：17. 纠删码 (Erasure Coding)"
date: 2026-01-28T10:00:00+08:00
description: "Hadoop 3.0 的重磅特性。解析 EC 如何用 1.5 倍的存储开销实现 3 倍副本的可靠性。"
tags: [Hadoop, HDFS, Erasure Coding, Storage Efficiency]
weight: 17
---

传统的 3 副本机制虽然可靠，但存储利用率只有 33% (1TB 数据占 3TB 空间)。Erasure Coding (EC) 将这一利用率提升到了 50% 甚至更高。

## 1. 原理 (Reed-Solomon)

EC 将数据切分为 $k$ 个数据块，计算出 $m$ 个校验块。总共存储 $k+m$ 个块。
只要任意 $k$ 个块存在，就能通过矩阵运算恢复出所有数据。允许同时损坏 $m$ 个块。

例如 RS(6, 3)：
*   6 个数据单元 + 3 个校验单元 = 9 个单元。
*   利用率：6/9 = 67%。
*   容错：允许挂掉 3 个。

相比 3 副本（利用率 33%，允许挂 2 个），EC 在节省一半存储空间的同时，提供了更强的容错能力。

## 2. Striped Block (条带化块)

HDFS 引入了新的 Block 布局：**Striping**。

*   **逻辑 Block**: 对 Client 来说，文件依然由 Block 组成。
*   **物理存储**: 逻辑 Block 被切分为更小的 **Cell** (默认 1MB)，轮询写入不同的 DataNode。
*   **Block Group**: 一组 DataNode 共同存储一个逻辑 Block 的所有 Strip 和 Parity。

## 3. 读写流程的变化

*   **写**: Client 需要缓冲足够的数据，计算 Parity，然后并行发给多个 DataNode。
*   **读**:
    *   **正常**: 并行从数据 DataNode 读取。
    *   **修复**: 如果某个 DataNode 挂了，Client 需要从其他 DataNode 读取数据和校验块，在本地解码恢复数据。

## 4. 适用场景

EC 编解码消耗 CPU。因此 EC 适合 **冷数据 (Cold Data)** 或 **温数据**，不适合频繁写入和覆盖的热数据。

HDFS 允许对目录设置 EC 策略，新写入该目录的文件自动采用 EC 存储。

## 5. 总结

EC 是大数据存储降本增效的利器。
