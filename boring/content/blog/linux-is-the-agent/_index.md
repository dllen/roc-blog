---
title: "Linux 是 Agent 的底层"
description: "七篇系列文章，把 AI Agent 领域的现代概念还原到 Linux/Unix 的经典技术：systemd、SSH、文件系统、日志分析、Makefile、SELinux、Unix Socket。每一个「新技术」，都能在 1976-1998 年间找到前身。"
extra:
  featured: true
---

> 本系列按概念依赖关系排序，从基础设施到上层应用，适合系统地理解 Agent 的技术栈。

**系列文章**：

1. [Agent 的基础设施，90% 是 1996 年的 Linux](/blog/linux-is-the-agent/01-infrastructure/) — systemd / namespace / cgroup
2. [Agent 的工具调用，90% 是 1996 年的 SSH](/blog/linux-is-the-agent/02-tool-calling/) — SSH 协议 / exit code
3. [Agent 的记忆，90% 是 1996 年的文件系统](/blog/linux-is-the-agent/03-memory/) — /tmp / /var/lib / logrotate
4. [Agent 的评估，90% 是 1996 年的日志分析](/blog/linux-is-the-agent/04-evaluation/) — SLO / golden test / regression
5. [Agent 的编排，90% 是 1976 年的 Makefile](/blog/linux-is-the-agent/05-orchestration/) — DAG / 拓扑排序
6. [Agent 的安全，90% 是 1998 年的 SELinux](/blog/linux-is-the-agent/06-security/) — MAC / seccomp / capabilities
7. [Agent 的通信，90% 是 1979 年的 Unix Socket](/blog/linux-is-the-agent/07-communication/) — UDS / pipe / mq
