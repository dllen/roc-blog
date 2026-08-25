---
title: "从 select、poll、epoll 到 io_uring：Linux I/O 多路复用的演进之路"
date: "2025-08-22"
description: "深入解析 Linux I/O 多路复用技术的演进历程：从最早的 select/poll 到 epoll 的 O(1) 高效模型，再到 io_uring 的异步 I/O 新范式，探讨各代技术的设计思路、性能差异与适用场景。"
taxonomies:
  tags: ["Linux", "I/O", "Network", "Performance", "System Programming"]
---

在构建高性能服务器时，I/O 多路复用是一个核心话题。从最早期的 `select`、`poll`，到 Linux 特有的 `epoll`，再到最近引入的 `io_uring`，每代技术都在解决前一代的瓶颈。本文梳理这条演进路径，帮助你在实际工程中做出合理的技术选型。

> **代码示例**：本文所有示例均有完整可运行的 C 语言实现，代码位于 [static/code/io-multiplexing/](/code/io-multiplexing/) 目录，包含 `select`、`poll`、`epoll`（LT/ET 两种模式）、`io_uring` 文件读取和 `io_uring` 网络服务器共 6 个文件。运行 `make run-epoll-lt` 即可启动测试服务器，用 `nc localhost 9999` 连接验证。


## 1. 问题的起源：阻塞 I/O 与多线程模型的困境

在讨论多路复用之前，先看一个朴素的处理方式：每个连接一个线程（thread-per-connection）。在连接数较少时，这个模型简单有效。但当并发连接数上升到数万甚至数十万时，问题随之而来：

- **线程创建和切换开销巨大**：每个线程都占用内核栈（约 8MB）、TCB 等资源；上下文切换时寄存器、缓存的保存与恢复也有显著成本。
- **内存消耗线性增长**：10 万连接 × 8MB/线程 = 800GB 内存，即使这些连接大部分处于空闲状态，资源也已耗尽。
- **可扩展性差**：在 Linux 中，线程调度仍然依赖 CPU 中断，过多线程会导致调度器负载上升。

C10K 问题（C10K Problem）描述的就是这种场景：**如何在有限资源下同时服务上万个并发连接？** 答案之一就是 I/O 多路复用——用一个线程（或少量线程）同时监控多个文件描述符上的 I/O 事件。

## 2. select：第一个通用方案

### 2.1 基本用法

`select` 诞生于 4.2BSD，是 POSIX 标准的一部分。其核心思想是：**将需要监控的 fd 集合（readfds、writefds、exceptfds）传入内核，由内核返回就绪的 fd 列表**。

```c
#include <sys/select.h>

int select(int nfds, fd_set *readfds, fd_set *writefds,
           fd_set *exceptfds, struct timeval *timeout);

// fd_set 操作宏
void FD_ZERO(fd_set *set);
void FD_SET(int fd, fd_set *set);
void FD_CLR(int fd, fd_set *set);
int  FD_ISSET(int fd, fd_set *set);
```

一个典型的 echo 服务器：

```c
int main() {
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(listen_fd, ...);
    listen(listen_fd, 128);

    fd_set read_fds, master;
    FD_ZERO(&master);
    FD_SET(listen_fd, &master);
    int max_fd = listen_fd;

    while (1) {
        read_fds = master;  // select 会修改 fd_set，每次必须重置
        int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);

        for (int fd = 0; fd <= max_fd && ready > 0; fd++) {
            if (FD_ISSET(fd, &read_fds)) {
                ready--;
                if (fd == listen_fd) {
                    int conn = accept(listen_fd, NULL, NULL);
                    FD_SET(conn, &master);
                    max_fd = max(max_fd, conn);
                } else {
                    char buf[1024];
                    int n = read(fd, buf, sizeof(buf));
                    if (n > 0) write(fd, buf, n);
                    else { close(fd); FD_CLR(fd, &master); }
                }
            }
        }
    }
}
```

### 2.2 select 的三大缺陷

**缺陷一：fd 数量受限**

`fd_set` 本质是一个固定长度的位图（通常为 `unsigned long[32]`，共 1024 位）。`nfds` 参数表示"检查到第几个 fd"，但 `FD_SETSIZE` 通常硬编码为 1024。这意味着无法监控超过 1024 个 fd。

**缺陷二：每次调用需要完整拷贝**

每次 `select` 调用，都需要将整个 fd 集合从用户态拷贝到内核态。即使没有任何 fd 就绪，内核也必须遍历一遍传入的集合。即便借助 `__NFDBITS` 分段扫描，内核仍需 O(n) 地线性扫描所有 fd。

**缺陷三：每次返回后需要全量重置**

`select` 返回时，内核会修改传入的 `fd_set`（清除未就绪的 fd），所以每次循环都必须 `FD_ZERO` + `FD_SET` 重新构建集合。这是 O(n) 的重复工作。

这三个缺陷在 C10K 场景下叠加，使得 `select` 成为了明显的性能瓶颈。

## 3. poll：去除 FD_SETSIZE 限制

`poll` 在 POSIX.1g 中引入，与 `select` 的核心思路一致，但用动态数组替代了固定位图：

```c
#include <poll.h>

struct pollfd {
    int   fd;       // 要监控的文件描述符
    short events;   // 关心的事件（输入）
    short revents;  // 实际发生的事件（输出，由内核填充）
};

int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

```c
struct pollfd fds[1024];
fds[0].fd = listen_fd;
fds[0].events = POLLIN;

int nfds = 1;
while (1) {
    int ready = poll(fds, nfds, -1);

    for (int i = 0; i < nfds && ready > 0; i++) {
        if (fds[i].revents & POLLIN) {
            ready--;
            if (fds[i].fd == listen_fd) {
                int conn = accept(listen_fd, NULL, NULL);
                fds[nfds].fd = conn;
                fds[nfds].events = POLLIN;
                nfds++;
            } else {
                char buf[1024];
                int n = read(fds[i].fd, buf, sizeof(buf));
                if (n > 0) write(fds[i].fd, buf, n);
                else close(fds[i].fd);
            }
        }
    }
}
```

`poll` 解决了 `select` 的第一个缺陷——fd 数量不再受 `FD_SETSIZE` 限制。但本质上仍然是线性扫描：内核仍然需要遍历所有传入的 `pollfd` 数组，检查每个 fd 的状态。**在 10,000 个 fd 中只有 1 个活跃时，内核仍需遍历全部 10,000 个条目**，时间复杂度仍为 O(n)。

此外，`poll` 每次调用仍需用户态↔内核态的数据拷贝，开销并未减少。

## 4. epoll：O(1) 的高效监控模型

### 4.1 三步工作模式

`epoll` 是 Linux 2.6 引入的系统调用，它的核心改进在于：**将 fd 的注册/删除/监控状态保持在内核中，避免重复拷贝和全量扫描**。使用分为三个阶段：

```c
#include <sys/epoll.h>

// 1. 创建 epoll 实例
int epfd = epoll_create1(EPOLL_CLOEXEC);

// 2. 注册感兴趣的 fd 和事件
struct epoll_event ev;
ev.events = EPOLLIN;
ev.data.fd = listen_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);

// 3. 等待事件就绪（核心改进：只返回就绪的 fd）
struct epoll_event events[1024];
int n = epoll_wait(epfd, events, 1024, -1);
for (int i = 0; i < n; i++) {
    int fd = events[i].data.fd;
    if (events[i].events & EPOLLIN) {
        // 处理 I/O
    }
}
```

### 4.2 核心数据结构：红黑树 + 就绪链表

`epoll` 在内核中维护两个关键数据结构：

- **红黑树**：存储所有被监控的 fd。`epoll_ctl(ADD/MOD/DEL)` 操作对应红黑树的插入/修改/删除，时间复杂度 O(log N)。
- **就绪链表（ready list）**：当某个 fd 状态发生变化（如 socket 收到数据）时，内核将其加入就绪链表。`epoll_wait` 只需遍历就绪链表，返回实际就绪的 fd，时间复杂度 O(k)，其中 k 是就绪 fd 的数量，通常远小于 N。

```
用户态                     内核态
┌──────────┐          ┌────────────────────────┐
│  应用    │          │   epoll 实例           │
│          │          │  ┌───────────────┐     │
│          │          │  │  红黑树 (fd)  │     │
│          │◄─ epoll_wait ──│  就绪链表    │────┼──► 返回就绪 fd
└──────────┘          │  └───────────────┘     │
                      └────────────────────────┘
```

### 4.3 水平触发与边缘触发

`epoll` 支持两种触发模式：

- **LT（Level-Triggered，水平触发）**：只要 fd 处于就绪状态，`epoll_wait` 每次都会返回。这是 `epoll` 的默认行为，与 `select/poll` 的语义一致，编程友好。
- **ET（Edge-Triggered，边缘触发）**：只有当 fd 从未就绪变为就绪的那一刻（上升沿），`epoll_wait` 才返回一次。应用程序必须一次性将所有数据读完（用 while 循环），否则剩余数据会被"饿死"。

```c
// 设置 ET 模式
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // 边缘触发
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);

// ET 模式下读取 socket 的正确姿势
while (1) {
    ssize_t n = read(fd, buf, sizeof(buf));
    if (n == -1) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) break;
        break;
    }
    if (n == 0) { close(fd); break; }
}
```

ET 模式配合非阻塞 I/O（`O_NONBLOCK`）可以极大减少系统调用次数，但编程复杂度更高。

### 4.4 epoll 的性能优势

| 操作 | select/poll | epoll |
|------|-------------|-------|
| fd 注册 | 每次调用拷贝 O(n) | 只需一次 O(log N) |
| 等待返回 | O(n) 遍历所有 fd | O(k) 只返回就绪项 |
| 维护监控集合 | 每次重置 O(n) | 增量修改 O(log N) |
| fd 数量上限 | ~1024（select）或动态数组 | 仅受内存限制 |

在 nginx、Redis 等高性能网络服务中，`epoll` 是标准配置。

### 4.5 一个完整的 epoll 服务器

```c
int main() {
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    bind(listen_fd, ...);
    listen(listen_fd, 128);

    int epfd = epoll_create1(EPOLL_CLOEXEC);
    struct epoll_event ev = { .events = EPOLLIN, .data.fd = listen_fd };
    epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev);

    struct epoll_event events[1024];
    char buf[4096];

    while (1) {
        int n = epoll_wait(epfd, events, 1024, -1);
        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            if (events[i].events & (EPOLLERR | EPOLLHUP)) {
                close(fd);
                continue;
            }
            if (events[i].events & EPOLLIN) {
                if (fd == listen_fd) {
                    while (1) {
                        int conn = accept(listen_fd, NULL, NULL);
                        if (conn == -1) break;
                        setnonblock(conn);
                        ev.events = EPOLLIN | EPOLLET;
                        ev.data.fd = conn;
                        epoll_ctl(epfd, EPOLL_CTL_ADD, conn, &ev);
                    }
                } else {
                    while (1) {
                        ssize_t len = read(fd, buf, sizeof(buf));
                        if (len == -1 && errno == EAGAIN) break;
                        if (len <= 0) { close(fd); break; }
                        write(fd, buf, len);
                    }
                }
            }
        }
    }
}
```

## 5. io_uring：异步 I/O 的新范式

### 5.1 为什么还需要 io_uring

`epoll` 虽然高效，但本质上仍是**同步多路复用**：应用程序调用 `epoll_wait` 等待，内核通知就绪后，应用程序再发起 `read/write` 系统调用。即使是异步通知，I/O 数据的传输仍然是同步的——每一次 `read/write` 都是一次从用户态到内核态的上下文切换。

`io_uring`（Linux 5.1 引入）带来了真正的**异步 I/O**：提交 I/O 请求后立即返回，内核完成 I/O 后通过环形缓冲区通知应用程序。整个过程只需两次系统调用（提交和收集），数据搬运完全由内核异步完成。

### 5.2 核心数据结构：两个环形缓冲区

`io_uring` 通过两个环形缓冲区（Ring Buffer）在用户态和内核态之间共享数据：

- **Submission Queue (SQ)**：应用程序写入 I/O 请求（submission queue entry, SQE）
- **Completion Queue (CQ)**：内核写入完成的 I/O 结果（completion queue entry, CQE）

```
用户态                      内核
┌─────────────────┐     ┌──────────────────┐
│ Submission Queue│────►│                  │
│ (SQ, 写指针)     │     │   处理 I/O 请求   │
└─────────────────┘     │                  │
                        └────────┬─────────┘
                                 │
┌─────────────────┐     ┌────────▼─────────┐
│ Completion Queue│◄────│                  │
│ (CQ, 读指针)     │     │   写入完成结果    │
└─────────────────┘     └──────────────────┘
```

### 5.3 两种使用模式

**libaio**：内核原生接口，异步 I/O，但仅支持 `O_DIRECT` 磁盘 I/O，不支持 socket。

**io_uring (推荐)**：支持 disk + socket 的统一异步接口，使用更简单。

### 5.4 使用 io_uring 读取文件

```c
#include <liburing.h>

int main() {
    struct io_uring ring;
    io_uring_queue_init(32, &ring, 0);

    // 准备读取请求
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    io_uring_prep_read(sqe, STDIN_FILENO, buf, sizeof(buf), 0);
    io_uring_sqe_set_data(sqe, "stdin-read");  // 设置用户数据用于识别
    io_uring_submit(&ring);  // 提交到内核

    // 等待完成
    struct io_uring_cqe *cqe;
    io_uring_wait_cqe(&ring, &cqe);
    printf("Read %d bytes, tag=%llu\n",
           cqe->res, (unsigned long long)cqe->user_data);
    io_uring_cqe_seen(&ring, cqe);

    io_uring_queue_exit(&ring);
    return 0;
}
```

### 5.5 使用 io_uring 处理网络 I/O

```c
int main() {
    struct io_uring ring;
    io_uring_queue_init(1024, &ring, 0);

    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    bind(listen_fd, ...);
    listen(listen_fd, 128);
    make_nonblocking(listen_fd);

    // 提交 accept 请求
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    io_uring_prep_accept(sqe, listen_fd, (struct sockaddr *)&client, &client_len, 0);
    sqe->user_data = 0;  // tag: 0 表示 accept 请求
    io_uring_submit(&ring);

    struct io_uring_cqe *cqe;
    while (io_uring_wait_cqe(&ring, &cqe) == 0) {
        unsigned int head, i = 0;
        struct io_uring_cqe *cqe;

        io_uring_for_each_cqe(&ring, head, i, cqe) {
            unsigned int id = cqe->user_data;
            if (id == 0) {
                // accept 完成，建立新连接
                int conn_fd = cqe->res;
                if (conn_fd >= 0) {
                    struct io_uring_sqe *sq = io_uring_get_sqe(&ring);
                    io_uring_prep_read(sq, conn_fd, buf, BUF_SIZE, 0);
                    sq->user_data = conn_fd;
                    io_uring_submit(&ring);
                }
                // 再次提交 accept
                sqe = io_uring_get_sqe(&ring);
                io_uring_prep_accept(sqe, listen_fd, ...);
                sqe->user_data = 0;
                io_uring_submit(&ring);
            } else {
                // read 完成，处理数据
                int fd = id;
                if (cqe->res > 0) {
                    // echo back
                    struct io_uring_sqe *sq = io_uring_get_sqe(&ring);
                    io_uring_prep_write(sq, fd, buf, cqe->res, 0);
                    sq->user_data = fd;
                    io_uring_submit(&ring);
                } else {
                    close(fd);
                }
            }
        }
        io_uring_cq_advance(&ring, i);
    }
}
```

### 5.6 io_uring 的进阶特性

**内核轮询模式（IORING_SETUP_SQPOLL）**：应用程序不主动调用 `io_uring_enter` 通知内核，内核线程不断轮询 SQ，有新请求立即处理。**零轮询模式（zero-copy）**结合 `send_zc`/`recv_zc` 可以实现真正零拷贝 I/O。

**fixed file table**：预先在 ring 中注册 fd，避免每次操作时内核重复引用 fd 元数据，开销进一步降低。

**linked requests**：将多个 I/O 操作链接在一起（chaining），一个完成自动触发下一个，适合流水线处理。

### 5.7 io_uring vs epoll：性能对比

| 维度 | epoll | io_uring |
|------|-------|----------|
| 适用场景 | 网络 socket 监控 | 网络 + 文件 I/O |
| I/O 模型 | 同步多路复用 | 真正异步 |
| 系统调用 | `epoll_wait` + `read/write` | `io_uring_enter`（批量） |
| 上下文切换 | 每次事件 2 次（wait + read/write） | 批量提交，减少切换 |
| 文件 I/O 异步 | 不支持 | 支持（libaio 也支持但功能少） |
| 内核要求 | 2.6+ | 5.1+（成熟于 5.19+） |
| 成熟度 | 非常成熟 | 成熟（2022 年后） |

在高性能场景下，`io_uring` 的优势体现在：批量提交减少系统调用次数、内核旁路（kernel bypass）减少数据拷贝、支持文件异步 I/O。但 `epoll` 胜在简单、成熟、文档完善，且在纯网络场景下性能差距并不悬殊。

## 6. 技术选型建议

| 场景 | 推荐方案 |
|------|---------|
| 传统网络服务器，fd 数量 < 10K | `epoll` LT 模式，成熟稳定 |
| 超高并发服务器（100K+ 连接）| `epoll` ET 模式 + 非阻塞 I/O |
| 需要异步文件 I/O | `io_uring` |
| 混合场景（网络 + 磁盘）| `io_uring` |
| 需要极致性能，C10M 级别 | `io_uring` + 内核旁路 |
| 嵌入式或兼容性优先 | `select/poll`，POSIX 兼容 |

## 7. 参考资料

- [epoll(7) — Linux Manual](https://man7.org/linux/man-pages/man7/epoll.7.html)
- [io_uring(7) — Linux Manual](https://man7.org/linux/man-pages/man7/io_uring.7.html)
- [The C10K Problem](http://www.kegel.com/c10k.html)
- [io_uring by example](https://unixism.net/2020/04/io_uring-by-example-part-1-introduction/)
- [Linux async I/O: io_uring vs libaio](https://kernel.dk/io_uring.pdf)
- Nginx, Redis, PostgreSQL 源码中 epoll/io_uring 的使用方式
