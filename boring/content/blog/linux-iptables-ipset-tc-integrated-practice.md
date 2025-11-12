---
title: "Linux iptables、ipset 与 tc 的综合应用实践"
date: "2025-10-25T10:00:00+08:00"
update_date: "2025-10-25T10:00:00+08:00"
description: "以可操作的完整案例讲解防火墙过滤与带宽控制的组合方案，覆盖命令参数、验证与最佳实践。"
tags: ["Linux", "网络", "iptables", "ipset", "tc", "流量控制", "防火墙"]
---

# 引言

在中小规模到企业生产环境中，常需要同时满足“连接访问控制”与“带宽/队列管理”。Linux 生态提供了三件利器：
- iptables：基于 Netfilter 的防火墙规则管理，负责匹配并决定包的命运（ACCEPT/DROP/LOG 等）
- ipset：高效维护 IP、网段等集合，供 iptables 高速匹配，适合批量名单/黑白名单场景
- tc（Traffic Control）：基于 qdisc/class/filter 的流量控制，对包进行分类、整形与队列管理，实现带宽限制与延迟优化

三者组合可实现“按集合过滤 + 按集合限速”的统一方案，且不依赖上层代理或应用改造。

---

# 技术背景与核心功能

- iptables（过滤防火墙）
  - 核心概念：表（`filter`/`nat`/`mangle`/`raw`/`security`）、链（`INPUT`/`FORWARD`/`OUTPUT`/`PREROUTING`/`POSTROUTING`）
  - 常见模块：`-m set`（与 ipset 集合匹配）、`-m state/conntrack`（连接状态）、`-m tcp/udp`（端口）
  - 典型用途：按源/目的 IP、端口、协议过滤；日志记录；打标（`-j MARK`）为后续路由/流控使用

- ipset（集合加速）
  - 集合类型：`hash:ip`、`hash:net`、`bitmap:ip`、`list:set` 等，支持 `timeout`、`maxelem`、`hashsize`
  - 典型用途：维护黑白名单、限速名单、DDoS 封禁集合；动态增删元素而无需频繁改 iptables 规则

- tc（流量控制）
  - 组件：qdisc（队列策略，如 `htb`、`tbf`、`fq_codel`）、class（类）、filter（过滤器，如 `fw`/`u32`/`flower`）
  - 典型用途：带宽整形（rate/ceil）、队列调度（延迟控制/拥塞管理）、分流分类（不同业务或不同 IP 的通道隔离）

- 组合优势与典型场景
  - 将集合匹配与带宽控制打通：iptables 在 `mangle` 打标，tc 用 `fw` filter 读取 `skb->mark` 分类
  - 场景示例：
    - 为某 IP 集合限制总带宽，同时禁止其访问敏感端口
    - DDoS 下快速封禁集合并限速保护核心服务
    - 多租户/环境隔离：不同租户 IP 集合分配不同通道与速率

---

# 完整管控案例设计：限制特定 IP 集合的带宽并过滤其访问

目标：
- 建立 `restricted_clients` 集合，限制其下行/上行总带宽至 10 Mbit，并禁止访问 `tcp/22`，只允许 `tcp/80`/`443`
- 通过 iptables+ipset 实现过滤与打标，通过 tc 实现整形与分类

网络示意（简化 ASCII）：
```
[Clients in restricted_clients] --(eth0)--> [Server]
        | iptables(mangle: MARK) + filter(DROP/ACCEPT)
        v
      tc(htb classes) <- fw filter by mark
```

## 步骤一：使用 ipset 创建与管理 IP 集合

```bash
# 创建集合：hash:ip 类型，支持最多 65536 个元素，默认无超时
sudo ipset create restricted_clients hash:ip maxelem 65536

# 增加若干 IP（示例）
sudo ipset add restricted_clients 203.0.113.10
sudo ipset add restricted_clients 203.0.113.11
sudo ipset add restricted_clients 203.0.113.12

# 查看集合与统计
sudo ipset list restricted_clients
```

参数说明：
- `hash:ip`：适合离散 IP 集；如批量网段可用 `hash:net`
- `maxelem`：最大元素数，需结合内存与性能规划
- `timeout`：可选，为元素设置过期时间（秒），便于临时封禁

## 步骤二：通过 iptables 设置基于 ipset 的过滤与打标规则

建议在 `mangle` 表的 `PREROUTING`/`OUTPUT` 早期对包打标，减少后续模块开销。

```bash
# 1) mangle 表：对来自 restricted_clients 的包打标 0x1（十六进制）
sudo iptables -t mangle -A PREROUTING -m set --match-set restricted_clients src \
  -j MARK --set-mark 0x1

# 2) filter 表：拒绝其访问敏感端口（示例：SSH 22）
sudo iptables -A INPUT -p tcp --dport 22 -m set --match-set restricted_clients src -j DROP

# 3) filter 表：允许 HTTP/HTTPS（80/443），其余端口默认策略按需设置
sudo iptables -A INPUT -p tcp -m multiport --dports 80,443 \
  -m set --match-set restricted_clients src -j ACCEPT

# 4) 可选：对不在集合的流量按默认策略（示例：允许已建立连接）
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```

参数说明：
- `-t mangle`：适合做标记与特殊处理（不改变连接状态）
- `-m set --match-set NAME src|dst`：匹配集合与方向（源/目的 IP）
- `-j MARK --set-mark`：设置包标记供路由/tc 使用
- `-m multiport`：端口组合匹配，简化规则

## 步骤三：结合 tc 对特定 IP 集合进行带宽限制（按标记分类）

tc 以“设备维度”工作，通常在出口（egress）整形。若需入口（ingress）限速，建议使用 `ifb` 虚拟设备做重定向（下文扩展说明）。

示例：在 `eth0` 上创建 HTB 根队列，分两个类：默认类与限速类，使用 `fw` 过滤器按标记将集合流量导向限速类。

```bash
# 1) 创建根 qdisc：HTB，默认 class id 1:30
sudo tc qdisc add dev eth0 root handle 1: htb default 30

# 2) 创建类：为 restricted_clients 分配 10Mbit（可调），普通流量 100Mbit
sudo tc class add dev eth0 parent 1: classid 1:10 htb rate 10mbit ceil 10mbit prio 1
sudo tc class add dev eth0 parent 1: classid 1:30 htb rate 100mbit ceil 100mbit prio 2

# 3) 为类挂队列（可选优化：FQ-CoDel 降低排队延迟）
sudo tc qdisc add dev eth0 parent 1:10 handle 10: fq_codel
sudo tc qdisc add dev eth0 parent 1:30 handle 30: fq_codel

# 4) 过滤器：按 fw 标记 0x1 将流量导入 1:10（限速类）
sudo tc filter add dev eth0 parent 1: protocol ip prio 10 handle 0x1 fw flowid 1:10
```

参数说明：
- `htb`：分层令牌桶，适合多类带宽分配与上限控制（`rate`/`ceil`）
- `fq_codel`：队列算法，抑制 Bufferbloat，改善交互延迟
- `fw filter`：按 `skb->mark` 分类；iptables 置位的 `MARK` 在此生效
- `rate/ceil`：保证速率与上限；必要时结合 `burst/cburst`（令牌桶突发）

---

# 配置完整示例与逐项说明

```bash
# ==== ipset ====
# 创建集合并导入样例 IP
ipset create restricted_clients hash:ip maxelem 65536
ipset add restricted_clients 203.0.113.10
ipset add restricted_clients 203.0.113.11
ipset add restricted_clients 203.0.113.12

# ==== iptables ====
# mangle 表：标记集合流量为 0x1（PREROUTING 更早匹配）
ip
tables -t mangle -A PREROUTING -m set --match-set restricted_clients src -j MARK --set-mark 0x1

# filter 表：禁止集合访问 SSH（22）
iptables -A INPUT -p tcp --dport 22 -m set --match-set restricted_clients src -j DROP

# filter 表：允许集合访问 80/443
iptables -A INPUT -p tcp -m multiport --dports 80,443 -m set --match-set restricted_clients src -j ACCEPT

# 一般允许已建立连接，避免误伤
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# ==== tc ====
# HTB 根队列，默认类 1:30（普通流量）
tc qdisc add dev eth0 root handle 1: htb default 30

# 创建限速类（集合流量）与普通类
tc class add dev eth0 parent 1: classid 1:10 htb rate 10mbit ceil 10mbit prio 1
tc class add dev eth0 parent 1: classid 1:30 htb rate 100mbit ceil 100mbit prio 2

# 为类挂 FQ-CoDel 队列（可选）
tc qdisc add dev eth0 parent 1:10 handle 10: fq_codel
tc qdisc add dev eth0 parent 1:30 handle 30: fq_codel

# 按 fw 标记分类：0x1 -> 1:10（限速）
tc filter add dev eth0 parent 1: protocol ip prio 10 handle 0x1 fw flowid 1:10
```

验证方法：
```bash
# 查看 ipset 集合及命中统计
ipset list restricted_clients

# 查看 iptables 规则与计数
iptables -t mangle -vnL PREROUTING
iptables -vnL INPUT

# 查看 tc 类与队列统计（字节/包/丢弃等）
tc -s class show dev eth0
tc -s qdisc show dev eth0

# 进行带宽测试（从集合中的客户端发起）
iperf3 -c <server-ip> -p 5201
# 期望限速类吞吐 ≈ 10Mbit，普通类不受影响
```

---

# 应用场景扩展与最佳实践

- 企业网络管理
  - 租户/部门/分环境的 IP 集合管理（ipset），配合 iptables 做端口准入控制
  - 按集合限速（tc/htb + fw filter），保障核心业务优先级

- DDoS 防护（基础版）
  - 通过 ipset 快速维护黑名单；iptables 直接 DROP 或限速打标
  - 结合 `hashlimit` 模块对新建连接速率限流（如 SYN），减轻峰值冲击

- 性能优化建议
  - 集合规模规划：`maxelem/hashsize` 与内存开销权衡；批量导入用 `ipset restore`
  - 规则层次清晰：先 mangle 打标，后 filter 做准入；减少重复匹配
  - 队列算法选择：默认 `fq_codel` 提升交互；大带宽可评估 `cake`
  - 入口限速：使用 ifb 重定向 ingress
    ```bash
    # 创建 ifb 并启用
    modprobe ifb
    ip link add ifb0 type ifb
    ip link set ifb0 up

    # 将 eth0 ingress 重定向到 ifb0
    tc qdisc add dev eth0 handle ffff: ingress
    tc filter add dev eth0 parent ffff: protocol ip u32 match u32 0 0 \
      action mirred egress redirect dev ifb0

    # 在 ifb0 上做 HTB/TBF 等入口整形
    tc qdisc add dev ifb0 root handle 2: htb default 20
    # ... 类与过滤器同上（可按 mark 或 u32/flower 匹配）
    ```

---

# cgroup 网络空间集成实践

## Host 网络模式 vs 非 Host 网络模式

本文前面介绍了按进程（cgroup）、按目的地址集合（ipset）和按接口/队列（tc）的整形与管控。本小节聚焦容器/进程的网络命名空间（netns）维度，解释 Host 网络模式与独立网络命名空间（非 Host 模式）的差异及实操要点。

### 1) 网络隔离性
- Host 模式：进程/容器直接加入宿主机的网络命名空间，复用同一网络栈与接口（如 `eth0`、`lo`）。没有网络隔离，容器内看到的 `127.0.0.1` 与宿主机一致。
- 非 Host 模式：为进程/容器创建独立的网络命名空间，通常通过 `veth` 与宿主机桥接（bridge）或使用 `macvlan/ipvlan` 等机制。命名空间间网络栈相互隔离，需要显式路由/端口映射才能互访。

### 2) 网络配置
- Host 模式：
  - 使用宿主机 IP 与端口，直接在主机 `iptables`/`tc` 规则范围内活动。
  - 端口冲突需自行避免（容器与宿主机服务共享同一端口空间）。
- 非 Host 模式：
  - 容器/进程拥有独立 IP（来自 bridge/maclvan 网络），与宿主机通过 NAT（`-p` 端口映射）或路由互通。
  - 端口映射通常通过 `iptables` `nat` 表 `PREROUTING/OUTPUT/POSTROUTING` 完成；也可不经 NAT，直接在同一二层网络下互通（macvlan/ipvlan）。

### 3) 性能影响
- Host 模式：路径最短，无 `veth`/bridge/NAT 额外开销，通常更低延迟与更高吞吐。避免 `conntrack` 压力与 SNAT 代价，适合高 PPS/低延迟场景。
- 非 Host 模式：存在 `veth`、bridge、NAT/conntrack 等开销。若采用 `macvlan/ipvlan` 且不经 NAT，性能介于 Host 与 bridge+NAT 之间。开启/关闭网卡与栈的硬件卸载（GRO/LRO/TSO）也会影响实际性能。

### 4) 安全性
- Host 模式：安全性较低。进程/容器可访问宿主机网络栈（包含 `lo`），宿主机 `INPUT/OUTPUT` 规则直接影响容器，容器误配置更易影响全机网络。
- 非 Host 模式：命名空间隔离更强，可在容器 netns 内单独维护 `iptables`，并在宿主机上通过 `FORWARD` 与 bridge 接口集中治理。适合多租户、严格边界控制与网络策略（NetworkPolicy）场景。

### 5) 使用场景
- Host 模式：
  - 需要极致网络性能与最低延迟的服务（如负载均衡、数据面代理、主机级监控代理如 `node_exporter`）。
  - 必须直接绑定宿主机地址的守护进程（如监听 `:80/:443` 的反向代理）。
- 非 Host 模式：
  - 多租户隔离、零信任分段、需精细网络策略与审计的微服务集群。
  - 需要不同 IP/路由域的服务编排，简化冲突管理与迁移。

### 6) 配置示例

- Docker
  - Host 模式：
    ```bash
    # 容器共享宿主机网络命名空间，无端口映射
    docker run --rm --network host --name svc-host-mode \
      -e ENV=prod myimage:latest
    ```
  - Bridge（非 Host）模式：
    ```bash
    # 默认 bridge，容器独立 netns + veth；通过 -p 进行端口映射（NAT）
    docker run --rm --name svc-bridge -p 8080:80 myimage:latest
    ```
  - Macvlan（非 Host）模式：
    ```bash
    # 宿主机与容器处于同一二层域，无需 NAT；更接近物理直连，仍具命名空间隔离
    docker network create -d macvlan \
      --subnet=192.168.10.0/24 --gateway=192.168.10.1 \
      -o parent=eth0 macvlan_net
    docker run --rm --network macvlan_net --name svc-macvlan myimage:latest
    ```

- Kubernetes
  - Host 网络：
    ```yaml
    apiVersion: v1
    kind: Pod
    metadata:
      name: svc-host-net
    spec:
      hostNetwork: true  # 直接加入宿主机 netns
      containers:
        - name: app
          image: myimage:latest
          ports:
            - containerPort: 8080  # 注意与宿主机端口冲突
    ```
  - 非 Host（由 CNI 提供隔离网络）：
    ```yaml
    apiVersion: v1
    kind: Pod
    metadata:
      name: svc-bridge-net
    spec:
      containers:
        - name: app
          image: myimage:latest
          ports:
            - containerPort: 80
    # 通过 Service/Ingress 暴露，底层常见为 veth+bridge，必要时经 NAT。
    ```

- 手动 netns（Linux 原生）
  ```bash
  # 创建独立网络命名空间，配置 veth 与 bridge（非 Host）
  ip netns add ns1
  ip link add veth-host type veth peer name veth-ns1
  ip link set veth-ns1 netns ns1

  # 宿主机侧创建 bridge 并加入 veth-host
  ip link add name br0 type bridge
  ip link set veth-host master br0
  ip link set br0 up
  ip link set veth-host up

  # 命名空间内配置 IP 与默认路由
  ip netns exec ns1 ip addr add 10.10.0.2/24 dev veth-ns1
  ip netns exec ns1 ip link set veth-ns1 up
  ip netns exec ns1 ip route add default via 10.10.0.1

  # 宿主机为 br0 配置地址作为网关
  ip addr add 10.10.0.1/24 dev br0

  # 出站上网的 NAT（示例）
  iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -o eth0 -j MASQUERADE
  ```

### 7) 与 iptables/ipset/tc 的集成差异

- Host 模式：
  - `iptables`：容器进程经过宿主机 `OUTPUT/INPUT`（本机出入站）与 `FORWARD`（转发场景）。可直接在宿主机使用 `-m cgroup`/`-m set` 做准入与标记。
    ```bash
    # 结合 cgroup + ipset，按进程与目标集合做标记与限速
    iptables -t mangle -A OUTPUT -m cgroup --cgroup 0x00010010 \
      -m set --match-set restricted dst -j MARK --set-mark 0x3
    ```
  - `tc`：建议在实际出站接口（如 `eth0`）布置队列与过滤器，`cgroup` 过滤器可直接匹配该进程的 `classid`。
    ```bash
    tc qdisc add dev eth0 root handle 1: htb default 30
    tc class add dev eth0 parent 1: classid 1:10 htb rate 10mbit ceil 10mbit
    tc filter add dev eth0 parent 1: protocol ip prio 20 cgroup flowid 1:10
    ```

- 非 Host 模式：
  - `iptables`：容器流量经 `veth` 进入宿主机 bridge，一般走 `FORWARD` 链与 `nat`。可在宿主机匹配 `-i vethX`/bridge 端口，或进入容器 netns 内单独维护防火墙。
    ```bash
    # 宿主机上按容器 veth 接口做访问限制（示例）
    iptables -A FORWARD -i vethXYZ -m set --match-set restricted dst -j DROP
    ```
  - `tc`：可以选择在容器 `eth0`（命名空间内）、宿主机 veth 对端或 bridge 设备上布置队列与过滤器；若使用 `cgroup` 过滤器，仍可匹配由 `net_cls` 标记的套接字，但需确保过滤器挂载在实际经过的数据路径设备上。
    ```bash
    # 示例：对宿主机 veth 对端做限速（假设设备名 veth-host）
    tc qdisc add dev veth-host root handle 1: htb default 30
    tc class add dev veth-host parent 1: classid 1:10 htb rate 5mbit ceil 5mbit
    tc filter add dev veth-host parent 1: protocol ip prio 20 cgroup flowid 1:10

    # 或在 bridge 设备上按流分类（可结合 flower/iptables 标记）
    tc qdisc add dev br0 root handle 1: htb default 30
    tc filter add dev br0 ingress prio 10 flower skip_sw \
      dst_ip 203.0.113.0/24 action drop
    ```

### 8) 实际注意事项
- 端口与地址：Host 模式需要避免端口冲突与误监听（容器监听 `127.0.0.1` 即为宿主机回环）。非 Host 模式建议通过 Service/Ingress 或明确路由暴露服务。
- 策略边界：非 Host 模式可在容器 netns 内单独维护 `iptables/ipset`，并在宿主机通过 `FORWARD` 与 bridge 汇总治理；Host 模式建议统一在宿主机层做分段与速率控制。
- 性能与可靠性：
  - 关注 `conntrack` 容量与哈希：非 Host NAT 场景下可调 `nf_conntrack_max` 与 `hashsize`，避免高并发丢包。
  - 选择合适队列算法：`fq_codel/cake` 抑制 Bufferbloat；HTB 做带宽层次管理。
  - 评估硬件卸载与 GRO/LRO/TSO 开关对延迟/CPU 的影响。
- 兼容性：Kubernetes `hostNetwork: true` 与 CNI/NetworkPolicy 的交互因实现而异，需结合具体 CNI 文档验证策略是否仍生效或需要例外规则。
- 持久化与编排：在主机用 systemd unit/开机脚本持久化 `iptables/tc`；容器场景可在入口脚本中执行 netns 内规则，或使用宿主机守护进程监听容器生命周期事件同步策略。


## 基本概念与工作原理

- cgroups（控制组）用于按进程维度进行资源隔离与配额管理。网络相关的两个传统控制器：
  - `net_cls`（v1）：为所属 cgroup 的进程产生的网络包打上 32 位 `classid`（位于 `skb->priority`），用于后续在 `tc` 中以 `cgroup` 过滤器分类，或在 iptables 以 `-m cgroup` 匹配。
  - `net_prio`（v1）：按接口为 socket 设置优先级（较少使用）。
- cgroup v2 差异：统一层级中不再包含 `net_cls/net_prio` 控制器。现代内核推荐用 BPF（如 `tc` eBPF + `clsact`，或 cgroup-bpf 钩子）实现按进程/服务的网络分类与策略。本文以 v1 `net_cls` 为主，并给出 v2 的替代思路。

ASCII 流程示意：
```
[Process in cgroup] --(net_cls: classid)--> [skb->priority]
        |                                  |
        |                             tc filter cgroup -> class
        v                                  v
     iptables -m cgroup              HTB/FQ-CoDel shaping
```

## 配置步骤与命令示例（cgroup v1 net_cls）

```bash
# 1) 挂载 net_cls（若系统未自动挂载）
sudo mkdir -p /sys/fs/cgroup/net_cls
sudo mount -t cgroup -o net_cls none /sys/fs/cgroup/net_cls

# 2) 创建 cgroup 并设置 classid（示例：0x00010010）
sudo mkdir -p /sys/fs/cgroup/net_cls/restricted_svc
echo 0x00010010 | sudo tee /sys/fs/cgroup/net_cls/restricted_svc/net_cls.classid

# 3) 将进程加入该 cgroup（两种方式）
# 3.1 直接写入 cgroup.procs（PID 示例：12345）
echo 12345 | sudo tee /sys/fs/cgroup/net_cls/restricted_svc/cgroup.procs
# 3.2 通过 cgexec 启动进程（需安装 libcgroup 工具）
sudo cgexec -g net_cls:restricted_svc /usr/bin/my-service --opts

# 4) 验证 classid 是否生效（可通过 tc/iptables 计数或 ss 观察）
# tc/iptables 命中计数将用于验证（见下文集成章节）
```

说明与建议：
- `classid` 为 32 位，常用高 16 位表示主类、低 16 位表示子类，便于分层管理。
- systemd 环境下也可按服务/切片组织进程，但 net_cls 赋值仍需在对应 cgroup 路径设置。

## 与 iptables、ipset、tc 的集成使用

- tc（按 cgroup 分类到限速类）
```bash
# 在 eth0 已创建的 HTB 根队列下，增加 cgroup 过滤器
sudo tc filter add dev eth0 parent 1: protocol ip prio 20 cgroup flowid 1:10
# 说明：将属于 cgroup 的进程产生的流量导向 class 1:10（限速类）
```

- iptables（匹配 cgroup 并打标/过滤）
```bash
# 将本机进程的 egress/OUTPUT 流量按 cgroup classid 匹配并设置 MARK=0x3
sudo iptables -t mangle -A OUTPUT -m cgroup --cgroup 0x00010010 -j MARK --set-mark 0x3
# 可结合 filter 表进行准入控制（如仅允许 80/443）
sudo iptables -A OUTPUT -p tcp -m cgroup --cgroup 0x00010010 -m multiport --dports 80,443 -j ACCEPT
sudo iptables -A OUTPUT -p tcp -m cgroup --cgroup 0x00010010 -j DROP
```

- 与 ipset 组合（进程 + 目的 IP 集合的双重约束）
```bash
# 仅当进程属于 cgroup 且目的地址在 restricted_clients 集合时打标/限速
sudo iptables -t mangle -A OUTPUT -m cgroup --cgroup 0x00010010 \
  -m set --match-set restricted_clients dst -j MARK --set-mark 0x1
# tc 侧继续用 fw/cgroup filter 将标记或 cgroup 流量导向限速类
```

- 方向选择与注意：
  - 进程级匹配更适合本机 egress（`OUTPUT`）策略；`PREROUTING`/转发链不一定能关联本机进程。
  - 结合现有“按 IP 集合限速”的方案，可通过 cgroup 将本机服务与离线任务区分，避免彼此影响。

## 应用场景与最佳实践

- 按服务/作业限速：将备份、日志上传、离线批处理进程放入 cgroup，限制其带宽与队列优先级，保障交互服务。
- 多租户主机：不同服务（租户）映射不同 `classid`，在 HTB 下分配独立通道与速率上限。
- 与 IP 集合协同：对外访问仍基于 ipset 管理名单；对内按进程（cgroup）区分业务类型，实现“谁访问 + 访问哪里”的双维管控。
- 命名与映射规范：约定 `classid` 与 HTB `classid` 有一致映射（如 0x00010010 -> 1:10），便于运维与审计。

## 性能调优建议与注意事项

- 队列算法：为 cgroup 对应的类使用 `fq_codel` 或 `cake`，降低排队延迟与抖动。
- 过滤器优先级：合理设置 `prio`，确保 cgroup/mark 过滤器早匹配；避免过多 `u32` 复杂匹配。
- 监控与验证：使用 `tc -s class/qdisc show` 与 `iptables -vnL` 观察命中计数，定期复核 `cgroup.procs` 中的进程是否符合预期。
- 兼容性：
  - 需要内核模块支持：`sch_htb`、`sch_fq_codel`、`cls_fw`、`cls_cgroup`、`xt_set`、`xt_cgroup`。
  - cgroup v2 环境建议评估 BPF 方案（`tc qdisc add dev eth0 clsact` + `tc filter add ... bpf`），实现更灵活的按进程/Socket 分类。
- 持久化：将 cgroup 挂载、classid 设置与 tc/iptables 规则固化为开机脚本或 systemd unit，确保重启后生效。
- 安全与隔离：严格控制写入 `cgroup.procs` 的权限，防止误归类；为高风险作业单独 cgroup 并限制资源上限（CPU/IO 也可结合）。

---

# 注意事项与排查

- 操作前备份与回滚
  - 备份规则：
    ```bash
    iptables-save > /etc/iptables/rules.v4
    ipset save > /etc/ipset.conf
    ```
  - 恢复规则：
    ```bash
    iptables-restore < /etc/iptables/rules.v4
    ipset restore < /etc/ipset.conf
    ```

- 持久化方法（随发行版而异）
  - Debian/Ubuntu：安装 `iptables-persistent` 或 `netfilter-persistent`，保存于 `/etc/iptables/rules.v4`、`/etc/ipset.conf`
  - RHEL/CentOS：使用 `service iptables save` 或结合 firewalld/nftables 转写；注意 iptables-nft 与 iptables-legacy 差异
  - tc：通常以脚本（systemd unit）在启动时应用，或借助 NetworkManager/ifup 触发

- 常见问题排查
  - 标记未生效：检查 `mangle` 表规则计数；确认 `MARK` 置位在 `PREROUTING`/`OUTPUT` 的正确方向
  - tc 过滤无匹配：确认 `fw filter handle` 与 iptables 标记一致；检查过滤器挂载的设备（egress 对应出口设备）
  - 入口限速未起效：是否使用 `ifb` 重定向；`ingress qdisc` 默认只统计不整形
  - nftables 兼容：现代系统默认 iptables-nft，语义兼容但内部实现不同；大规模规则建议评估直接迁移到 nftables

---

# 总结

- 使用 ipset 管理名单，iptables 做准入与打标，tc 做速率与队列管理，是兼顾简单、性能与可维护性的组合
- 建议以“标记驱动分类”的模式组织规则，保持早打标、少匹配、设备维度清晰
- 推行脚本化与持久化，确保在重启、变更或回滚时可控可复现

参考链接：
- iptables 文档：https://netfilter.org/
- ipset 手册：https://ipset.netfilter.org/
- tc 与 qdisc：https://man7.org/linux/man-pages/man8/tc.8.html
- FQ-CoDel：https://www.bufferbloat.net/projects/codel/wiki/