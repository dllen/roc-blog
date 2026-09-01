---
title: "AI Agent 的基础设施，90% 是 1996 年的 Linux"
date: 2026-09-01
description: "给 Agent 单独建用户叫身份隔离，chmod 一下叫最小权限，systemd 守护进程叫 Agent Runtime——本文把 AI Agent 领域那些听起来高大上的术语，还原成 Linux 运维里早已存在的老办法，并解释为什么这套思路是 Agent 安全的根基。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Linux", "运维", "基础设施", "安全"]
extra:
  update_date: 2026-09-01
---

真正玩过 Linux 的人，现在看很多 AI Agent 教程，心情其实挺复杂的。

因为你会发现，AI 是 2026 年的。但很多所谓 Agent 基础设施，大概是 1996 年的。

这个发现不是嘲笑——而是一种熟悉感。很多 Agent 框架花大力气造的轮子，Linux 早在几十年前就造好了。区别只在于，当年没人告诉你这些东西套上"Agent"两个字就能融资。

本文把那些听起来高大上的术语一一还原，看看它们在 Linux 里到底叫什么，以及为什么这套思路依然是 Agent 安全设计的根基。

---

## 1. 身份隔离：一个用户，一个家目录

给 Agent 单独建一个操作系统用户，这在 Agent 框架文档里通常叫"身份隔离"或"安全边界"。

在 Linux 里，这大概是这样：

```bash
useradd -m -s /bin/bash -d /opt/agent-workspace agent-bot
chown -R agent-bot:agent-bot /opt/agent-workspace
```

然后用这个用户跑 Agent 进程：

```bash
su - agent-bot -c "python agent.py"
```

或者更规范一点，用 systemd 的 `User=` 字段：

```ini
[Service]
User=agent-bot
Group=agent-bot
WorkingDirectory=/opt/agent-workspace
```

**为什么这重要？**

Linux 的用户模型是安全的基石。每一个用户本质上就是一个独立的资源边界——它有自己的家目录（`/home/agent-bot`）、自己的进程树（PID namespace）、自己的文件权限。它的崩溃、泄漏、提权尝试，最多只能在自己那一亩三分地里折腾。

Agent 天然需要执行外部命令。给它一个普通用户，意味着：即使 Agent 被 prompt injection 劫持，攻击者的"双手"也摸不到 root，顶多能读写 Agent 自己的文件，顶多能 fork 一些受控进程。

这不是防君子——这是防失控的代码。

---

## 2. 最小权限：chmod 755 够用吗？

"最小权限"是另一个被 Agent 框架反复强调的概念。在 Linux 里，这对应的是文件权限的精细控制。

比如，你的 Agent 需要读一个配置文件，但绝对不能写：

```bash
chmod 250 /etc/agent/config.toml   # 属主读写，其他人只读
```

Agent 需要一个工作目录，但不能访问系统二进制：

```bash
mkdir -p /opt/agent-workspace/sandbox
chmod 700 /opt/agent-workspace/sandbox
chmod 555 /usr/bin    # 系统命令只读
chmod 000 /usr/sbin/sudo   # sudo 直接禁用
```

更严格的做法是 `chattr +i` 锁死关键文件，甚至用 AppArmor / SELinux 写强制访问控制策略——这些工具可以把"Agent 能读什么、不能写什么"用内核级别的规则固化下来，Agent 自己无法绕过。

```bash
# 用 chattr 锁定配置，Agent 连 root 都改不了
chattr +i /etc/agent/system-prompt.txt
```

很多 Agent 框架为此设计了"权限作用域"（Permission Scopes）——本质上就是 Unix 权限模型的一个子集封装。理解了这层，再看那些权限配置就觉得格外眼熟：不就是把 `rwx` 粒度从"用户/组/其他"变成了"工具/资源/操作"吗？

---

## 3. Workspace Sandbox：chroot、namespace、container

"Workspace Sandbox"是另一个 Agent 框架爱用的词——给 Agent 一个隔离的工作空间，让它的操作不会污染宿主机。

Linux 提供了完整的选择树，从轻到重：

**最轻量：chroot**

```bash
mkdir -p /opt/agent-sandbox/{bin,lib,home}
cp /bin/bash /opt/agent-sandbox/bin/
cp /lib/x86_64-linux-gnu/*.so /opt/agent-sandbox/lib/
chroot /opt/agent-sandbox /bin/bash
```

chroot 把进程可见的文件系统视角限定在指定目录。简单，但不够安全——有逃逸方法。

**更安全：Linux Namespaces + unshare**

```bash
# 隔离 PID（进程树）
# 隔离 mount（文件系统）
# 隔离网络（网络栈）
# 隔离 user（UID/GID 映射）
unshare --pid --mount --network --user --map-root-user \
    /bin/bash
```

在 unshare 的 namespace 里，Agent 看到的是一个"假"的 root——它可以随意 `chmod 777`、可以 mount 文件系统，但所有操作都只在自己的 namespace 生效，对宿主机毫无影响。

**生产级隔离：Docker**

```bash
docker run --rm \
    --user agent-bot \
    --read-only \
    --tmpfs /tmp \
    -v /opt/agent-workspace:/workspace:ro \
    agent-image:latest
```

`-read-only` + `--tmpfs` + `:ro` volume 组合起来，就是一个"只读根系统 + 临时写目录 + 受控只读挂载"的沙箱。Agent 可以创建临时文件、可以执行编译，但写不了持久状态、改不了系统文件。

很多 Agent 框架的"Secure Execution Environment"描述的就是这一套。区别在于：Docker 是开箱即用的，Agent 框架往往需要自己组合这些参数。

**最终极隔离：VM**

再严格的 namespace 隔离，也共享内核——如果内核有漏洞，namespace 可以被穿透。VM 完全不同虚拟机，有自己的完整内核，不共享宿主机内核。AWS 的 Firecracker、gVisor 就是这个思路的轻量实现。

所以选择是这样的：

```
不确定 → Docker（够用）
追求轻量 → Linux namespace（unshare）
严肃安全场景 → VM / Firecracker
绝对不能出事 → 物理断网机器
```

Agent 框架们画的那些"隔离架构图"，无非是沿着这棵树做选择。

---

## 4. Agent Runtime：systemd 守护进程

Agent 要长期在后台跑，不能一断连就消失。在 Linux 里，这叫"守护进程"，在 Agent 框架里叫"Agent Runtime"。

systemd 接管一切：

```ini
[Unit]
Description=AI Agent Bot
After=network.target

[Service]
Type=simple
User=agent-bot
WorkingDirectory=/opt/agent-workspace
ExecStart=/opt/agent-workspace/venv/bin/python agent.py
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

这行 `Restart=on-failure` 就是 Agent 框架里常说的"Self Healing"——进程挂了，systemd 自动拉起来，Sleep 5 秒后再试。

`StandardOutput=journal` 把日志直接送进 systemd journal，用 `journalctl -u agent-bot -f` 就能看实时日志、过滤错误、追踪启动历史。

cron 的定时任务也同理：

```bash
# 每小时跑一次数据抓取 Agent
0 * * * * agent-bot /opt/agent-workspace/scripts/fetch-data.py >> /var/log/agent/cron.log 2>&1
```

这就是 Agent 框架里"Autonomous Scheduler"的原型。cron 设计好定时节奏，幂等性设计好重复执行不会破坏状态，Agent 就能"自主"地在后台持续干活。

---

## 5. Observability：journalctl 就是分布式追踪

Agent 框架里另一个高大上的词是"Observability"——说白了就是：进程在跑什么、出问题了我怎么看？

Linux 的答案是分层日志：

**进程标准输出/错误**：stdout/stderr 进 journal，或写文件

```bash
python agent.py >> /var/log/agent/agent.log 2>&1
```

**journalctl 查日志**：

```bash
# 实时跟踪
journalctl -u agent-bot -f

# 看最近 100 条
journalctl -u agent-bot -n 100

# 按时间范围过滤
journalctl -u agent-bot --since "1 hour ago"

# 只看错误级别
journalctl -u agent-bot -p err

# 搜索关键词
journalctl -u agent-bot | grep "tool_call.*failed"
```

**结构化日志**：Python 里用 `logging` 模块输出 JSON 格式日志，配合 `journalctl -o json` 就能做字段级过滤——这和 Agent 框架的"structured logging"完全是一个东西。

**auditd**：更严格的安全审计，追踪所有系统调用：

```bash
# 监控 Agent 用户访问了哪些文件
auditctl -w /opt/agent-workspace -k agent-workspace
ausearch -k agent-workspace
```

如果 Agent 偷偷去读 `/etc/shadow`，auditd 会忠实记录下来。

这些工具的组合，就是一套完整的可观测性栈——日志、指标、审计。Agent 框架不过是把这些打包成了 SDK 和 Dashboard。

---

## 6. Human in the Loop：sudo + audit 就是审批流

"Human in the Loop"听起来很现代——"关键操作需要人类审批"。在 Linux 里，这是 sudo 的本职工作：

```bash
# /etc/sudoers 配置：Agent 只能执行特定命令
agent-bot ALL=(root) /usr/bin/systemctl restart nginx, /usr/bin/systemctl stop nginx, NOPASSWD: ALL
```

Agent 可以重启 nginx，但想 `rm -rf /`？sudo 会问你要密码。

更严格的做法是"审批流"：Agent 发起操作请求，系统通知管理员，管理员审批后才执行：

```bash
# Agent 创建一个待审批的操作
echo "Wanted to run: rm -rf /tmp/agent-cache" >> /var/spool/agent/pending/

# 管理员检查后执行或拒绝
sudo /opt/agent/scripts/execute-pending.sh
```

SSH 远程登录也是一个天然的"Human in the Loop"：任何需要人工介入的操作，通过 SSH 会话进入，留在 shell 历史里，可审计、可回放。

---

## 7. Multi Agent：脚本互相调用就是最初的 Agent 协作

Agent 框架里还有一个听起来很复杂的概念——Multi Agent Architecture：多个 Agent 协作，各自负责不同任务，互相调用。

在 Linux 里，这叫"脚本链"：

```bash
#!/bin/bash
# cron-triggered orchestration
/opt/scripts/fetch-data.sh    # Agent A: 抓取
/opt/scripts/process-data.sh  # Agent B: 处理
/opt/scripts/notify-team.sh   # Agent C: 通知
```

一个脚本的输出是下一个脚本的输入，这就是最朴素的 Agent 协作。加上消息队列（Redis、RabbitMQ），就能做到异步、解耦、可靠传递——Agent 框架管这个叫"Message Queue"，运维老兵管这个叫"cron 输出 pipe 到另一个脚本"。

```
fetch-data.sh → Redis queue → process-agent → RabbitMQ → notify-agent
```

给这套加上健康检查、告警、重试，就是一个生产级的 Multi Agent 系统。很多 Agent 框架画的复杂架构图，画的就是这些东西的 UI 包装。

---

## 8. 核心哲学：不要相信任何进程

回过头看，Linux 用户管理 Agent 的方式，底层是一套贯穿始终的哲学：

**不要相信任何进程。**

给它一个普通用户。它崩溃了顶多杀掉自己的进程，动不了系统。

给它一个受限的家目录。它写文件只能写到允许的地方，删不到根目录。

给它只读的系统二进制。它无法安装新工具，只能用你批准的那些。

CPU、内存、进程数、打开文件数、端口——全都可以用 cgroup 和 ulimit 限制：

```bash
# cgroup 限制：最多用 2 个 CPU 核心、4GB 内存、1000 个进程
cgcreate -g memory,cpu,pids:/agent-limit
echo 2 > /sys/fs/cgroup/cpu/agent-limit/cpu.cfs_quota_us
echo 4194304 > /sys/fs/cgroup/memory/agent-limit/memory.limit_in_bytes
echo 1000 > /sys/fs/cgroup/pids/agent-limit/pids.max
```

文件、网络、capabilities——用 seccomp 过滤系统调用：

```bash
# 只允许读写、进程管理、时间等基本调用，禁用网络和 mount
seccomp 规则白名单
```

这些限制加在一起，就是 Linux 对"不太靠谱的普通用户"的终极处理方式：不是让它变靠谱，而是让它就算不靠谱也捅不破笼子。

---

## 结语：Agent 只是一个普通用户

很多 Linux 老用户玩 Agent 上手特别快，原因就在这里：

别人还在研究怎么优雅地管理一个会执行命令的 AI。Linux 用户看了半天——哦，不就是又来了一个不太靠谱的普通用户吗。

该读的给读，该写的给写，不该碰的连看都别让它看。想长期跑就 systemd，想临时跑就 tmux，想定时跑就 cron，想隔离就 container，还不放心就 VM，再不放心直接断网。

这些办法，二十年前就在 `/etc/systemd/` 里等着了。

Agent 框架的贡献不是造轮子——是把这些分散的轮子组合起来、加上 LLM 的推理能力，让"不太靠谱的普通用户"变得真正有用。

理解这一点，你就既懂了 Linux 的安全哲学，也懂了 Agent 的本质。
