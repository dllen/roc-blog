// 从 select、poll、epoll 到 io_uring 系列
// 示例二：基于 poll 的 echo 服务器
// 编译：gcc -Wall -O2 02-poll-echo.c -o 02-poll-echo
// 运行：./02-poll-echo [端口]

#include <stdio.h>
#include <fcntl.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <poll.h>

#define MAX_FDS     8192
#define BUF_SIZE    4096
#define POLL_SIZE   256   // 初始 pollfd 数组容量

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

// 扩展 pollfd 数组
static struct pollfd* grow_pollfds(struct pollfd *fds, int *capacity, int *count) {
    *capacity *= 2;
    fds = realloc(fds, (*capacity) * sizeof(struct pollfd));
    if (!fds) { perror("realloc"); exit(1); }
    return fds;
}

int main(int argc, char *argv[]) {
    int port = (argc > 1) ? atoi(argv[1]) : 9999;
    int listen_fd = init_listen_socket(port);
    printf("poll echo server listening on port %d\n", port);

    int capacity = POLL_SIZE;
    int nfds = 1;  // 当前有效条目数（含 listen_fd）
    struct pollfd *fds = calloc(capacity, sizeof(struct pollfd));
    if (!fds) { perror("calloc"); exit(1); }

    fds[0].fd = listen_fd;
    fds[0].events = POLLIN;
    fds[0].revents = 0;

    char buf[BUF_SIZE];

    while (1) {
        int ready = poll(fds, nfds, -1);  // 阻塞等待
        if (ready < 0) { perror("poll"); break; }

        // 先处理 listen_fd
        if (fds[0].revents & (POLLIN | POLLERR)) {
            ready--;
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

                if (nfds >= capacity) {
                    fds = grow_pollfds(fds, &capacity, &nfds);
                }
                fds[nfds].fd = conn;
                fds[nfds].events = POLLIN;
                fds[nfds].revents = 0;
                nfds++;
            }
            fds[0].revents = 0;  // 清除 listen_fd 的 revents
        }

        // 处理客户端连接
        for (int i = 1; i < nfds && ready > 0; i++) {
            if (!(fds[i].revents & (POLLIN | POLLHUP | POLLERR))) continue;
            ready--;

            int fd = fds[i].fd;
            ssize_t n = read(fd, buf, sizeof(buf));

            if (n > 0) {
                printf("fd=%d read %zd bytes\n", fd, n);
                write(fd, buf, n);  // echo back
                fds[i].revents = 0;
            } else {
                // 客户端关闭或出错，移除该 fd
                printf("[-] client disconnected: fd=%d (n=%zd)\n", fd, n);
                close(fd);

                // 用最后一个有效条目覆盖当前位置（O(1) 删除）
                if (i != nfds - 1) {
                    fds[i] = fds[nfds - 1];
                }
                nfds--;
                i--;  // 重新检查当前位置
            }
        }
    }

    // 清理
    for (int i = 0; i < nfds; i++) close(fds[i].fd);
    free(fds);
    close(listen_fd);
    return 0;
}
