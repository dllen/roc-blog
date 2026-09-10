# I/O 多路复用代码示例

本目录包含从 `select`、`poll`、`epoll` 到 `io_uring` 全系列完整可运行的 C 语言示例。

## 文件清单

| 文件 | 说明 |
|------|------|
| `01-select-echo.c` | 基于 `select` 的 echo 服务器（POSIX 通用） |
| `02-poll-echo.c` | 基于 `poll` 的 echo 服务器（POSIX 通用） |
| `03-epoll-lt-echo.c` | 基于 `epoll` LT 模式的 echo 服务器（Linux only） |
| `04-epoll-et-echo.c` | 基于 `epoll` ET 模式的 echo 服务器（Linux only） |
| `05-io-uring-file-read.c` | `io_uring` 异步文件读取（Linux 5.1+） |
| `06-io-uring-echo.c` | `io_uring` 网络 echo 服务器（Linux 5.1+） |
| `Makefile` | 编译脚本，含运行目标 |
| `README.md` | 本文档 |

## 编译

```bash
make
```

所有生成的二进制文件均以 `01-` 到 `06-` 为前缀。

## 运行

在终端 1 启动服务器：

```bash
make run-epoll-lt    # 推荐从 epoll LT 开始
```

在终端 2 连接测试：

```bash
nc localhost 9999
# 输入任意内容，服务器会原样 echo 回来
```

## 逐个示例说明

### 01 - select

演示 `select` 的基本用法，包括 `fd_set` 的 `FD_SET`/`FD_CLR`/`FD_ISSET` 操作。**每次循环必须重新赋值 `read_fds`**，这是 `select` 的核心缺陷之一。

### 02 - poll

用 `struct pollfd` 数组替代固定位图，支持任意数量的 fd。展示**数组末尾追加 + O(1) 删除**（用最后一个条目覆盖）的维护策略。

### 03 - epoll LT

`epoll` 入门示例，展示三步流程：`epoll_create1` → `epoll_ctl` 注册 → `epoll_wait` 等待。**LT 模式不需要 while 循环读完数据**，编程友好。

### 04 - epoll ET

`epoll` 高性能示例，展示 **ET 模式下的正确读法**：`while (read() != EAGAIN)` 循环。演示 accept、read、write 全链路 ET 写法。

### 05 - io_uring 文件读取

最简单的 `io_uring` 示例：初始化 ring → 构造 SQE → `io_uring_submit` → `io_uring_wait_cqe` → 处理 CQE。适合理解 SQ/CQ 环形缓冲区的工作方式。

### 06 - io_uring 网络服务器

完整的 `io_uring` echo 服务器，展示：
- 用 `user_data` 区分 accept / read / write 请求
- 批量 CQE 处理（`io_uring_for_each_cqe`）
- `io_uring_cq_advance` 通知内核已消费
- 提交 accept + read 形成流水线

## 性能测试参考

```bash
# 使用 ApacheBench 或 wrk 测试各实现的 QPS
wrk -t4 -c100 -d30s http://localhost:9999/

# 在 100K 并发连接下对比（需要调高 ulimit -n）：
ulimit -n 200000
make run-epoll-et &
sleep 1
wrk -t10 -c100000 -d10s http://localhost:9999/
```

## 依赖

- Linux 5.1+ 内核（`io_uring` 示例）
- `liburing-dev`（Ubuntu/Debian: `apt install liburing-dev`）
- gcc

> **注意**：macOS 不支持 `epoll` 和 `io_uring`，但 `select`/`poll` 示例可在 macOS 上正常编译运行。
