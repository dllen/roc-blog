// 从 select、poll、epoll 到 io_uring 系列
// 示例六：io_uring 网络 echo 服务器
// 编译：gcc -Wall -O2 06-io-uring-echo.c -o 06-io-uring-echo -luring
// 运行：./06-io-uring-echo [端口]

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <liburing.h>

#define SQ_DEPTH    1024
#define BUF_SIZE    4096
#define BACKLOG     128

// 每个客户端连接关联一个 context
struct conn_ctx {
    int fd;
    char buf[BUF_SIZE];
};

// 工具函数：设置非阻塞
static void setnonblock(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

// 工具函数：初始化监听 socket
static int init_listen_socket(int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { perror("socket"); return -1; }

    int opt = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons((uint16_t)port);

    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind"); close(fd); return -1;
    }
    listen(fd, BACKLOG);
    setnonblock(fd);
    return fd;
}

// 提交一个 accept 请求
static void submit_accept(struct io_uring *ring, int listen_fd) {
    static struct sockaddr_in client_addr;
    static socklen_t client_len = sizeof(client_addr);

    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    if (!sqe) return;  // SQ 满了，内核消费速度跟不上的极端情况

    // user_data = 0 标记这是 accept 请求
    io_uring_prep_accept(sqe, listen_fd,
                         (struct sockaddr *)&client_addr,
                         &client_len, 0);
    sqe->user_data = 0;  // tag: 0 = accept
}

// 提交一个 read 请求
static void submit_read(struct io_uring *ring, int fd) {
    static char bufs[SQ_DEPTH][BUF_SIZE];  // 预分配固定数量的 buffer

    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    if (!sqe) return;

    // 静态分配 buffer pool（实际项目中应使用 io_uring_register_buffer）
    static int buf_idx = 0;
    int idx = buf_idx++ % SQ_DEPTH;

    io_uring_prep_read(sqe, fd, bufs[idx], BUF_SIZE, 0);
    sqe->user_data = (uint64_t)fd;  // tag: fd = read 请求
}

// 提交一个 write（echo）请求
static void submit_write(struct io_uring *ring, int fd,
                         const char *buf, size_t len) {
    struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
    if (!sqe) return;

    io_uring_prep_write(sqe, fd, buf, len, 0);
    sqe->user_data = (uint64_t)fd;  // tag: fd = write 请求
}

int main(int argc, char *argv[]) {
    int port = (argc > 1) ? atoi(argv[1]) : 9999;
    int listen_fd = init_listen_socket(port);
    if (listen_fd < 0) return 1;
    printf("io_uring echo server listening on port %d\n", port);

    // --- 初始化 io_uring ---
    struct io_uring ring;
    if (io_uring_queue_init(SQ_DEPTH, &ring, 0) < 0) {
        perror("io_uring_queue_init"); close(listen_fd); return 1;
    }

    // 预先提交第一个 accept 请求
    submit_accept(&ring, listen_fd);
    io_uring_submit(&ring);

    struct io_uring_cqe *cqe;
    char bufs[SQ_DEPTH][BUF_SIZE];  // buffer pool 用于接收 read 数据
    int buf_map[SQ_DEPTH] = {0};    // 记录每个 buf 属于哪个 fd（简化版）

    while (1) {
        // 等待至少一个 CQE
        int ret = io_uring_wait_cqe(&ring, &cqe);
        if (ret < 0) {
            if (errno == EINTR) continue;
            perror("io_uring_wait_cqe"); break;
        }

        // 批量处理所有已就绪的 CQE（提高吞吐）
        unsigned int head = 0;
        unsigned int i = 0;
        struct io_uring_cqe *cqe_iter;
        io_uring_for_each_cqe(&ring, head, i, cqe_iter) {
            uint64_t user_data = cqe_iter->user_data;
            int fd = (int)user_data;
            int res = cqe_iter->res;

            if (fd == 0) {
                // --- accept CQE ---
                int conn_fd = res;
                if (conn_fd >= 0) {
                    struct sockaddr_in client_addr;
                    socklen_t client_len = sizeof(client_addr);
                    getpeername(conn_fd, (struct sockaddr *)&client_addr,
                                &client_len);
                    printf("[+] client connected: fd=%d from %s:%d\n",
                           conn_fd,
                           inet_ntoa(client_addr.sin_addr),
                           ntohs(client_addr.sin_port));
                    setnonblock(conn_fd);

                    // 收到连接后立即提交 read 等待数据
                    submit_read(&ring, conn_fd);
                }
                // 继续接受新连接
                submit_accept(&ring, listen_fd);
            } else if (res > 0) {
                // --- read CQE（成功读取到数据）---
                printf("fd=%d read %d bytes, echo back\n", fd, res);
                // 使用 buffer 池中的数据（简化处理）
                submit_write(&ring, fd, bufs[fd % SQ_DEPTH], (size_t)res);
                // 写完后继续等待下次可读
                submit_read(&ring, fd);
            } else if (res == 0) {
                // 对端关闭连接
                printf("[-] client disconnected: fd=%d\n", fd);
                close(fd);
            } else {
                // res < 0: I/O 错误
                fprintf(stderr, "I/O error on fd=%d: %s\n",
                        fd, strerror(-res));
                close(fd);
            }
        }

        // 通知 io_uring 已消费 i 个 CQE
        io_uring_cq_advance(&ring, i);

        // 提交本轮新产生的请求（accept + 可能的 read）
        io_uring_submit(&ring);
    }

    close(listen_fd);
    io_uring_queue_exit(&ring);
    return 0;
}
