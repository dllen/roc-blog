---
title: "Linux TC 进阶：一行命令实现特定流量延迟"
date: 2025-12-04T12:13:32+05:30
update_date: 2025-12-04T12:13:32+05:30
description: "深入解析如何使用 tc 和 iptables 对特定网络流量施加延迟，以及其背后的原理和副作用。"
tags: [Linux, Network, Chaos Engineering]
---

本文将详细解析一行复杂的 `tc` (Traffic Control) 命令。这行命令通常用于混沌工程（Chaos Engineering）或网络模拟测试中，目的是**在不影响其他流量的情况下，精准地对特定数据包施加延迟**。

## 命令全貌

为了方便理解，我们先将这行命令还原为标准的 Shell 脚本格式（假设设备为 `eth0`，延迟为 `100ms`，标记为 `123`）：

```bash
# 1. 创建优先队列
tc qdisc add dev eth0 root handle 1:0 prio bands 4

# 2. 在第4个频带添加延迟
tc qdisc add dev eth0 parent 1:4 netem delay 100ms

# 3. 添加过滤器，将标记为 123 的流量导向第4个频带
tc filter add dev eth0 parent 1:0 prio 4 protocol ip handle 123 fw flowid 1:4
```

在 Go 语言项目中，它通常以字符串格式化的形式出现：

```go
cmdString := fmt.Sprintf(`tc qdisc add dev %s root handle 1:0 prio bands 4 &&\
            tc qdisc add dev %s parent 1:4 netem delay %sms &&\
            tc filter add dev %s parent 1:0 prio 4 protocol ip handle %s fw flowid 1:4`, dev, dev, delayTime, dev, mark)
```

---

## 核心目标

这组命令的**核心目标**是：**在指定的网络设备（如 `eth0`）上，仅对携带特定防火墙标记（fwmark）的数据包施加延迟，而让其他数据包保持原有的转发速度。**

它利用 `iptables` 打标和 `tc` 分流的配合来实现这一精确控制。

---

## 命令拆解分析

这行长命令实际上是由三个独立的 `tc` 子命令通过 `&&` 连接而成的。我们逐一拆解：

### 1. 建立分流枢纽：`prio` 调度器

```bash
tc qdisc add dev %s root handle 1:0 prio bands 4
```

*   **`tc qdisc add`**: 添加一个队列规则（Queueing Discipline）。
*   **`dev %s`**: 指定操作的网卡设备。
*   **`root`**: 挂载到根节点，接管该设备的所有出口流量。
*   **`handle 1:0`**: 给这个规则分配句柄 ID `1:0`。
*   **`prio bands 4`**: 使用 `prio`（优先级）调度器，并创建 4 个频道（bands，编号 0-3）。

**作用**：在网卡出口建立一个拥有 4 条车道的“交通枢纽”。默认情况下，流量会根据优先级进入不同的车道，但我们稍后会强制指定某些流量的去向。

### 2. 制造拥堵路段：`netem` 延迟队列

```bash
tc qdisc add dev %s parent 1:4 netem delay %sms
```

*   **`parent 1:4`**: 关键点！将新规则挂载到刚才 `prio` 调度器的第 4 个频道（Band 3，ID 为 `1:4`）上。
*   **`netem delay %sms`**: 使用 `netem`（网络模拟器）规则，增加 `%s` 毫秒的延迟。

**作用**：将第 4 条车道改造成“拥堵路段”。任何进入这条车道的数据包，都必须等待指定时间才能通过。

### 3. 设置交通警察：`filter` 过滤器

```bash
tc filter add dev %s parent 1:0 prio 4 protocol ip handle %s fw flowid 1:4
```

*   **`parent 1:0`**: 过滤器挂载在主枢纽 `1:0` 上。
*   **`protocol ip`**: 仅处理 IP 协议包。
*   **`handle %s fw`**: 匹配规则。`fw` 代表根据防火墙标记（Firewall Mark）匹配，`%s` 是具体的标记值（如 `123`）。
*   **`flowid 1:4`**: 动作。匹配中的数据包被强制导向 ID 为 `1:4` 的队列（即我们的延迟队列）。

**作用**：在枢纽入口设置“交警”。交警检查数据包的标记，如果发现标记匹配，就强制指挥该数据包走第 4 条“拥堵车道”。

---

## 完整工作流

要让这套机制生效，还需要 `iptables` 的配合。

1.  **打标 (`iptables`)**:
    在数据包离开机器前，用 `iptables` 给特定流量打上标记。例如，给发往 80 端口的 TCP 包打上标记 `123`：
    ```bash
    iptables -t mangle -A OUTPUT -p tcp --dport 80 -j MARK --set-mark 123
    ```

2.  **分流 (`tc`)**:
    *   **普通流量**：没有标记 `123`，经过 `prio` 调度器时，按默认策略（通常走 Band 1 或 Band 2），**无额外延迟**。
    *   **目标流量**：带有标记 `123`，被过滤器捕获，强制送入 Band 3 (`1:4`)，经过 `netem` 增加延迟，**实现慢速传输**。

---

## 潜在风险与副作用

这是一个经常被忽视但至关重要的问题：**这组命令会影响其他未被标记的流量吗？**

**答案是肯定的。**

当你执行 `tc qdisc add dev eth0 root ...` 时，你**替换了**网卡默认的队列调度器（通常是 `fq_codel` 或 `pfifo_fast`）。

*   **默认调度器 (`fq_codel`)**：非常智能，能保证不同连接间的公平性，有效抑制缓冲区膨胀。
*   **当前调度器 (`prio`)**：简单的优先级调度。

**后果**：
未被标记的普通流量虽然不会经过延迟队列，但它们现在由 `prio` 调度器管理。这意味着它们失去了 `fq_codel` 提供的公平性保障。在高负载下，某些流量可能会“饿死”其他流量，或者整体网络抖动变大。

**结论**：此方案非常适合**测试环境**或**故障模拟**，但在生产环境长期运行时需谨慎评估对整体网络模型的影响。

---

## 清理与还原

测试完成后，务必清理规则，恢复网络原状。

```bash
# 1. 清理 tc 规则 (删除 root qdisc 会自动清除所有子 qdisc 和 filter)
tc qdisc del dev eth0 root

# 2. 清理 iptables 规则 (确保与添加时的参数一致，将 -A 换成 -D)
# 例如：
iptables -t mangle -D OUTPUT -p tcp --dport 80 -j MARK --set-mark 123
```

