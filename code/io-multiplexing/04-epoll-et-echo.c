// 从 select、poll、epoll 到 io_uring 系列
// 示例四：基于 epoll ET（边缘触发）模式的 echo 服务器
// 编译：gcc -Wall -O2 04-epoll-et-echo.c -o 04-epoll-et-echo
// 运行：./04-epoll-et-echo [端口]
//
// ET 模式下，I/O 事件只通知一次，应用程序必须一次性将数据读完
//（使用非阻塞 read + while 循环），否则剩余数据会被"饿死"。

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

// 在 ET 模式下读取 socket 的标准写法
// 返回值：>0 成功读取并已写入 echo；=0 对端关闭；<0 错误
static int handle_client_read(int fd) {
    char buf[BUF_SIZE];
    ssize_t total = 0;

    // ET 模式必须用 while 循环把数据全部读完
    while (1) {
        ssize_t n = read(fd, buf, sizeof(buf));
        if (n > 0) {
            total += n;
            // echo back（实际生产中应放入用户态 buffer，等 readable 结束后再发送）
            ssize_t written = 0;
            while (written < n) {
                ssize_t w = write(fd, buf + written, n - written);
                if (w < 0) {
                    if (errno == EAGAIN || errno == EWOULDBLOCK) {
                        // 发送 buffer 满，稍后重试
                        continue;
                    }
                    perror("write"); return -1;
                }
                written += w;
            }
        } else if (n == 0) {
            // 对端关闭连接
            return 0;
        } else {
            // n < 0
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 数据全部读完（socket receive buffer 为空）
                break;
            }
            perror("read"); return -1;
        }
    }

    if (total > 0) {
        printf("fd=%d total read+echo %zd bytes\n", fd, total);
    }
    return (int)total;
}

int main(int argc, char *argv[]) {
    int port = (argc > 1) ? atoi(argv[1]) : 9999;
    int listen_fd = init_listen_socket(port);
    printf("epoll ET echo server listening on port %d\n", port);

    int epfd = epoll_create1(EPOLL_CLOEXEC);
    if (epfd < 0) { perror("epoll_create1"); exit(1); }

    struct epoll_event ev, events[MAX_EVENTS];
    ev.events = EPOLLIN | EPOLLET;  // 关键：ET 模式
    ev.data.fd = listen_fd;
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev) < 0) {
        perror("epoll_ctl ADD listen_fd"); exit(1);
    }

    while (1) {
        int n = epoll_wait(epfd, events, MAX_EVENTS, -1);
        if (n < 0) {
            if (errno == EINTR) continue;
            perror("epoll_wait"); break;
        }

        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            uint32_t revents = events[i].events;

            if (revents & (EPOLLERR | EPOLLHUP)) {
                fprintf(stderr, "epoll error on fd=%d\n", fd);
                close(fd);
                continue;
            }

            if (revents & EPOLLIN) {
                if (fd == listen_fd) {
                    // ET 模式 accept 也必须用 while 循环处理所有新连接
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

                        ev.events = EPOLLIN | EPOLLET;  // ET 模式
                        ev.data.fd = conn;
                        if (epoll_ctl(epfd, EPOLL_CTL_ADD, conn, &ev) < 0) {
                            perror("epoll_ctl ADD conn"); close(conn);
                        }
                    }
                } else {
                    // ET 模式下，read 不到 EAGAIN 才算读完
                    if (handle_client_read(fd) == 0) {
                        // 对端关闭，移除监控
                        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                        close(fd);
                    }
                }
            }
        }
    }

    close(listen_fd);
    close(epfd);
    return 0;
}
