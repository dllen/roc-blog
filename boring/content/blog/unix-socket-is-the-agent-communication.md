---
title: "Agent 的通信，90% 是 1996 年的 Unix Socket"
date: 2026-09-01
description: "Agent 之间的通信、Agent 和外部服务的交互——这些听起来是分布式系统的新问题。但如果你仔细看，本地进程间通信（IPC）早在 1979 年就有完整答案了：Unix Domain Socket 的可靠传输、权限验证、文件描述符传递，比 gRPC 和 WebSocket 早了 40 年。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Linux", "IPC", "Unix Socket", "分布式", "通信"]
extra:
  update_date: 2026-09-01
---

写完 Agent 安全，有读者问最后一个方向：Agent 之间的通信呢？

Multi-Agent 系统需要 Agent 之间传递消息；Agent 和外部服务需要交互；Agent 需要调用远程 API。这些听起来是分布式系统的新挑战。

但如果你仔细看，**进程间通信（IPC）** 的问题在 1979 年就解决了。Unix Domain Socket、管道、共享内存——这些 Linux 的 IPC 机制，早就涵盖了 Agent 通信的所有模式。

本文把 Agent 通信还原到 IPC，看看 Unix Socket 能给 Agent 通信带来什么启发。

---

## 1. Agent 通信的本质：进程间传递消息

Agent 通信要解决的核心问题：

1. **消息格式**：怎么把 Agent 的输出编码成可传输的数据？
2. **传输协议**：怎么把消息从 A 点送到 B 点？
3. **可靠性**：消息会不会丢失？会不会重复？
4. **权限控制**：谁可以给谁发消息？

这四个问题，正是 Unix IPC 在 1979 年要解决的。

---

## 2. Unix Domain Socket：本地进程通信的标准方案

**Unix Domain Socket（UDS）** 是 Linux 本地进程通信的标准方案：

```bash
# 创建 Unix Domain Socket
nc -lU /tmp/agent.sock

# 或者用 Python
import socket

# 服务端
server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind('/tmp/agent.sock')
server.listen(1)

conn, addr = server.accept()
data = conn.recv(1024)
conn.sendall(b"ACK")

# 客户端
client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
client.connect('/tmp/agent.sock')
client.sendall(b"Hello from Agent A")
response = client.recv(1024)
```

UDS 的特点：
- **本地通信**：不走网络栈，没有网络延迟和丢包
- **基于文件**：Socket 文件在文件系统里，可以设置权限
- **可靠传输**：TCP 协议保证消息不丢失、不重复
- **支持字节流和数据报**：SOCK_STREAM（面向流）和 SOCK_DGRAM（面向消息）

**Agent 对应的场景**：同一台机器上运行的多个 Agent，用 Unix Domain Socket 通信是最高效、最安全的选择。

---

## 3. 消息格式：JSON vs Protocol Buffers vs MessagePack

Unix Socket 传输的是原始字节，需要约定消息格式。常见选择：

```python
# JSON：人类可读，但体积大
message = json.dumps({"agent": "researcher", "task": "analyze", "data": {...}})

# Protocol Buffers：体积小，有 schema，但需要编译
message = AgentMessage(
    sender="researcher",
    receiver="designer",
    task="design",
    payload={"spec": "..."}
)

# MessagePack：二进制 JSON，体积小，支持动态 schema
message = msgpack.packb({"agent": "researcher", "task": "analyze"})
```

```bash
# 消息大小对比（典型 Agent 消息）
$ python -c "import json, msgpack; data = {'agent': 'x', 'task': 'y', 'data': 'z' * 1000}
print('JSON:', len(json.dumps(data)), 'bytes')
print('MsgPack:', len(msgpack.packb(data)), 'bytes')
# JSON: 1020 bytes
# MsgPack: 1013 bytes
```

**选择原则**：
- 开发调试阶段用 JSON（可读性好）
- 生产环境用 Protocol Buffers 或 MessagePack（体积小、速度快）
- 需要 schema 验证时用 Protobuf（编译期检查）

---

## 4. 权限控制：socket 文件权限

Unix Domain Socket 的一个独特优势：**可以用文件系统权限控制谁可以连接**。

```bash
# socket 文件在文件系统里，可以设置权限
$ ls -l /tmp/agent.sock
srwxr-xr-x 1 agent-researcher agent-group 2 Sep  1 10:00 /tmp/agent.sock

# 只有 agent-researcher 和 agent-designer 可以连接
chmod 660 /tmp/agent.sock
chown agent-researcher:agent-group /tmp/agent.sock

# 其他用户尝试连接会报错
$ sudo -u agent-coder python client.py
# PermissionError: [Errno 13] Permission denied
```

Agent 的权限控制对应 Unix Socket 的文件权限：

```python
# Agent A 监听，Agent B 连接（需要权限检查）
class AgentSocketServer:
    def __init__(self, socket_path, allowed_agents):
        self.socket_path = socket_path
        self.allowed_agents = allowed_agents
        os.chmod(socket_path, 0o660)
        os.chown(socket_path, uid, gid)

    def handle_connection(self, conn, client_creds):
        # 检查连接者身份
        if client_creds.pid not in self.allowed_agents:
            conn.sendall(b"ERROR: Permission denied")
            conn.close()
            return

        # 身份验证通过，处理消息
        self.process_message(conn)
```

**关键认知**：Unix Socket 的文件权限是免费的访问控制——不需要额外的身份验证机制，文件系统权限本身就保证了只有授权进程才能连接。

---

## 5. 管道：父子进程通信

**管道（Pipe）** 是最古老的 IPC 机制——单向字节流：

```bash
# 匿名管道：父进程创建，fork 出来的子进程继承
$ echo "hello" | grep "hello"
hello

# 命名管道（FIFO）：两个独立进程通信
$ mkfifo /tmp/agent-pipe
$ echo "message from A" > /tmp/agent-pipe &  # 进程 A
$ cat /tmp/agent-pipe                           # 进程 B
message from A
```

Agent 的简单消息传递可以用管道：

```python
# 父子 Agent 用管道通信
import subprocess, os, json

# 创建管道
read_fd, write_fd = os.pipe()

# 启动子 Agent，继承管道
child = subprocess.Popen(
    ['python', 'child_agent.py'],
    stdin=read_fd,
    stdout=write_fd
)

# 父 Agent 发送消息
os.write(write_fd, json.dumps({"task": "analyze", "data": "..."}).encode())

# 父 Agent 接收响应
response = os.read(read_fd, 4096)
```

**管道的限制**：只能单向通信（需要两个管道做双向），没有持久性（进程重启后管道消失）。适合父子进程、生命周期相关的 Agent 协作。

---

## 6. 共享内存：高速大数据交换

管道传输消息，但如果两个 Agent 需要共享大量数据（比如 Agent A 读取了一个 100MB 的文件，Agent B 要处理它），复制来复制去效率太低。

**共享内存（Shared Memory）** 让多个进程直接读写同一块内存：

```bash
# 创建共享内存段
$ ipcs -m
------ Shared Memory Segments --------
key        shmid      owner      perms      bytes      nattch     status
0x00000000 0          root       600        1048576    2
```

```python
# Python 实现共享内存（用 mmap）
import mmap, os, json

# Agent A：创建共享内存，写入数据
shm = mmap.mmap(-1, 1024*1024, 'agent_shared')  # 1MB 共享内存
shm.write(json.dumps({"large_data": "..." * 10000}).encode())
shm.flush()
shm.close()

# Agent B：打开共享内存，读取数据
shm = mmap.mmap(0, 1024*1024, 'agent_shared')
data = json.loads(shm.read().decode())
shm.close()
```

**Agent 对应场景**：多 Agent 协作处理大型文件时，共享内存避免了大量数据复制。但要注意同步问题（用 semaphore 或 mutex）。

---

## 7. 消息队列：异步可靠的进程间通信

管道是同步的——发送者要等接收者准备好。**消息队列（Message Queue）** 解决了这个问题：发送者把消息放进队列，立即返回；接收者从队列里取消息，不需要同步：

```bash
# 创建 System V 消息队列
$ ipcs -q
------ Message Queues --------
key        msqid      owner      perms      used-bytes   messages
0x12345678 0          agent      644        0            0
```

```python
# Python 实现消息队列
import redis  # 或者用 POSIX mq_open

# Agent A：发送消息（异步，立即返回）
redis_client.lpush('agent_queue:designer',
    json.dumps({"from": "researcher", "task": "design", "data": {...}})
)

# Agent B：接收消息（阻塞等待）
message = redis_client.rpop('agent_queue:designer')
task = json.loads(message)
```

Agent 的异步任务分发对应消息队列：

```python
# 异步 Agent 通信模式
class AsyncAgentCommunicator:
    def send_task(self, target_agent, task):
        # 任务入队，立即返回
        queue_name = f"agent_queue:{target_agent}"
        self.redis.lpush(queue_name, serialize(task))
        return {"status": "queued", "task_id": task.id}

    def receive_task(self, agent_id, timeout=30):
        # 阻塞等待，最多等 30 秒
        queue_name = f"agent_queue:{agent_id}"
        result = self.redis.brpop(queue_name, timeout=timeout)
        if result:
            return deserialize(result)
        return None
```

**消息队列的优势**：解耦发送者和接收者（不需要同时在线）、可靠传递（Redis 有持久化）、支持优先级和延迟。

---

## 8. 文件描述符传递：零拷贝的进程间资源分享

Unix Socket 有一个独特能力：**跨进程传递文件描述符**：

```python
# 服务端：通过 Unix Socket 发送一个打开的文件描述符给客户端
# 客户端不需要重新打开文件，直接获得服务端打开的文件句柄

import socket, os

# SCM_RIGHTS：发送文件描述符的 Unix Socket 控制消息
def send_fd(sock, fd):
    # 发送一个"空消息"带上文件描述符
    sock.sendmsg([b'FD'], [(socket.SOL_SOCKET, socket.SCM_RIGHTS, bytes([fd]))])

def recv_fd(sock):
    # 接收文件描述符
    msg, fds, _, _ = sock.recvmsg(1, socket.CMSG_SPACE(1))
    return fds[0] if fds else None
```

这个能力在 Agent 场景里很有用：比如 Agent A 打开了一个文件，想把文件句柄直接交给 Agent B 处理，不需要把文件内容复制一遍：

```python
# Agent A：打开文件，把文件描述符传递给 Agent B
with open('/data/large_file.csv', 'r') as f:
    send_fd(agent_socket, f.fileno())

# Agent B：接收文件描述符，开始处理
fd = recv_fd(agent_socket)
reader = os.fdopen(fd, 'r')
for line in reader:
    process(line)
```

**零拷贝的优势**：文件描述符传递避免了数据复制，效率极高。适合 Agent 之间需要共享大文件或网络连接的场景。

---

## 9. gRPC 和 WebSocket：网络时代的 IPC

Unix Socket 只能做本地通信。如果 Agent 分布在不同机器上，就需要**网络 IPC**：

```python
# gRPC：高性能 RPC 框架，适合 Agent 间远程调用
# 定义 proto
service AgentService {
    rpc SendTask(Task) returns (TaskResult);
    rpc StreamLogs(StreamRequest) returns (stream LogEntry);
}

# 服务端
class AgentServicer(agent_pb2_grpc.AgentServiceServicer):
    def SendTask(self, request, context):
        result = self.agent.process(request.task)
        return agent_pb2.TaskResult(status="success", data=result)

# 客户端
stub = agent_pb2_grpc.AgentServiceStub(channel)
result = stub.SendTask(agent_pb2.Task(task="analyze"))
```

```python
# WebSocket：双向实时通信，适合 Agent 需要推送消息的场景
async def websocket_handler(websocket, path):
    async for message in websocket:
        task = json.loads(message)
        result = await agent.process(task)
        await websocket.send(json.dumps(result))
```

**选择原则**：
- 本地通信（同一台机器）→ Unix Socket 或管道
- 远程调用（同步请求-响应）→ gRPC
- 远程实时通信（双向流）→ WebSocket
- 异步任务分发（解耦发送者和接收者）→ Redis / RabbitMQ

---

## 10. 从 Unix Socket 能学到什么

把 Unix IPC 和 Agent 通信对照下来，核心设计原则很清晰：

**选择正确的 IPC 机制**：本地通信用 Unix Socket（高效、安全），父子进程通信用管道（简单），异步任务用消息队列（解耦），大文件共享用共享内存（零拷贝），远程调用用 gRPC。

**消息格式要选对**：开发调试用 JSON（可读性好），生产环境用 Protocol Buffers（体积小、速度快）。

**权限控制要内置**：Unix Socket 的文件权限是天然的访问控制，不需要额外的认证机制。Agent 通信也应该利用文件系统权限来限制哪些 Agent 可以互相通信。

**异步优于同步**：同步 IPC 要求双方同时在线，任何一方阻塞都会影响另一方。消息队列解耦了发送者和接收者，更适合 Agent 这种"不总是可用"的组件。

**零拷贝避免不必要的复制**：文件描述符传递、共享内存——这些机制避免了大量数据复制。Agent 协作处理大文件时尤其重要。

**本地优先，网络备选**：同一台机器上的 Agent 没有理由走网络栈。Unix Socket 的性能比 gRPC 好一个数量级。先用本地 IPC，再考虑网络通信。

---

## 结语：通信的本质从未改变

1979 年，Unix 引入了管道和消息队列。之后的 45 年，进程间通信的基本模式没有变化：消息格式、传输协议、权限控制、可靠性保证。

2026 年，Agent 之间的通信引入了 gRPC、WebSocket、Redis。但剥开这些现代化的外衣，它们解决的是完全相同的问题：

- **怎么让进程 A 的输出成为进程 B 的输入？**
- **怎么保证消息不丢失、不重复？**
- **怎么控制谁能给谁发消息？**
- **怎么让通信双方不需要同时在线？**

Unix IPC 已经回答了这些问题。gRPC、WebSocket、Redis 不过是把 Unix IPC 的设计原则搬到网络上，在新的场景下重新实现了一遍。

理解了这个等价关系，你就既懂了 Unix Socket 的设计哲学，也懂了 Agent 通信的本质：

不是发明新的通信范式，而是选择正确的 IPC 机制，然后在 Agent 的语境里应用 Unix 几十年来打磨的最佳实践。

本地 Agent 用 Unix Socket，跨机器 Agent 用 gRPC，异步任务用消息队列——这和 45 年前的进程间通信策略没有本质区别。

区别只在于，当年我们叫"进程间通信"，现在叫"Agent 通信"。但问题域，还是同一个。
