---
title: "Linux 内存与 PageCache 深度技术手册"
date: 2026-02-27T10:00:00+08:00
update_date: 2026-02-27T10:00:00+08:00
description: "内核机制 · NUMA · cgroup · 云原生数据库调优 · 实战排障。深入解析 Linux PageCache 核心原理、驱逐算法、eBPF 监控及数据库内核级调优实战。"
tags: [linux, memory, pagecache, performance, database, kubernetes, ebpf, numa]
---

## 目录

1.  Linux 内存模型概述
2.  PageCache 工作机制
3.  mmap vs read/write 深度对比
4.  PageCache 驱逐算法（LRU / Multi-Gen LRU）
5.  cgroup 对 PageCache 的隔离与限制机制
6.  NUMA 下 PageCache 分布机制
7.  THP（Transparent Huge Page）对 PageCache 的影响
8.  O_DIRECT 如何绕过 PageCache
9.  eBPF 监控 PageCache 命中率
10. 云原生数据库内存流动全景图
11. 数据库内核级性能调优手册
12. 实战案例：K8s 上 MySQL 性能抖动排查全过程
13. 总结：数据库 + 内核的真实交互模型

---

## 1. 🧠 Linux 内存模型概述

Linux 内存并非“空闲才有价值”，而是遵循一个核心原则：

> **可用内存都会被用于缓存。**

### 核心内存分类

*   **匿名页（Anonymous Pages）**：应用程序动态分配的堆（heap）和栈（stack）内存，无文件背景。
*   **文件页（File Pages / PageCache）**：映射文件的内存页，用于缓存文件数据。
*   **Slab**：内核对象缓存（dentry, inode 等）。
*   **共享内存（Shmem）**：tmpfs, IPC 共享内存。
*   **页表（Page Tables）**：虚拟地址到物理地址的映射表。

### 查看方法

```bash
free -m
cat /proc/meminfo
```

### 关键字段解析

*   **Cached**：PageCache 的大小（通常包含 Shmem）。
*   **Buffers**：块设备元数据的缓存。
*   **Dirty**：等待写入磁盘的脏页大小。
*   **Active(file)**：最近被访问过的文件页（不易回收）。
*   **Inactive(file)**：最近未被访问的文件页（优先回收）。

---

## 2. 🚀 PageCache 工作机制

PageCache 是 Linux 文件 I/O 的统一缓存层。

### 默认 I/O 路径

```mermaid
graph LR
    Disk --> PageCache --> UserBuffer
```
*(注：简单示意图，Markdown 渲染需支持 mermaid，若不支持可忽略)*

```text
磁盘 → PageCache → 用户缓冲区
```

### 核心特点

*   **统一入口**：所有标准 `read/write` 系统调用默认都经过 PageCache。
*   **mmap 映射**：`mmap` 将文件直接映射到用户地址空间，实际上是直接映射了 PageCache 的物理页。
*   **sendfile 优化**：`sendfile` 系统调用直接将 PageCache 中的数据拷贝到 socket buffer（或直接通过 DMA 发送），实现零拷贝。

---

## 3. 🆚 mmap vs read/write 深度对比

### 3.1 read()

**路径**：
```text
磁盘 → PageCache → memcpy → 用户空间
```

**特点**：
*   **系统调用开销**：每次读写都需要发起系统调用（Context Switch）。
*   **内存拷贝**：数据需要在内核态（PageCache）和用户态（User Buffer）之间进行一次拷贝。

### 3.2 mmap()

**路径**：
```text
磁盘 → PageCache ↔ 页表映射 ↔ 用户空间
```

**触发路径**：
```c
do_user_addr_fault
  → handle_mm_fault
    → filemap_fault
```

### 3.3 关键差异对比表

| 项目 | read | mmap |
| :--- | :--- | :--- |
| **系统调用频率** | 高频（每次读写） | 低（建立映射一次，后续缺页触发） |
| **内存拷贝** | 有（内核→用户） | 无（直接访问物理页） |
| **Page Fault** | 无（除非 buffer 未分配） | 有（缺页加载时触发） |
| **小块 I/O 性能** | 较慢（syscall 开销大） | 更优（直接内存访问） |
| **编程复杂度** | 低 | 高（需处理信号、对齐等） |

---

## 4. 🧹 PageCache 驱逐算法

Linux 内核需要决定何时回收内存，以及回收哪些内存。

### 4.1 经典 LRU（Active / Inactive）

每个 NUMA node 下维护了多条 LRU 链表：

*   `active_file`
*   `inactive_file`
*   `active_anon`
*   `inactive_anon`

**驱逐顺序（通常）**：
```text
inactive_file → active_file → inactive_anon → active_anon
```

*   **File Pages 优先**：内核倾向于优先回收文件页（PageCache），因为它们是“干净”的（或易于写回），且可以重新从磁盘读取。
*   **Swappiness**：`vm.swappiness` 参数控制内核在回收匿名页和文件页之间的偏好。

**核心函数**：
```c
shrink_lruvec()
```

### 4.2 Multi-Gen LRU（MGLRU）

新内核（Linux 6.1+）引入了多代 LRU 算法（Multi-Gen LRU）：

```text
Generation 0 (Oldest)
Generation 1
Generation 2
...
Generation N (Youngest)
```

**优点**：
*   **更精准的冷热识别**：通过多代际跟踪页面访问历史，避免“一次性扫描”导致的热数据误杀。
*   **降低 CPU 开销**：减少了锁竞争和遍历链表的开销。
*   **稳定性提升**：在大内存服务器和高并发场景下，显著减少了内存抖动和 OOM 风险。

---

## 5. 🛡️ cgroup 对 PageCache 的隔离与限制机制

在 cgroup v2 中，PageCache 的管理更加精细。

> **关键点：PageCache 计入 memory.current**

### cgroup 内存结构

```text
mem_cgroup
  → per-node lruvec
```

### 关键参数

*   **memory.max**：硬限制。达到此限制时，触发 OOM Kill。
*   **memory.high**：软限制。达到此限制时，进程会被 throttle（强制休眠）并触发内存回收。
*   **memory.low**：保护阈值。尽量不回收低于此值的 cgroup 内存。
*   **memory.swap.max**：Swap 使用上限。

### 回收机制

当某容器内存达到 `memory.high` 时：
1.  触发 `memcg reclaim`。
2.  内核尝试只回收该 cgroup 内的 PageCache 和匿名页。

**在 Kubernetes 中：**
> **PageCache 也属于 Pod 内存消耗**。如果应用大量读写文件导致 PageCache 增长，可能会撑满 Pod 的内存限制，导致应用被 OOM Kill（如果未正确配置驱逐策略）。

---

## 6. 🌐 NUMA 下 PageCache 分布机制

在 NUMA（Non-Uniform Memory Access）架构下：

*   **本地分配**：默认情况下，PageCache 分配在当前发起 I/O 的 CPU 所在的 NUMA node 上。
*   **独立 LRU**：每个 NUMA node 都有自己独立的 LRU 链表和回收机制。

### 查看 NUMA 状态

```bash
numactl --hardware
numastat -m
```

### 风险与挑战

*   **跨 Node 访问**：如果 CPU 0 频繁访问分配在 Node 1 上的 PageCache，会产生远程内存访问延迟。
*   **热点不均衡**：如果某个 Node 的内存被 PageCache 占满，可能会触发该 Node 的严重回收（Zone Reclaim），即使其他 Node 还有大量空闲内存。

### 优化建议

```bash
# 绑定进程到特定 CPU 和内存 Node
numactl --cpunodebind=0 --membind=0 <command>
```

---

## 7. 🐘 THP（Transparent Huge Page）对 PageCache 的影响

**默认行为**：THP（透明大页）默认主要作用于**匿名页**（Anonymous Pages），通常不直接作用于普通文件系统的 PageCache（tmpfs/shmem 除外）。

### 潜在风险

*   **Memory Compaction 抖动**：为了分配 2MB 的大页，内核需要整理内存碎片，这会导致 CPU 飙升和延迟增加（Latency Spike）。
*   **内存放大**：小对象也占用大页，可能导致内存浪费。

### 数据库环境建议

**强烈建议关闭 THP**：

```bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag
```

---

## 8. 🛣️ O_DIRECT 如何绕过 PageCache

### 默认路径 vs O_DIRECT

**默认路径**：
```text
磁盘 → PageCache → 用户 buffer
```

**使用 O_DIRECT**：
```c
open("file", O_DIRECT | O_RDWR);
```
**O_DIRECT 路径**：
```text
磁盘 → 用户 buffer
```

### 优缺点分析

**优点**：
*   **避免双重缓存**：数据库（如 MySQL, Oracle）通常有自己的 Buffer Pool，使用 O_DIRECT 避免了数据在 PageCache 和 Buffer Pool 中存两份。
*   **精准控制刷盘**：数据库可以精确控制数据何时持久化，符合 ACID 要求。
*   **减少 CPU 开销**：省去了内核态到用户态的内存拷贝。

**缺点**：
*   **必须对齐**：内存缓冲区和文件偏移量必须按扇区大小（通常 512B 或 4KB）对齐。
*   **无 Readahead**：失去了内核自动预读的优化，需要应用自己实现预读。

### MySQL InnoDB 配置

```ini
innodb_flush_method=O_DIRECT
```

---

## 9. 🕵️ eBPF 监控 PageCache 命中率

传统工具（如 `free`, `vmstat`）只能看到总量，看不到命中率。eBPF 可以深入内核观测。

### 关键指标

*   **Minor Fault**：内存中存在（PageCache 命中）。
*   **Major Fault**：内存中不存在，需读磁盘（PageCache 未命中）。

### 简单查看

```bash
cat /proc/[pid]/stat
# 关注第 10 (minflt) 和 12 (majflt) 列
```

### 使用 bpftrace 实时追踪

```bash
# 统计各进程触发的文件缺页次数
bpftrace -e 'kprobe:filemap_fault { @[comm] = count(); }'
```

### BCC 工具集推荐

*   **cachetop**：实时显示各进程的 PageCache 命中率。
*   **fileslower**：追踪慢文件读写。
*   **biolatency**：统计块设备 I/O 延迟分布。

---

## 10. ☁️ 云原生数据库内存流动全景图

以 MySQL 为例，在 Kubernetes 环境下的内存流动：

```text
用户查询
   ↓
InnoDB Buffer Pool (用户态缓存)
   ↓ miss
PageCache (内核态缓存) -- [受限于 memory.limit]
   ↓ miss
磁盘 (PV/PVC)
```

### Kubernetes Pod 内存构成

```text
Pod memory.limit
  ├── Buffer Pool (匿名页)
  ├── PageCache (文件页)
  ├── Slab (内核对象)
  ├── 线程栈 (匿名页)
  └── 页表
```

**核心矛盾**：
> **PageCache 和 Buffer Pool 都在同一个 `memory.limit` 限制下竞争内存。**
> 如果 PageCache 增长过快，可能会导致 Buffer Pool 的内存申请失败（如果未预留），或者引发剧烈的内存回收。

---

## 11. 🔧 数据库内核级性能调优手册

### 11.1 缓存策略选择

#### 模式 A：数据库控缓存（推荐 MySQL/Oracle）
*   **机制**：数据库维护巨大的 Buffer Pool。
*   **配置**：使用 `O_DIRECT` 绕过 PageCache。
*   **优势**：数据库更懂数据热度，避免双重缓存浪费内存。

#### 模式 B：依赖 OS 缓存（如 PostgreSQL, Elasticsearch, Kafka）
*   **机制**：利用 PageCache 进行缓存。
*   **配置**：标准 `read/write` 或 `mmap`。
*   **注意**：**必须**为 OS 预留足够的内存用于 PageCache，不能将 `memory.limit` 全部分配给 JVM Heap 或 Shared Buffers。

### 11.2 推荐内核参数

```bash
# 降低 swap 倾向，数据库尽量不 swap
vm.swappiness = 1

# 脏页回写策略：控制脏页在内存中的比例，避免刷盘时 I/O 阻塞
vm.dirty_ratio = 10           # 绝对限制，超过此比例进程同步刷盘（阻塞）
vm.dirty_background_ratio = 5 # 后台回写阈值，超过此比例后台线程开始刷盘
vm.dirty_expire_centisecs = 3000 # 脏页过期时间 30秒
```

### 11.3 cgroup 推荐策略（K8s）

```yaml
resources:
  requests:
    memory: "8Gi"
  limits:
    memory: "8Gi" # BestEffort QoS 容易被驱逐，建议 Guaranteed
```

**cgroup v2 下的微调（如果支持）**：
```ini
memory.high = 90% * memory.max  # 提前触发回收，避免直接 OOM
memory.max  = 100%
memory.low  = 50% * memory.max  # 保护核心工作集不被轻易回收
```

### 11.4 NUMA 优化

*   **绑定 CPU**：`static` CPU Manager policy (K8s)。
*   **关闭 NUMA 均衡**：`kernel.numa_balancing = 0` (通常数据库自己管理更好)。
*   **BIOS 设置**：关闭 SNC (Sub-NUMA Clustering) 如果不需要极致的本地化优化。

### 11.5 关闭 THP

生产环境数据库服务器强烈建议关闭：

```bash
# 运行时关闭
echo never > /sys/kernel/mm/transparent_hugepage/enabled
echo never > /sys/kernel/mm/transparent_hugepage/defrag
```

---

## 12. 💥 实战案例：K8s 上 MySQL 性能抖动排查

### 背景

*   **应用**：MySQL 8.0
*   **配置**：Pod `memory.limit` = 8GB, `innodb_buffer_pool_size` = 6GB
*   **现象**：每隔一段时间，P99 延迟飙升，I/O 利用率打满，但 CPU 利用率不高。

### 排查步骤

#### 1️⃣ 检查 memory.current
发现 `memory.current` 长期接近 8GB（limit）。

#### 2️⃣ 查看 memory.events
查看 cgroup 的内存事件：
```bash
cat /sys/fs/cgroup/.../memory.events
```
发现 `high` 计数持续增加，说明频繁触发了 cgroup 级的内存回收。

#### 3️⃣ 查看 Page Fault
使用 `sar -B` 或 `vmstat`，发现高峰期 `majflt` (Major Fault) 激增。这意味读取数据时发生了物理磁盘 I/O。

### 根因分析

1.  **内存布局拥挤**：Buffer Pool 占 6GB，mysqld 自身开销 + 线程栈 + 系统开销可能占 1GB+。剩余给 PageCache 的空间不足 1GB。
2.  **日志写入**：MySQL 生成 Binlog 和 Redo Log，这些是文件写入，会产生 PageCache（Dirty Pages）。
3.  **内存竞争**：日志产生的 PageCache 挤占了内存空间，导致 cgroup 达到限制。
4.  **恶性循环**：内核为了释放内存，回收了部分“冷”的 Buffer Pool 页面（如果是 mmap 方式）或者其他必要的代码段/文件页。当 MySQL 再次访问这些页面时，触发 Major Fault，阻塞 I/O。

### 解决方案

1.  **开启 O_DIRECT**：确保 `innodb_flush_method=O_DIRECT`。这样 InnoDB 数据读写不占用 PageCache，只有 Binlog/Redo Log 占用。
2.  **限制 Dirty Ratio**：调低 `vm.dirty_ratio`，让脏页更平滑地刷盘，避免瞬间积压占用大量内存。
3.  **调整 Buffer Pool**：留出更多 Headroom。例如设置 Buffer Pool 为 5GB，给 OS 留出更多缓冲空间。
4.  **关闭 THP**：消除 Compaction 带来的 CPU 抖动。

**结果**：调整后，Major Fault 降低 90%，P99 延迟恢复平稳。

---

## 13. 📝 终极总结：数据库 + 内核的真实交互模型

### 核心矛盾
*   **裸机环境**：**PageCache 与匿名页的全局竞争**。
*   **容器环境**：**memcg 限制 + PageCache 堆积 + NUMA 不均 + 脏页写回策略** 的叠加效应。

### 调优核心四要素

1.  **决定谁管理缓存**：数据库自己管（O_DIRECT）还是交给 OS（PageCache）。
2.  **控制边界**：确保缓存（尤其是 PageCache）不会无限膨胀触碰 cgroup 限制。
3.  **控制分布**：NUMA 绑定减少远程访问。
4.  **控制节奏**：平滑脏页写回，避免 I/O 阻塞。

---

## 一句话收尾

Linux 内存管理不是“内存够不够”的问题，而是：

> **缓存由谁控制，以及在什么边界内控制。**

---

*参考资料：*

*   kernel.org, Linux Memory Management Documentation
*   [一文搞清楚linux系统内存详情：buffer/cache等 - 知乎](https://zhuanlan.zhihu.com/p/585813632)
*   [《Linux内核技术实战》](https://fanlv.fun/2020/09/13/linux-in-action/)
*   [译｜Linux Page Cache mini book](https://www.cyningsun.com/12-11-2024/linux-page-cache-minibook-cn.html)
*   [Linux PageCache详解 | 一蓑烟雨任平生](https://www.sunliaodong.cn/2021/03/11/Linux-PageCache%E8%AF%A6%E8%A7%A3/)
*   [自用型监控系统方案 | 心静思远](https://mingming.tech/2018/03/14/HighAvailability/2018-03-14-monitor-system/)
