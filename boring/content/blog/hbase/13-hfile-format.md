---
title: "HBase 源码阅读：13. HFile 格式解析"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, HFile, File Format]
weight: 13
---

HFile 是 HBase 存储数据的物理格式，借鉴了 SSTable 的设计。目前主流是 HFile V3。

## 1. 逻辑结构

HFile 从逻辑上由一系列 Block 组成，文件尾部是 Trailer。

```text
[ Data Block 1 ]
[ Data Block 2 ]
...
[ Leaf Index Block ]
[ Bloom Filter Block ]
[ Meta Block ]
[ File Info ]
[ Trailer ]
```

## 2. Data Block (数据块)
存储实际的 KeyValue 数据。默认大小 64KB (`hbase.mapreduce.hfileoutputformat.blocksize`)。
*   **Magic**: Header。
*   **KeyValue**: 紧凑排列的 KV。为了压缩，Key 的一部分可能会被省略（Prefix Encoding）。

## 3. Index Block (索引块)
为了快速定位 RowKey 在哪个 Data Block 中。
*   **Multi-Level Index**: 如果索引块太多，会建立多级索引（Root Index -> Leaf Index）。
*   索引内容：`Block Offset` + `Start Key`。

## 4. Bloom Filter Block
*   **Row Bloom**: 判断 RowKey 是否存在。
*   **RowCol Bloom**: 判断 RowKey + Column Family + Qualifier 是否存在。
*   极大地减少了不必要的 Block 读取。

## 5. Trailer
*   定长，存储了 File Info 的偏移量、Data Index 的偏移量等核心指针。
*   读取 HFile 时，首先读取 Trailer。

---
**Next**: [HBase 源码阅读：14. BlockCache 缓存](../14-blockcache/)
