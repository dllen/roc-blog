// 从 select、poll、epoll 到 io_uring 系列
// 示例五：io_uring 异步文件读取
// 编译：gcc -Wall -O2 05-io-uring-file-read.c -o 05-io-uring-file-read -luring
// 运行：./05-io-uring-file-read <文件名>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <liburing.h>

#define SQ_DEPTH    32       // Submission Queue 深度
#define BUF_SIZE    8192

// 辅助宏：安全检查系统调用返回值
#define CHECK(call, label) do { \
    if ((call) < 0) { perror(#call); goto label; } \
} while (0)

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <file>\n", argv[0]);
        return 1;
    }
    const char *filepath = argv[1];

    // --- 初始化 io_uring 实例 ---
    struct io_uring ring;
    CHECK(io_uring_queue_init(SQ_DEPTH, &ring, 0), out);

    // --- 打开文件 ---
    int fd = open(filepath, O_RDONLY);
    if (fd < 0) { perror("open"); goto cleanup; }

    // 分配读写 buffer（io_uring 推荐使用固定 buffer）
    char *buf = malloc(BUF_SIZE);
    if (!buf) { perror("malloc"); goto cleanup_fd; }

    // --- 构造 SQE（Submission Queue Entry）---
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    if (!sqe) {
        fprintf(stderr, "SQ is full, increase SQ_DEPTH\n");
        goto cleanup_buf;
    }

    // io_uring_prep_read 设置 SQE：读取文件
    // 参数：sqe, fd, buf 指针, 长度, 文件偏移（0 表示从头开始）
    io_uring_prep_read(sqe, fd, buf, BUF_SIZE, 0);
    // user_data 会在 CQE 中返回，用于识别这个请求
    io_uring_sqe_set_data(sqe, (void *)(uintptr_t)1);

    // --- 提交请求 ---
    int ret = io_uring_submit(&ring);
    if (ret < 0) { perror("io_uring_submit"); goto cleanup_buf; }
    printf("Submitted read request, waiting for completion...\n");

    // --- 等待并收集 CQE（Completion Queue Entry）---
    struct io_uring_cqe *cqe;
    CHECK(io_uring_wait_cqe(&ring, &cqe), cleanup_buf);

    printf("Request tag=%lu ", (unsigned long)(uintptr_t)cqe->user_data);
    if (cqe->res < 0) {
        // res < 0 表示错误码（-errno）
        fprintf(stderr, "I/O error: %s\n", strerror(-cqe->res));
    } else {
        printf("read %d bytes:\n", cqe->res);
        // 安全地输出读取的内容（处理二进制数据）
        size_t len = (size_t)cqe->res;
        if (len > BUF_SIZE) len = BUF_SIZE;
        for (size_t i = 0; i < len; i++) {
            putchar(buf[i]);
        }
        if (len > 0 && buf[len-1] != '\n') putchar('\n');
    }

    // 标记 CQE 已处理
    io_uring_cqe_seen(&ring, cqe);

cleanup_buf:
    free(buf);
cleanup_fd:
    close(fd);
cleanup:
    io_uring_queue_exit(&ring);
out:
    return 0;
}
