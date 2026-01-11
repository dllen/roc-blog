---
title: "HBase 源码阅读：15. Region 切分 (Split)"
date: 2026-01-12T10:00:00+08:00
tags: [HBase, Source Code, Split, Region]
weight: 15
---

Region Split 是 HBase 实现水平扩展（Scale-out）的基础。当一个 Region 过大时，它会自动分裂成两个。

## 1. 触发时机 (`SplitPolicy`)

HBase 提供了多种 Split 策略，默认是 `IncreasingToUpperBoundRegionSplitPolicy`。

### 1.1 策略逻辑
`Min(MaxFileSize, FlushSize * 2 * RegionCount^3)`
*   刚开始表只有一个 Region，Split 阈值很低（FlushSize * 2 = 256MB）。
*   随着 Region 数量增加，阈值迅速变大，最终稳定在 `MaxFileSize` (默认 10GB)。
*   这避免了小表产生太多小 Region，也避免了大表无法切分。

## 2. 切分流程 (`SplitTransaction`)

这是一个重操作，涉及文件系统操作和元数据更新。

1.  **Prepare**: 初始化，寻找 Split Point（通常是 Region 中最大的 StoreFile 的中间 Key）。
2.  **Execute**:
    *   **Close Parent**: 关闭父 Region，停止写入。
    *   **Create Daughters**: 在 HDFS 上创建两个子 Region 目录。
    *   **Reference File**: 此时并不真正移动数据，而是创建引用文件（Reference File）指向父 Region 的 HFile。
    *   **Update Meta**: 在 Meta 表中标记父 Region Offline，插入两个子 Region。
    *   **Open Daughters**: 开启两个子 Region 服务。
3.  **Rollback**: 如果中间失败，回滚操作。

## 3. Reference File 清理
Split 完成后，父 Region 的数据仍然物理存在。只有当子 Region 发生 Compaction 时，才会将引用文件重写为独立的 HFile。当父 Region 的所有 HFile 都被子 Region 重写后，父 Region 才会被 Master 的 GC 线程清理。

---
**Next**: [HBase 源码阅读：16. 负载均衡 (Assignment & Balancer)](../16-region-assignment/)
