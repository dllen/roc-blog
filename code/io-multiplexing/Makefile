# 从 select、poll、epoll 到 io_uring 系列
# Makefile：编译所有示例程序
#
# 用法：
#   make          # 编译所有示例
#   make clean    # 清理构建产物
#   make run-select  PORT=9999   # 运行 select 示例
#   make run-poll    PORT=9999
#   make run-epoll-lt PORT=9999
#   make run-epoll-et PORT=9999
#
# 依赖：
#   - gcc
#   - liburing（io_uring 示例需要）
#     Ubuntu/Debian: apt install liburing-dev
#     macOS: 不支持 io_uring（Linux only），可跳过 io_uring 相关示例

CC       = gcc
CFLAGS   = -Wall -O2 -std=c11
LDFLAGS  =
IORING_LIBS = -luring

TARGETS  = 01-select-echo \
           02-poll-echo \
           03-epoll-lt-echo \
           04-epoll-et-echo \
           05-io-uring-file-read \
           06-io-uring-echo

.PHONY: all clean run-select run-poll run-epoll-lt run-epoll-et run-io-uring

all: $(TARGETS)

01-select-echo: 01-select-echo.c
	$(CC) $(CFLAGS) $< -o $@

02-poll-echo: 02-poll-echo.c
	$(CC) $(CFLAGS) $< -o $@

03-epoll-lt-echo: 03-epoll-lt-echo.c
	$(CC) $(CFLAGS) $< -o $@

04-epoll-et-echo: 04-epoll-et-echo.c
	$(CC) $(CFLAGS) $< -o $@

05-io-uring-file-read: 05-io-uring-file-read.c
	$(CC) $(CFLAGS) $< -o $@ $(IORING_LIBS)

06-io-uring-echo: 06-io-uring-echo.c
	$(CC) $(CFLAGS) $< -o $@ $(IORING_LIBS)

clean:
	rm -f $(TARGETS)

# 运行示例（PORT 可通过环境变量覆盖）
PORT ?= 9999

run-select: 01-select-echo
	./01-select-echo $(PORT)

run-poll: 02-poll-echo
	./02-poll-echo $(PORT)

run-epoll-lt: 03-epoll-lt-echo
	./03-epoll-lt-echo $(PORT)

run-epoll-et: 04-epoll-et-echo
	./04-epoll-et-echo $(PORT)

run-io-uring: 06-io-uring-echo
	./06-io-uring-echo $(PORT)
