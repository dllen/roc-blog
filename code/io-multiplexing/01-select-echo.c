// 从 select、poll、epoll 到 io_uring 系列
// 示例一：基于 select 的 echo 服务器
// 编译：gcc -Wall -O2 01-select-echo.c -o 01-select-echo
// 运行：./01-select-echo [端口]

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
#include <sys/select.h>

#define MAX_CLIENTS 1024
#define BUF_SIZE    4096

// 设置 socket 为非阻塞模式
static void setnonblock(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

// 初始化监听 socket
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
    printf("select echo server listening on port %d\n", port);

    fd_set master, read_fds;
    FD_ZERO(&master);
    FD_SET(listen_fd, &master);
    int max_fd = listen_fd;

    char buf[BUF_SIZE];

    while (1) {
        read_fds = master;  // select 会修改 read_fds，必须每次重新赋值
        int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);
        if (ready < 0) { perror("select"); break; }

        for (int fd = 0; fd <= max_fd && ready > 0; fd++) {
            if (!FD_ISSET(fd, &read_fds)) continue;
            ready--;

            if (fd == listen_fd) {
                // listen_fd 就绪，有新连接到达
                while (1) {
                    struct sockaddr_in client_addr;
                    socklen_t client_len = sizeof(client_addr);
                    int conn = accept(listen_fd,
                                      (struct sockaddr *)&client_addr,
                                      &client_len);
                    if (conn < 0) {
                        if (errno == EWOULDBLOCK || errno == EAGAIN) break;
                        perror("accept"); break;
                    }
                    printf("[+] client connected: fd=%d from %s:%d\n",
                           conn,
                           inet_ntoa(client_addr.sin_addr),
                           ntohs(client_addr.sin_port));
                    setnonblock(conn);
                    FD_SET(conn, &master);
                    if (conn > max_fd) max_fd = conn;
                }
            } else {
                // 客户端 fd 就绪，读取并 echo
                ssize_t n = read(fd, buf, sizeof(buf));
                if (n > 0) {
                    // 演示：输出接收到的字节数
                    buf[n] = '\0';
                    // 注意：buf 可能含二进制数据，这里仅打印长度
                    printf("fd=%d read %zd bytes\n", fd, n);
                    write(fd, buf, n);  // echo back
                } else if (n == 0) {
                    // 客户端关闭连接
                    printf("[-] client disconnected: fd=%d\n", fd);
                    close(fd);
                    FD_CLR(fd, &master);
                } else {
                    if (errno != EAGAIN && errno != EWOULDBLOCK) {
                        perror("read"); close(fd); FD_CLR(fd, &master);
                    }
                }
            }
        }
    }

    close(listen_fd);
    return 0;
}
