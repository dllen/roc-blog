// 从 select、poll、epoll 到 io_uring 系列
// 示例三：基于 epoll LT（水平触发）模式的 echo 服务器
// 编译：gcc -Wall -O2 03-epoll-lt-echo.c -o 03-epoll-lt-echo
// 运行：./03-epoll-lt-echo [端口]

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/epoll.h>

#define MAX_EVENTS  4096
#define BUF_SIZE    4096

static void setnonblock(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

static int init_listen_socket(int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { perror("socket"); exit(1); }

    int opt = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons((uint16_t)port);

    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind"); exit(1);
    }
    listen(fd, 128);
    setnonblock(fd);
    return fd;
}

int main(int argc, char *argv[]) {
    int port = (argc > 1) ? atoi(argv[1]) : 9999;
    int listen_fd = init_listen_socket(port);
    printf("epoll LT echo server listening on port %d\n", port);

    // --- 创建 epoll 实例 ---
    int epfd = epoll_create1(EPOLL_CLOEXEC);
    if (epfd < 0) { perror("epoll_create1"); exit(1); }

    // --- 注册 listen_fd，监控 EPOLLIN（可读）事件 ---
    struct epoll_event ev, events[MAX_EVENTS];
    ev.events = EPOLLIN;           // LT 模式（默认），fd 可读就通知
    ev.data.fd = listen_fd;
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev) < 0) {
        perror("epoll_ctl ADD listen_fd"); exit(1);
    }

    char buf[BUF_SIZE];

    while (1) {
        // --- 等待 I/O 事件，返回就绪的 fd 数量 ---
        int n = epoll_wait(epfd, events, MAX_EVENTS, -1);
        if (n < 0) {
            if (errno == EINTR) continue;
            perror("epoll_wait"); break;
        }

        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            uint32_t revents = events[i].events;

            // 处理错误和挂起状态
            if (revents & (EPOLLERR | EPOLLHUP)) {
                fprintf(stderr, "epoll error on fd=%d\n", fd);
                close(fd);
                continue;
            }

            if (revents & EPOLLIN) {
                if (fd == listen_fd) {
                    // listen_fd 可读 = 有新连接
                    while (1) {
                        struct sockaddr_in client_addr;
                        socklen_t client_len = sizeof(client_addr);
                        int conn = accept(listen_fd,
                                          (struct sockaddr *)&client_addr,
                                          &client_len);
                        if (conn < 0) break;
                        printf("[+] client connected: fd=%d from %s:%d\n",
                               conn,
                               inet_ntoa(client_addr.sin_addr),
                               ntohs(client_addr.sin_port));
                        setnonblock(conn);

                        // 注册新连接，LT 模式
                        ev.events = EPOLLIN;
                        ev.data.fd = conn;
                        if (epoll_ctl(epfd, EPOLL_CTL_ADD, conn, &ev) < 0) {
                            perror("epoll_ctl ADD conn"); close(conn);
                        }
                    }
                } else {
                    // 客户端 fd 可读，直接读取（LT 模式不需要 while 循环读完）
                    ssize_t nr = read(fd, buf, sizeof(buf));
                    if (nr > 0) {
                        printf("fd=%d read %zd bytes\n", fd, nr);
                        write(fd, buf, nr);  // echo back
                    } else if (nr == 0) {
                        printf("[-] client disconnected: fd=%d\n", fd);
                        close(fd);
                    } else {
                        if (errno != EAGAIN) {
                            perror("read"); close(fd);
                        }
                    }
                }
            }
        }
    }

    close(listen_fd);
    close(epfd);
    return 0;
}
