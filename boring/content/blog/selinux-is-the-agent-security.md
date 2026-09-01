---
title: "Agent 的安全，90% 是 1998 年的 SELinux"
date: 2026-09-06
description: "Agent 安全是当下的热门话题：prompt injection、数据隔离、工具滥用。但如果你仔细看，这些问题的本质——强制访问控制、白名单、审计追溯——Linux 早在 1998 年就给出了完整答案。SELinux 的 MLS/MCS、seccomp、namespace，比大多数 Agent 安全方案早了 20 年。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Linux", "安全", "SELinux", "seccomp", "AppArmor"]
extra:
  update_date: 2026-09-06
---

写完 Agent 编排，有读者问：Agent 安全呢？

prompt injection、数据泄露、工具滥用、未授权操作——这些都是 Agent 落地的核心安全挑战。各家框架都在造轮子：沙箱隔离、权限作用域、审计日志……

但如果把 Agent 安全的本质问题拆开来看——强制访问控制、权限最小化、可审计追溯——这正是 Linux 在 1998 年发明 SELinux 时解决的问题。

本文把 Agent 安全还原到 SELinux，看看 Linux 内核花了 20 年打磨的访问控制模型，能给 Agent 安全带来什么启发。

---

## 1. Agent 安全的本质：强制访问控制

先看清楚 Agent 安全的核心挑战：

1. **Prompt Injection**：恶意输入让 Agent 执行非预期操作
2. **数据泄露**：Agent 把敏感信息暴露给不该看到的地方
3. **工具滥用**：Agent 调用了不该调用的工具
4. **权限扩散**：Agent 获得了超出需要的权限

这四个问题，在 Linux 里分别对应：

1. **强制访问控制（MAC）**：进程不能绕过安全策略
2. **数据分级**：文件按敏感度分类，只有对应级别才能访问
3. **系统调用过滤**：进程只能调用白名单内的系统调用
4. **最小权限**：进程只获得完成任务所需的最小权限集

SELinux 解决的正是这些问题。

---

## 2. SELinux：MAC 的教科书实现

SELinux（Security-Enhanced Linux）是 NSA 贡献给 Linux 内核的强制访问控制系统。它的核心思想是：**所有访问都要通过安全策略检查，而非依赖进程自己的判断。**

传统 Linux 的权限模型是 **DAC（Discretionary Access Control，自主访问控制）**：

```bash
# DAC：文件所有者决定谁能访问
chmod 644 /etc/passwd    # 属主可读写，其他人只读
# 进程如果是 root，可以 chmod 777 任何文件
```

SELinux 的 MAC（Mandatory Access Control，强制访问控制）：

```bash
# MAC：安全策略强制约束，即使 root 也不能违背
# 这个文件被标记为 shadow_t 类型
ls -Z /etc/shadow
# system_u:object_r:shadow_t:s0 /etc/shadow

# 即使是 root 进程，如果不是 shadow_t 类型的 domain，
# 也无法读取 /etc/shadow
```

**Agent 对应的场景**：即使 Agent 以 root 用户运行，MAC 策略也能阻止它访问不该访问的文件。Prompt injection 再巧妙，也无法让 Agent 绕过 MAC 策略。

---

## 3. MLS/MCS：数据分级防止泄露

SELinux 的 **MLS（Multi-Level Security）** 和 **MCS（Multi-Category Security）** 解决了数据分级问题：

```bash
# MLS：按密级分类（绝密 > 机密 > 公开）
# 进程和文件都有安全级别
# 进程只能读"不高于自己级别"的文件，只能写"不低于自己级别"的文件

# 查看进程的安全上下文
ps -Z
# system_u:system_r:sshd_t:s0-s15:c0.c1023 sshd

# 查看文件的安全上下文
ls -Z /etc/shadow
# system_u:object_r:shadow_t:s0

# 规则：sshd_t 可以读 shadow_t，但不能写
```

Agent 的数据隔离对应的是同样的模型：

```python
# Agent 的数据分级
class DataClassification:
    PUBLIC = "public"       # 任何 Agent 可读
    INTERNAL = "internal"   # 内部 Agent 可读
    CONFIDENTIAL = "confidential"  # 特定 Agent 可读
    TOP_SECRET = "top_secret"      # 只有安全 Agent 可读

# 工具访问控制：只有对应级别的 Agent 才能调用
@tool(access_level=DataClassification.INTERNAL)
def read_internal_docs():
    ...

# 实际执行时检查
if user.security_level < tool.access_level:
    raise AccessDeniedError("Insufficient security level")
```

**关键认知**：MLS/MCS 模型解决的是"即使代码有漏洞，恶意进程也无法读取超出自己权限的数据"。Agent 的数据分级也是同样的目的——把"信任 Agent"变成"信任策略"，即使 Agent 被 prompt injection 劫持，也无法读取超出权限的数据。

---

## 4. seccomp：系统调用白名单

SELinux 可以配合 **seccomp（Secure Computing Mode）** 做更细粒度的系统调用过滤：

```bash
# seccomp：只允许读、写、exit、sigreturn 四个系统调用
# 进程想调用其他任何系统调用 → 立即被内核杀死
# 这是 Docker 容器默认的安全边界

# 查看进程的 seccomp 状态
cat /proc/1/status | grep Seccomp
# Seccomp: 2  # 2 = seccomp + filter（白名单模式）
```

```bash
# Docker 的 seccomp 配置示例（默认拒绝很多危险调用）
docker run --security-opt seccomp=default.json \
    --read-only \
    --tmpfs /tmp \
    my-image

# default.json 里有 ~44 条默认禁止的系统调用
# 包括：mount、ptrace、sys_module、kexec_load 等
```

Agent 工具调用的白名单机制对应的是 seccomp：

```python
# Agent 工具调用：只有白名单内的工具才能被调用
ALLOWED_TOOLS = [
    "read_file",
    "write_file",
    "run_python",
    "search_web",
]

def execute_tool(tool_name, args):
    if tool_name not in ALLOWED_TOOLS:
        raise ToolNotAllowedError(f"Tool {tool_name} not in whitelist")

    # 即使工具名匹配，也要检查参数是否合法
    validate_args(tool_name, args)

    return call_tool(tool_name, args)
```

seccomp 的教训是：**只依赖"Agent 不应该调用这个"是不够的——必须从内核层面强制阻断，而不是依赖 Agent 的自我约束。** 工具白名单也一样——不是"告诉 Agent 不要调"，而是"让 Agent 无法调"。

---

## 5. AppArmor：路径为基础的访问控制

SELinux 用**安全上下文**（user:role:type:level）做访问控制，好处是精细，代价是配置复杂。**AppArmor** 提供了另一种思路——用**文件路径**做访问控制，对运维更友好：

```bash
# AppArmor profile：限制进程只能访问指定路径
/usr/bin/python3 {
  # 允许读取的路径
  /usr/bin/python3 r,
  /usr/lib/** r,
  /opt/agent-workspace/** rw,

  # 明确拒绝的路径
  deny /etc/shadow rw,
  deny /proc/** rw,

  # 允许的网络访问
  network inet stream,
  network inet dgram,
}
```

Agent 的资源隔离对应 AppArmor 的路径限制：

```python
# Agent 的文件系统访问控制：只能读写指定路径
class AgentSandbox:
    allowed_paths = [
        "/opt/agent-workspace/",
        "/tmp/agent-temp/",
    ]

    denied_paths = [
        "/etc/shadow",
        "/root/.ssh/",
        "/proc/1/",
    ]

    def read_file(self, path):
        # 路径检查
        if not any(path.startswith(allowed) for allowed in self.allowed_paths):
            raise AccessDeniedError(f"Path not in allowed list: {path}")

        if any(path.startswith(denied) for denied in self.denied_paths):
            raise AccessDeniedError(f"Path explicitly denied: {path}")

        return self._do_read(path)
```

AppArmor 的易用性（基于路径而非上下文）更适合 Agent 场景——告诉 Agent"你的家目录是 /opt/agent-workspace"比"你的 SELinux 上下文是 agent_t"要直观得多。

---

## 6. namespace：资源隔离

Linux **namespace** 提供了进程级别的资源隔离：

```bash
# PID namespace：进程只能看到自己的进程树
unshare --pid --fork
# 在新的 PID namespace 里，PID 从 1 开始
# 原来的 PID 对这个进程不可见

# Network namespace：进程只能看到自己的网络栈
unshare --net
# 原来的网卡对这个进程不可见
# 可以创建虚拟网卡（veth）对内通信

# Mount namespace：进程只能看到自己的文件系统视图
unshare --mount
# mount --bind /opt/agent-rootfs /  # 把 agent 根目录映射为 "/"
# 现在进程以为 "/" 就是 /opt/agent-rootfs
```

Agent 的沙箱隔离对应 namespace：

```python
# Agent 的 namespace 隔离
def create_agent_sandbox(agent_id):
    # 创建独立的 PID namespace
    subprocess.run(["unshare", "--pid", "--fork", "--mount-propagation", "private"])

    # 在 Agent 的 namespace 里挂载只读根文件系统
    subprocess.run(["mount", "--bind", f"/opt/agent-roots/{agent_id}", "/"])

    # 挂载 tmpfs 作为临时写目录
    subprocess.run(["mount", "-t", "tmpfs", "tmpfs", "/tmp"])

    # Agent 现在在一个"假"的根文件系统里运行
    # 它以为自己有完整的系统，但实际上只能访问 /opt/agent-roots/{agent_id}
```

namespace 比 Docker 更轻量——不需要启动完整的容器，只需要隔离特定资源。对于 Agent 沙箱，只需要隔离：进程树（PID）、文件系统（mount）、网络（net），不需要隔离用户（user）或者时间（time）。

---

## 7. auditd：安全审计

SELinux 的配套工具 **auditd** 提供了完整的安全审计：

```bash
# 启用 SELinux 审计
auditctl -w /etc/shadow -p ra -k sensitive_file

# 查看谁访问了敏感文件
ausearch -k sensitive_file
# type=SYSCALL msg=audit(...): arch=c000003e syscall=2
#   success=yes exit=3 a0=...
#   name="/etc/shadow"
#   pid=12345 uid=0 auid=1000 ses=3
#   subj=system_u:system_r:sshd_t:s0-s15:c0.c1023
#   key=sensitive_file

# type=AVC msg=audit(...): avc: denied { read } for
#   pid=23456 comm="python" name="shadow" dev="sda1"
#   scontext=agent_u:agent_r:agent_t:s0
#   tcontext=system_u:object_r:shadow_t:s0
#   tclass=file
```

auditd 记录了完整的访问链条：**谁（pid、uid）在什么时候（timestamp）用什么权限（subj）访问了什么文件（name），结果是成功还是拒绝（avc: denied）**。

Agent 的安全审计也是同样的逻辑：

```python
# Agent 操作审计
class AgentAuditLogger:
    def log(self, event):
        audit_entry = {
            "timestamp": datetime.now().isoformat(),
            "agent_id": event.agent_id,
            "session_id": event.session_id,
            "action": event.action,  # "tool_call", "file_read", "data_output"
            "resource": event.resource,  # 访问的具体资源
            "result": event.result,  # "success", "denied", "error"
            "context": {
                "user_prompt_hash": hash(event.user_prompt),
                "tool_args_hash": hash(event.tool_args),
            }
        }
        # 写审计日志，不能被 Agent 删除
        write_to_audit_log(audit_entry)
```

**关键原则**：审计日志必须和 Agent 隔离——Agent 不能读写自己的审计日志，否则 prompt injection 可以直接篡改审计记录。Linux 用 auditd 的独立权限模型做到这一点；Agent 审计也需要类似的隔离机制。

---

## 8. capabilities：细粒度 root 权限拆分

Linux 的 **capabilities** 把传统 Unix 的 root 权限拆成了 40+ 个独立的能力：

```bash
# 传统 Unix：root = 所有权限
# Linux capabilities：root 权限被拆分成独立的能力

# 查看进程的 capabilities
getcap /usr/bin/ping
# /usr/bin/ping = cap_net_raw+ep  # 只需要 CAP_NET_RAW，不需要所有 root 权限

# Docker 容器默认丢弃大多数 capabilities
docker run --cap-drop ALL \
    --cap-add NET_BIND_SERVICE \
    --cap-add DAC_READ_SEARCH \
    my-image
```

Agent 的权限拆分对应 capabilities：

```python
# Agent 的 capability 模型
class AgentCapabilities:
    # 基础能力
    CAN_READ_FILES = "read_files"
    CAN_WRITE_FILES = "write_files"
    CAN_RUN_SHELL = "run_shell"
    CAN_USE_NETWORK = "use_network"

    # 高级能力（需要单独授权）
    CAN_MODIFY_SYSTEM = "modify_system"  # 安装包、修改系统配置
    CAN_ACCESS_CREDENTIALS = "access_credentials"  # 读取密钥、token
    CAN_EXECUTE_AS_ROOT = "execute_as_root"  # sudo 操作

# 工具和 capability 的映射
TOOL_CAPABILITIES = {
    "read_file": [AgentCapabilities.CAN_READ_FILES],
    "write_file": [AgentCapabilities.CAN_WRITE_FILES],
    "install_package": [AgentCapabilities.CAN_MODIFY_SYSTEM],
    "get_api_key": [AgentCapabilities.CAN_ACCESS_CREDENTIALS],
}

def check_capabilities(tool_name, agent_caps):
    required = TOOL_CAPABILITIES.get(tool_name, [])
    if not all(cap in agent_caps for cap in required):
        raise CapabilityDeniedError(
            f"Tool {tool_name} requires {required}, "
            f"agent has {agent_caps}"
        )
```

**capabilities 的核心教训**：不要给 Agent"root"或"非 root"这样粗粒度的权限划分。把权限拆成独立的能力集，Agent 只获得完成任务所需的最小能力集合。

---

## 9. 从 SELinux 能学到什么

把 SELinux 和 Agent 安全对照下来，核心原则其实很清晰：

**强制访问控制优于自主访问控制**：不要依赖"Agent 不会这么做"——从内核层面强制阻止。Prompt injection 再巧妙，也应该被 MAC 策略阻断。

**数据分级防止泄露**：敏感信息标记密级，只有对应级别的 Agent 才能访问。MLS/MCS 模型解决的是即使有漏洞也无法泄露数据的问题。

**最小权限原则**：把权限拆成 capabilities，Agent 只获得完成任务所需的最小权限集合。不需要读 shadow 文件的 Agent，就不应该有读取 shadow 文件的能力。

**工具调用白名单**：seccomp 的系统调用白名单思路，适用于工具调用——不是"告诉 Agent 不要调"，而是"让 Agent 无法调"。

**审计日志是安全的最后防线**：完整记录所有访问操作，审计日志本身要被隔离保护。Agent 不能删除或修改自己的审计记录。

**纵深防御**：SELinux + seccomp + AppArmor + namespace 组合起来才是完整的安全边界。Agent 安全也需要多层防御——单一技术无法覆盖所有攻击面。

---

## 结语：安全没有银弹，但有成熟方案

1998 年，NSA 把 SELinux 贡献给 Linux 内核。之后的 20 多年，它经历了无数次 real-world 攻击的检验，被证明是有效的强制访问控制方案。

2026 年，Agent 安全框架们在发明各自的安全方案。但仔细看，它们要么是在重新发明轮子，要么是在用更弱的方案替代 SELinux 已经解决的问题。

SELinux 花了 20 年打磨的模型：
- 强制访问控制（MAC）而非自主访问控制（DAC）
- 数据分级（MLS/MCS）防止泄露
- 最小权限（capabilities）防止权限扩散
- 系统调用白名单（seccomp）防止提权
- 路径隔离（AppArmor）简化配置
- 资源隔离（namespace）限制攻击面
- 审计日志（auditd）追溯攻击

Agent 安全不需要重新发明这些轮子——只需要理解 SELinux 为什么这样设计，然后在 Agent 的语境里应用同样的原则。

安全没有银弹。但经过 20 年实战检验的 SELinux，比任何一个 Agent 安全框架都更值得信任。

理解这一点，你就既懂了 SELinux 的设计哲学，也懂了 Agent 安全的本质：不是"让 Agent 不做坏事"，而是"让 Agent 做不了坏事"。
