---
title: "Agent 的工具调用，90% 是 1996 年的 SSH"
date: 2026-09-01
description: "Tool Calling 是 Agent 的核心能力之一。但如果你仔细看它的本质——发送指令、执行命令、返回结果——会发现这不过是 Linux 早就解决过的问题。SSH 远程执行、管道传输、CGI 脚本，这些 1996 年的技术，早已蕴含了 Tool Calling 所有的设计要素。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Linux", "SSH", "Tool Calling", "MCP"]
extra:
  update_date: 2026-09-01
---

上篇聊了 Agent 的"基础设施"——systemd、namespace、日志——本质上都是 Linux 早已解决的问题。有读者问：那 Tool Calling 呢？Agent 调用外部工具，这个能力在 Linux 里有没有对应物？

有。而且历史更长。

SSH 1996 年发布。Agent Tool Calling 的主流范式 2023 年才成熟。差了 27 年。但如果你把 SSH 的工作方式拆开来看，会发现 Tool Calling 所有的核心设计要素——协议、参数传递、结果返回、权限控制——SSH 早就设计好了。

本文把 Tool Calling 的每个环节还原到 SSH，解释它们为什么本质上是一回事，以及从这段历史里能学到什么。

---

## 1. 工具调用的本质：远程执行一条命令

先看清楚 Agent Tool Calling 做了什么：

1. Agent 的 LLM 决定调用一个工具
2. 框架把意图翻译成工具名 + 参数
3. 工具在某个环境里执行
4. 结果返回给 Agent

这四个步骤，换成 SSH：

```bash
ssh user@host "python /scripts/analyze.py --input data.csv --format json"
```

1. 你决定执行一条命令
2. 命令 + 参数通过 SSH 协议发送
3. 远程机器执行脚本
4. stdout 通过 SSH 管道返回

**没有任何本质区别。**

区别只在于：Agent 的 Tool Calling 把这个过程自动化了——LLM 替你决定执行哪条命令，而不是你手动输入。但底层的"发送指令→执行→返回结果"，SSH 已经把协议定死了。

---

## 2. 协议层：JSON-RPC 和 SSH 协议

Agent 框架的 Tool Calling 通常基于 JSON-RPC 2.0：

```json
// 请求
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {
      "path": "/data/report.pdf",
      "lines": 50
    }
  },
  "id": 1
}
```

```json
// 响应
{
  "jsonrpc": "2.0",
  "result": {
    "content": "这是文件的前 50 行...",
    "meta": { "size": 1024, "modified": "2026-09-01" }
  },
  "id": 1
}
```

这看起来很现代。但 SSH 的底层协议逻辑几乎一样：

```bash
# SSH 的"请求"是这条命令字符串
ssh agent-bot@192.168.1.100 "read_file /data/report.pdf 50"

# SSH 的"响应"是 stdout
# 这是文件的前 50 行...

# SSH 的"错误"是 stderr
# read_file: 文件不存在
```

JSON-RPC 做的，是把 SSH 的文本协议结构化了——方法名变成 `method`，参数变成 `params.arguments`，结果变成 `result`，错误变成 `error`。这是 27 年的文本协议升级成结构化数据的自然演进，不是新发明。

---

## 3. 结构化参数：Shell 参数 vs JSON Schema

Tool Calling 的一个核心设计是"参数校验"——Agent 传给工具的参数必须有类型、有约束，否则 LLM 乱传参工具就崩了。

这在 MCP（Model Context Protocol）里是这样定义的：

```typescript
{
  name: "read_file",
  description: "读取文件的指定行数",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "文件路径",
        pattern: "^/[\\w/.-]+$"
      },
      lines: {
        type: "integer",
        description: "读取的行数",
        minimum: 1,
        maximum: 1000,
        default: 100
      }
    },
    required: ["path"]
  }
}
```

SSH 里对应的东西有两个层面：

**Shell 脚本的参数解析**：

```bash
#!/bin/bash
# getopts 处理带类型的参数
while getopts "p:l:h" opt; do
  case $opt in
    p) path="$OPTARG" ;;
    l) lines="$OPTARG" ;;
    h) echo "Usage: $0 -p <path> -l <lines>"; exit 0 ;;
  esac
done

# 参数校验
if [[ ! "$path" =~ ^/ ]]; then
  echo "Error: path must be absolute" >&2
  exit 1
fi

if [[ -n "$lines" && "$lines" -gt 1000 ]]; then
  echo "Error: lines cannot exceed 1000" >&2
  exit 1
fi
```

**authorized_keys 命令限制**：

```bash
# SSH key 绑定可执行的命令
command="/usr/local/bin/read_file_wrapper.sh",no-pty,no-X11-forwarding ssh-rsa AAAA...
```

这个 `command=` 字段的意思是：持有这个 key 的人，SSH 连接进来也只能执行这个脚本——相当于 MCP 的"工具白名单"。SSH key 就是"身份 token"，脚本里的参数校验就是"参数 schema"。

---

## 4. 错误处理：exit code vs error object

Tool Calling 需要统一错误处理。正常返回 result，异常返回 error。MCP 里的错误格式：

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": {
      "tool": "read_file",
      "reason": "file not found",
      "path": "/nonexistent/file"
    }
  },
  "id": 1
}
```

SSH / Shell 的错误处理是同一套逻辑，只是用 exit code 表示：

```bash
#!/bin/bash
set -euo pipefail

read_file() {
  local path="$1"
  local lines="${2:-100}"

  # 文件不存在
  if [[ ! -f "$path" ]]; then
    echo "Error: file not found: $path" >&2
    exit 2  # 2 = 文件不存在
  fi

  # 没有读取权限
  if [[ ! -r "$path" ]]; then
    echo "Error: permission denied: $path" >&2
    exit 13  # 13 = EACCES
  fi

  # 读取成功
  head -n "$lines" "$path"
  exit 0
}

read_file "$@"
```

Exit code 是 Shell 世界的错误码标准：0 = 成功，1 = 一般错误，2 = 文件不存在，13 = 权限拒绝，137 = OOM Kill。这些语义是 POSIX 规定的，任何语言、任何平台都通用。

MCP 的 error object 做的，是把这些 exit code + stderr 信息结构化成 JSON，加上了错误分类（code）和附加数据（data）——对机器更友好，对调试更清晰。但底层的"成功/失败 + 原因描述"模型是一样的。

---

## 5. 工具发现：authorized_keys vs MCP Registry

MCP 的一个关键能力是"工具发现"——Agent 能查询当前有哪些工具可用、每个工具的参数是什么。

```json
// 查询可用工具
{"method": "tools/list", "params": {}}
// 响应
{
  "tools": [
    {"name": "read_file", "description": "...", "inputSchema": {...}},
    {"name": "write_file", "description": "...", "inputSchema": {...}},
    {"name": "run_shell", "description": "...", "inputSchema": {...}}
  ]
}
```

SSH 对应的机制是 `authorized_keys` 和 `PATH`：

```bash
# authorized_keys 定义了可用命令
command="/opt/agent/tools/read_file.sh" ssh-rsa AAAA...

command="/opt/agent/tools/write_file.sh" ssh-rsa BBBB...

# PATH 里有什么，Agent 就能调用什么
echo $PATH
# /opt/agent/bin:/usr/local/bin:/usr/bin:/bin
```

MCP 的"注册中心"（Registry）是把工具清单显式化了——每个工具都有 name、description、schema，可以动态注册和注销。SSH 的做法更隐式：工具就是 PATH 里的可执行文件，加上 authorized_keys 里的 command 限制。

两种方式各有优劣：
- MCP 的显式注册：类型安全，LLM 能准确知道参数要求
- SSH 的隐式 PATH：更灵活，新增工具不需要改配置

---

## 6. 实时交互：pty vs SSE / WebSocket

有些 Agent 工具需要流式输出——比如执行一个长任务，逐步返回日志。这在 MCP 里用 Server-Sent Events（SSE）实现：

```
event: tool_call_started
data: {"tool": "run_shell", "args": {"command": "make build"}}

event: log
data: {"line": "Compiling module a..."}

event: log
data: {"line": "Compiling module b..."}

event: tool_call_completed
data: {"exit_code": 0, "duration_ms": 45321}
```

SSH 的等价物是 **pty（pseudo-terminal）**：

```bash
ssh -t agent-bot@host "make build"
# 输出实时流向终端
# Compiling module a...
# Compiling module b...
# Build completed in 45s
```

`-t` 参数分配一个伪终端，让远程命令的输出实时流回本地。对于需要交互的长时间任务，还可以配合 `tmux`：

```bash
ssh agent-bot@host "tmux new-session -d -s build 'make build'"
ssh agent-bot@host "tmux capture-pane -t build -p | tail -20"  # 实时查看进度
ssh agent-bot@host "tmux detach -t build"  # 断开连接，任务继续
```

MCP 的 SSE 流式输出和 SSH pty 的实时终端，本质上是同一个问题的两种解法——怎么把远程产生的输出尽快传回调用方。区别只是：SSE 是 HTTP 上的文本流，pty 是 SSH 协议上的字节流。

---

## 7. 权限模型：SSH key + command restriction vs OAuth + Scopes

安全地暴露工具给 Agent，需要精细的权限控制。MCP 的方案是 OAuth 2.0 + scopes：

```json
{
  "scopes": ["files:read", "files:write", "shell:execute"],
  "expires_in": 3600,
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

SSH 的等价方案是 **SSH key + forced command + rsync/scp restrictions**：

```bash
# authorized_keys 精细控制
# 只允许 rsync 读文件
command="rsync --server --sender . /data/",no-pty,no-X11-forwarding ssh-rsa AAAA...

# 只允许特定 IP 访问
from="192.168.1.0/24",command="/opt/agent/read-only.sh" ssh-rsa BBBB...

# 环境变量限制
environment="AGENT_MODE=read-only",command="/opt/agent/read.sh" ssh-rsa CCCC...
```

SSH key 就是令牌，authorized_keys 里的 `command=` 字段就是 scope 限制，`from=` 就是 IP 白名单。OAuth + scopes 做的，是把这套逻辑从"配置文件"抽象成"标准协议"，让权限控制可以跨系统互操作。

---

## 8. 多工具编排：SSH chain vs MCP middleware

当 Agent 需要组合调用多个工具时——比如"先读文件、再调用翻译 API、再写回文件"——这在 SSH 世界里叫管道和脚本链：

```bash
# 管道：上一个命令的输出是下一个的输入
ssh agent@host "cat /data/report.txt" \
  | translate-api --from en --to zh \
  | ssh agent@host "cat > /data/report-zh.txt"
```

MCP 的多工具编排逻辑类似，但更声明式：

```javascript
// MCP client 编排多工具调用
const content = await client.callTool("read_file", { path: "/data/report.txt" });
const translated = await llm.translate(content, { to: "zh" });
await client.callTool("write_file", { path: "/data/report-zh.txt", content: translated });
```

两者都是"数据流经一系列处理节点"的模式。SSH 用 shell 管道实现，MCP 用异步函数链实现。更现代，但更复杂——也引入了更多可能的故障点。

---

## 9. 从 SSH 能学到什么

把 SSH 的设计对照看下来，Tool Calling 并没有发明新范式。它做的事情是：

**把分散的最佳实践标准化。**

SSH 的工具执行是点对点的，配置在 authorized_keys 里，跨系统复用很麻烦。MCP 把"工具定义、参数 schema、调用协议、错误格式、流式输出"统一成标准——任何实现了 MCP server 的工具，理论上任何 MCP client 都能调用。

这是它的价值。但 SSH 的教训同样值得重视：

1. **Exit code 和 stderr 是免费的错误语义**——不要丢掉它们。结构化的 error object 很好，但底层的 exit code 也要保留。
2. **工具发现不要太动态**——SSH 的 PATH 模式很灵活，但也容易产生"这个工具到底在哪"的困惑。MCP 的显式注册更好，但不要把注册中心本身变成单点故障。
3. **权限控制要分层**——SSH key 只管身份，command= 只管能跑什么，更细的权限要靠 AppArmor/SELinux。Tool Calling 也需要类似的纵深防御：OAuth token 管身份，scopes 管操作范围，运行时 sandbox 管操作对象。
4. **幂等性是工具设计的第一原则**——SSH 脚本如果每次运行都修改状态，管道串起来就容易出问题。Tool Calling 也一样：同一个调用不管跑多少次，结果应该一致（除非工具的目的就是写状态）。

---

## 结语：工具调用的本质从未改变

1996 年，SSH 让人类可以在任何机器上执行任何命令。

2023 年，MCP 让 LLM 可以在任何环境里调用任何工具。

技术栈变了，协议变了，参数从字符串变成 JSON，但问题域没有变：**如何安全地、可靠地把意图翻译成执行，把执行结果翻译成响应。**

SSH 的答案是管道、exit code、authorized_keys、pty。MCP 的答案是 JSON-RPC、schema、OAuth、流式事件。

理解了这个等价关系，你就既懂了 SSH 的设计哲学，也懂了 Tool Calling 的本质——以及它们各自的局限性。

工具调用的未来，可能不是更复杂的协议，而是回到 SSH 的某种简洁：让 LLM 面对一台它可以信任的"远程机器"，给它一个受限的 shell，让它自己探索。
