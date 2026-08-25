---
title: "从「独木桥」到「分厂」：一文读懂 NUMA 非一致性内存访问"
date: 2026-08-25T10:00:00+08:00
update_date: 2026-08-25T10:00:00+08:00
description: "用「工厂分厂」的小故事讲透 NUMA（非一致性内存访问）的来龙去脉，再配合 numactl、libnuma、set_mempolicy/mbind 与延迟基准测试等真实代码，手把手演示查看拓扑、绑定内存与 CPU、量化本地/远端访问差异，最后给出数据库场景的调优清单。"
taxonomies:
  tags: [numa, linux, memory, performance, system-programming, database]
---

NUMA 是「多核服务器性能」这条路上绕不开的一个词。很多人在看数据库、中间件的调优文档时，都会撞见 `numactl --interleave=all`、`numa_miss`、`绑定到 NUMA 节点` 这些说法，却说不清它们到底在解决什么问题。

本文借一个「工厂分厂」的小故事建立直觉，再用真实的命令和 C 代码把 NUMA 从「是什么」讲到「怎么调」。

## 1. 一个「工厂分厂」的小故事

> 这个故事的原型来自 openGauss 社区的科普文章《如何通过一个小故事解读 NUMA 技术》，本文做了扩写和补充。

假设你是一家芯片工厂的老板，工厂里有 8 个车间（对应 8 个 CPU 核心）。所有车间要完成生产，都得去同一个仓库（内存）取原材料。这个仓库只有一条通道（内存总线 + 内存控制器），每次只能让一个员工通过，相当于一座**独木桥**。

生意越做越大，老板拉了投资，把车间从 8 个扩到了 16 个。车间变多了，仓库和独木桥却还是原来那一个。于是问题来了：

- 16 个车间的员工同时挤一座独木桥，**排队越来越长**；
- 新老员工为抢通道互相竞争，**整体效率不升反降**；
- 车间离仓库越远，员工跑一趟就越慢。

老板召集车间代表和总线主任开会，拍板了一个方案：**把新增的 8 个车间独立出去，建一座「分厂」**。分厂有自己的仓库和独木桥，自己管自己的原材料。只有当分厂确实需要总厂的原料时，才通过两厂之间的**专用快速通道**去取。

这样一来，大部分取料都在「本地」完成，只有跨厂取料才走专用通道。虽然跨厂取料比本地慢，但本地取料变快了，整体吞吐大幅提升。

这个故事里的每个角色，都对应 NUMA 里的一个真实概念：

| 故事角色 | NUMA 概念 |
|---------|----------|
| 工厂（总厂/分厂） | CPU 插槽（Socket） |
| 车间 | CPU 核心（Core） |
| 仓库 | 内存（Memory） |
| 独木桥 | 内存总线 + 内存控制器（Memory Controller） |
| 分厂 | NUMA 节点（Node） |
| 专用快速通道 | 互联通道（QPI / UPI / Infinity Fabric） |
| 本地取料 | 本地访问（Local Access） |
| 跨厂取料 | 远端访问（Remote Access） |

## 2. 为什么会有 NUMA：UMA 的瓶颈

在 NUMA 出现之前，多核服务器普遍采用 **UMA（Uniform Memory Access，一致性内存访问）** 架构，也叫 SMP（对称多处理器）：

```
          CPU0   CPU1   CPU2   ...   CPUn
            │      │      │           │
            └──────┴──────┴───────────┘
                       │
                 ┌─────▼─────┐
                 │ 内存控制器  │
                 └─────┬─────┘
                       │
                   [内存]
```

所有 CPU 都通过**同一条总线**访问**同一块内存**，所以无论哪个 CPU，访问内存的延迟都是一致的——这就是「一致性（Uniform）」的含义。

这种架构在核心数少的时候简单高效，但有一个致命缺陷：**扩展性差**。核心越多，挤在一条总线上的请求就越多，总线成为性能瓶颈；内存带宽被所有核心争抢，加再多核心也提升不了吞吐。

于是 **NUMA（Non-Uniform Memory Access，非一致性内存访问）** 应运而生：把内存「切分」到各个 CPU 节点上，每个 CPU 优先访问自己直连的那块内存。访问自己直连内存很快（本地访问），访问别的节点的内存要经过互联通道（远端访问），慢一些——访问延迟不再一致，这就是「非一致性」名字的由来。

```
  Node 0                          Node 1
┌──────────────────┐    QPI/UPI  ┌──────────────────┐
│ CPU0 CPU1 CPU2 … │◄───────────►│ CPU8 CPU9 CPU10… │
│       │          │ 互联通道     │       │          │
│  ┌────▼────┐     │             │  ┌────▼────┐     │
│  │ 内存控制器 │     │             │  │ 内存控制器 │     │
│  └────┬────┘     │             │  └────┬────┘     │
│    [本地内存]      │             │    [本地内存]      │
└──────────────────┘             └──────────────────┘
```

## 3. NUMA 的三个核心概念

### 3.1 Node（节点）

一个 NUMA 节点 = **一组 CPU 核心 + 一块它们直连的内存**。一台双路（2 Socket）服务器，通常就有 2 个 NUMA 节点；四路服务器有 4 个。一台服务器有几个 CPU 插槽，通常就有几个 NUMA 节点。

### 3.2 Local / Remote Access

- **本地访问（Local Access）**：CPU 访问自己节点直连的内存，走的是本地内存控制器，延迟低、带宽高。
- **远端访问（Remote Access）**：CPU 访问别的节点的内存，数据要穿过互联通道（Intel 的 QPI/UPI、AMD 的 Infinity Fabric），延迟高、带宽低。

远端访问比本地慢多少？下面会用代码实测。记住结论：**能本地就不要远端**，这正是所有 NUMA 优化的出发点。

### 3.3 Distance（距离）

内核用一张「距离矩阵」来描述访问成本，用 `numactl --hardware` 就能看到。数值是相对成本，`10` 表示本地（基准 1.0×），`20` 大致表示 2.0× 的访问开销。距离矩阵被内核调度器和 `libnuma` 用来评估内存放置的优劣。

## 4. 动手：先看看你机器的 NUMA 拓扑

在 Linux 上，`numactl` 是最常用的 NUMA 工具。先看拓扑：

```bash
$ numactl --hardware
available: 2 nodes (0-1)
node 0 cpus: 0 1 2 3 4 5 6 7
node 0 size: 32768 MB
node 0 free: 30001 MB
node 1 cpus: 8 9 10 11 12 13 14 15
node 1 size: 32768 MB
node 1 free: 30920 MB
node distances:
node   0   1
  0:  10  21
  1:  21  10
```

解读这份输出：

- `available: 2 nodes (0-1)`：这台机器有 2 个 NUMA 节点（双路服务器）。
- `node 0 cpus: 0..7`：编号 0–7 的 CPU 核心属于节点 0；8–15 属于节点 1。
- `node 0 size`：节点 0 直连了 32GB 内存。
- `node distances`：距离矩阵。`0→0` 是 `10`（本地），`0→1` 是 `21`（远端），说明跨节点访问的成本约是本地的 2.1 倍。

没有 `numactl` 的话，也可以直接看 `/sys`：

```bash
$ ls /sys/devices/system/node/
node0  node1  online  possible  ...
$ cat /sys/devices/system/node/node0/cpulist    # 节点 0 上的 CPU
0-7
$ cat /sys/devices/system/node/node0/meminfo     # 节点 0 的内存信息
```

### 4.1 一块内存到底落在哪个节点？

Linux 里每个进程的地址空间被映射到物理页，而物理页分布在不同节点上。查看当前进程的内存分布：

```bash
$ cat /proc/self/numa_maps | head -5
55f4b0d00000 default file=/usr/bin/cat mapped=3 N0=3 kernelpagesize_kB=4
55f4b0f1c000 default anon=2 dirty=2 active=0 N0=2 kernelpagesize_kB=4
7f8b00000000 default heap anon=2 dirty=2 active=0 N0=2 kernelpagesize_kB=4
```

每一行最后的 `N0=xx N1=xx` 就是这块内存区域落在各节点上的页数。上面 `N0=3` 表示有 3 个物理页在节点 0。如果某块内存大量分布在 `N1`，而访问它的 CPU 在节点 0，就会产生大量远端访问。

### 4.2 numastat：一眼看出「远端访问」有多严重

`numastat` 统计每个节点的内存访问命中情况，是排查 NUMA 问题的利器：

```bash
$ numastat
                           node0           node1
numa_hit                 12345678        12000000
numa_miss                 2345678           80000
numa_foreign               80000         2345678
interleave_hit             10000           10000
local_node              12345678        12000000
other_node               2345678           80000
```

几个关键指标：

- **numa_hit**：内存分配在本地节点、且被本地 CPU 访问，命中——**越多越好**。
- **numa_miss**：内存分配在节点 A，却被节点 B 的 CPU 访问——**这是远端访问，越少越好**。
- **numa_foreign**：numa_miss 的镜像（站在「被访问内存所在节点」的角度统计）。
- **other_node**：CPU 跑到别的节点取内存的次数。

如果 `numa_miss` 持续高企，说明有线程/进程「跑偏」了——CPU 和它要访问的内存不在同一个节点。这在数据库场景尤其常见，下面会专门讲。

## 5. 内存分配策略（mempolicy）

Linux 提供了几种内存分配策略（在 `<numaif.h>` 中定义），决定「新分配的内存放在哪个节点」：

| 策略常量 | 含义 |
|---------|------|
| `MPOL_DEFAULT` | 默认：优先从「发起分配的线程」所在的本地节点分配 |
| `MPOL_BIND` | 只在指定节点上分配，其他节点内存不足也不会回退（严格执行） |
| `MPOL_INTERLEAVE` | 在多个节点间**轮流**分配，让内存均匀散布到各节点 |
| `MPOL_PREFERRED` | 优先从指定节点分配，不足时回退到其他节点 |

理解「默认策略」很关键：Linux 默认按**本地节点优先**分配。当一个线程第一次 touch 一块内存（写它）时，页面才会真正分配，且优先分到该线程所在的节点。这就是常说的 **first-touch 策略**——「谁先用，就放到谁家门口」。

这个策略对单线程很友好，但对多线程应用却是隐患：如果一个进程的主线程在节点 0 上先 touch 了一大块内存，之后这块内存被节点 1 上的工作线程疯狂访问，就会产生大量远端访问。

## 6. 代码实战 ①：用 libnuma 绑定内存与 CPU

`libnuma` 封装了 NUMA 相关系统调用，用起来最直观。先装依赖：

```bash
# Debian / Ubuntu
apt install libnuma-dev
# CentOS / RHEL
yum install numactl-devel
```

下面这段代码演示了三件事：查询节点数、在指定节点分配内存、把线程绑定到指定节点：

```c
#include <numa.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    if (numa_available() < 0) {
        fprintf(stderr, "当前系统不支持 NUMA\n");
        return 1;
    }

    int max_node = numa_max_node();
    printf("系统共有 %d 个 NUMA 节点 (0-%d)\n", max_node + 1, max_node);

    // 1) 在节点 0 上分配 1GB 内存
    size_t size = 1UL << 30;                 // 1GB
    char *buf = numa_alloc_onnode(size, 0);  // 指定分配到 node 0
    if (!buf) { perror("numa_alloc_onnode"); return 1; }

    // 2) 把当前线程绑定到节点 0 的 CPU 上
    numa_run_on_node(0);
    printf("线程已绑定到 node 0\n");

    // 3) touch 内存，触发真实物理页分配
    memset(buf, 1, size);

    // 4) 查询 buf 首地址实际落在哪个节点
    int node = -1;
    if (get_mempolicy(&node, NULL, 0, buf,
                      MPOL_F_ADDR | MPOL_F_NODE) == 0) {
        printf("buf 首地址实际落在 node %d\n", node);
    }

    numa_free(buf, size);
    return 0;
}
```

编译运行：

```bash
gcc -O2 -o numa_demo numa_demo.c -lnuma
./numa_demo
# 系统共有 2 个 NUMA 节点 (0-1)
# 线程已绑定到 node 0
# buf 首地址实际落在 node 0
```

要点：`numa_alloc_onnode` 内部其实是对 `mbind` 的封装——先分配、再把内存「绑」到指定节点；`numa_run_on_node(0)` 则把当前线程的 CPU 亲和性设置到节点 0 的 CPU 集合上，两者配合就能做到「CPU 和内存住在一起」。

## 7. 代码实战 ②：set_mempolicy / mbind 系统调用

`libnuma` 底层是三个系统调用：`set_mempolicy`、`mbind`、`get_mempolicy`。直接用它们，可以不依赖 libnuma：

```c
#define _GNU_SOURCE
#include <numaif.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    // nodemask：第 1 位为 1，表示只允许 node 1
    unsigned long nodemask = 1UL << 1;

    // set_mempolicy：为「当前线程之后的新分配」设置策略（MPOL_BIND = 只从 node 1 分配）
    if (set_mempolicy(MPOL_BIND, &nodemask, sizeof(nodemask) * 8) != 0) {
        perror("set_mempolicy");
        return 1;
    }

    // 之后 malloc + memset 的内存会优先落在 node 1
    size_t size = 256UL * 1024 * 1024;  // 256MB
    char *buf = malloc(size);
    if (!buf) { perror("malloc"); return 1; }
    memset(buf, 1, size);
    printf("已用 MPOL_BIND 把 256MB 内存分配在 node 1\n");

    free(buf);
    return 0;
}
```

`set_mempolicy` 影响的是「线程之后新分配的内存」，而 `mbind` 则是「把一块已经存在的内存区域绑定到指定节点」，还能顺带把已有页面迁移过去：

```c
#define _GNU_SOURCE
#include <numaif.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
    size_t size = 256UL * 1024 * 1024;  // 256MB
    char *buf = malloc(size);
    if (!buf) { perror("malloc"); return 1; }

    unsigned long nodemask = 1UL << 1;  // 绑定到 node 1

    // 把 [buf, buf+size) 这段内存绑定到 node 1，并迁移已有页面（MPOL_MF_MOVE）
    if (mbind(buf, size, MPOL_BIND, &nodemask,
              sizeof(nodemask) * 8, MPOL_MF_MOVE) != 0) {
        perror("mbind");
        return 1;
    }

    memset(buf, 1, size);
    printf("已用 mbind 将内存绑定并迁移到 node 1\n");

    free(buf);
    return 0;
}
```

两者区别一句话：**`set_mempolicy` 管「未来」，`mbind` 管「现在这段内存」**。编译时无需链接 libnuma，直接：

```bash
gcc -O2 -o numa_syscall numa_syscall.c
```

## 8. 代码实战 ③：实测本地 vs 远端访问差多少

「远端比本地慢」到底慢多少？写个小基准测试，用 `rdtsc` 读 CPU 时间戳计数器，量化访问延迟。思路是：在节点 0 上分配 1GB 内存，然后分别把线程绑到节点 0（本地）和节点 1（远端）去读它，对比每次访问的周期数：

```c
#define _GNU_SOURCE
#include <numa.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static inline uint64_t rdtsc(void) {
    unsigned int lo, hi;
    __asm__ volatile("rdtsc" : "=a"(lo), "=d"(hi));
    return ((uint64_t)hi << 32) | lo;
}

// 以 stride 为步长，顺序读完整块内存，返回每次访问的平均周期数
static double measure(char *buf, size_t size, size_t stride) {
    size_t iters = size / stride;
    volatile uint64_t sink = 0;

    // 预热：建立 TLB 和缓存，让后续测量稳定
    for (size_t i = 0; i < iters; i++) sink += (uint8_t)buf[i * stride];

    uint64_t start = rdtsc();
    for (size_t i = 0; i < iters; i++) sink += (uint8_t)buf[i * stride];
    uint64_t end = rdtsc();

    (void)sink;
    return (double)(end - start) / (double)iters;
}

int main(void) {
    if (numa_available() < 0) {
        fprintf(stderr, "当前系统不支持 NUMA\n");
        return 1;
    }

    size_t size = 1UL << 30;   // 1GB 缓冲区
    size_t stride = 4096;      // 每次读一个新页，尽量绕过 L3 缓存
    char *buf = numa_alloc_onnode(size, 0);  // 内存固定在 node 0

    // 本地访问：线程跑在 node 0，读 node 0 的内存
    numa_run_on_node(0);
    double local = measure(buf, size, stride);

    // 远端访问：线程跑在 node 1，仍然读 node 0 的内存
    numa_run_on_node(1);
    double remote = measure(buf, size, stride);

    printf("本地访问 (node0 -> node0): %.1f cycles/access\n", local);
    printf("远端访问 (node1 -> node0): %.1f cycles/access\n", remote);
    printf("远端 / 本地 = %.2fx\n", remote / local);

    numa_free(buf, size);
    return 0;
}
```

编译运行（需要 root 或具备内存锁权限，因为 `mbind` 可能要求 CAP_SYS_NICE）：

```bash
gcc -O2 -o numa_latency numa_latency.c -lnuma
sudo ./numa_latency
```

一台典型双路服务器上的结果大致是：

```
本地访问 (node0 -> node0): 82.3 cycles/access
远端访问 (node1 -> node0): 138.6 cycles/access
远端 / 本地 = 1.68x
```

在负载较重时，远端访问的延迟差距还会进一步拉大（互联通道也会饱和）。**这就是 NUMA 优化的全部意义：把 CPU 和它访问的内存放进同一个节点，让绝大多数访问都走「本地」。**

## 9. 内核的自动 NUMA 平衡

手动 `mbind` 又累又容易出错，所以现代 Linux 内核默认开启了 **自动 NUMA 平衡（Automatic NUMA Balancing）**。它周期性地扫描进程的内存页和线程，把「跑到别的节点去的页面」迁移回「正在访问它的线程所在节点」，让 CPU 和内存慢慢「对齐」。

```bash
# 查看是否开启（1 = 开启，0 = 关闭）
$ cat /proc/sys/kernel/numa_balancing
1

# 关闭自动平衡（部分低延迟、大内存页场景会这么做）
$ echo 0 > /proc/sys/kernel/numa_balancing
```

自动平衡对大多数普通工作负载「够用」，但也有代价：迁移本身有开销，扫描线程会消耗 CPU，对**已经手动做好绑定的应用**反而可能是干扰。生产上常见两种选择：

- **交给内核**：不做任何手工绑定，靠自动平衡兜底；
- **手动控制**：用 `numactl` / `mbind` 显式绑定，并视情况关闭自动平衡。

没有银弹，关键是用 `numastat` 观察 `numa_miss`，再决定是否介入。

## 10. 数据库为什么最怕 NUMA

NUMA 问题在数据库身上最明显，openGauss、MySQL、PostgreSQL 概莫能外。原因在于：**数据库的缓冲池（Buffer Pool / shared_buffers）是一块巨大的、被所有工作线程共享的内存**。

典型的坑是这样的：

1. 数据库启动时，主线程在节点 0 上分配并 touch 了缓冲池内存；
2. 由于 first-touch 策略，**整块缓冲池几乎都落到了节点 0**；
3. 但真正干活的查询/写入线程被调度器分散到节点 0 和节点 1；
4. 节点 1 上的线程访问缓冲池，全部变成**远端访问**——延迟变高、吞吐下降。

解决方法有两个方向：

**方案 A：让内存「均匀铺开」——`interleave`**

把缓冲池内存轮询分布到所有节点，这样无论线程跑在哪个节点，都有一部分内存是本地命中。MySQL 甚至有专门的开关 `innodb_numa_interleave`。命令行层面：

```bash
# 让 mysqld 的缓冲池内存均匀散布到所有节点
numactl --interleave=all mysqld
```

**方案 B：让 CPU 和内存「锁死对齐」——`bind`**

把数据库进程固定在某个节点，只使用该节点的 CPU 和内存：

```bash
# 把数据库绑在 node 0：只用 node 0 的 CPU，内存也只在 node 0 分配
numactl --cpunodebind=0 --membind=0 mysqld
```

方案 A 适合「单个大进程用满多节点」的场景；方案 B 适合「一个节点能装下整个工作集」的场景（此时彻底杜绝远端访问，性能最稳）。

再补充几个数据库/虚拟化场景的常用操作：

```bash
# 查看进程当前的 NUMA 绑定
numactl --show

# 查看某个进程的内存分布（按页统计每个节点占用）
numactl --hardware && numastat -p $(pgrep mysqld)

# QEMU/KVM 给虚机构建 NUMA 拓扑，并固定 vCPU 到物理 CPU
# -numa node -numa cpu -numa mem 控制 guest 的 NUMA 布局
```

### 10.1 怎么判断数据库是不是「NUMA 受害者」

三步定位：

1. `numastat` 看 `numa_miss` / `other_node` 是否持续偏高；
2. `cat /proc/$(pgrep mysqld)/numa_maps` 看缓冲池内存是否都堆在一个节点；
3. 对比「绑定前后」的 QPS / 延迟，绑定后若明显改善，即坐实是 NUMA 问题。

## 11. 工程实践清单

把上面的内容浓缩成一份可操作的清单：

| 步骤 | 动作 | 命令 / 工具 |
|------|------|------------|
| 1. 摸清拓扑 | 看节点数、CPU 分布、距离矩阵 | `numactl --hardware`、`lstopo` |
| 2. 看访问命中 | 确认有没有大量远端访问 | `numastat`、`numastat -p <pid>` |
| 3. 看内存分布 | 确认关键内存落在哪个节点 | `/proc/<pid>/numa_maps` |
| 4. 选策略 | 单大进程多节点 → interleave；工作集单节点 → bind | `numactl --interleave=all` / `--cpunodebind --membind` |
| 5. 代码级绑定 | 自己程序内控制 | `numa_alloc_onnode`、`set_mempolicy`、`mbind` |
| 6. 是否关自动平衡 | 已手工绑定且追求极致低延迟时可关 | `echo 0 > /proc/sys/kernel/numa_balancing` |
| 7. 验证效果 | 绑定前后对比 QPS/延迟/`numa_miss` | 压测 + `numastat` |

## 12. 总结

- NUMA 是「把内存分片到各 CPU 节点」的架构，解决的是 UMA 单总线扩展性差的问题；
- 核心矛盾始终是一句话：**本地访问快，远端访问慢**，优化目标就是让 CPU 和内存「住在一起」；
- Linux 通过 `mempolicy`（default/bind/interleave/preferred）控制内存放置，`numactl` 和 `libnuma` 是最顺手的工具；
- 数据库缓冲池是 NUMA 的重灾区，`interleave` 和 `bind` 是两种主流的应对姿势；
- 别忘了用 `numastat` 和 `numa_maps` 做「事前的测量」和「事后的验证」——**先测量，再优化**。

下次再看到 `numactl --interleave=all`，你应该能一眼看出它在解决什么了：把内存均匀撒到所有节点，让多节点的 CPU 都尽量命中本地内存。

## 参考资料

- [如何通过一个小故事解读 NUMA 技术 — openGauss 社区](https://opengauss.org/zh/blogs/zhangcuiping/%E5%A6%82%E4%BD%95%E9%80%9A%E8%BF%87%E4%B8%80%E4%B8%AA%E5%B0%8F%E6%95%85%E4%BA%8B%E8%A7%A3%E8%AF%BBNUMA%E6%8A%80%E6%9C%AF.html)
- [numactl(8) — Linux Manual](https://man7.org/linux/man-pages/man8/numactl.8.html)
- [numa(7) — Linux Manual（NUMA 策略与系统调用详解）](https://man7.org/linux/man-pages/man7/numa.7.html)
- [mbind(2) / set_mempolicy(2) / get_mempolicy(2) — Linux Programmer's Manual](https://man7.org/linux/man-pages/man2/set_mempolicy.2.html)
- [NUMA (Non-Uniform Memory Access): An Overview — ACM Queue](https://queue.acm.org/detail.cfm?id=2513149)
- [MySQL: innodb_numa_interleave 配置说明](https://dev.mysql.com/doc/refman/8.0/en/innodb-parameters.html#sysvar_innodb_numa_interleave)
