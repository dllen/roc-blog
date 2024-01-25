---
title: "容器不同网络模式下iptables配置"
date: 2024-01-14T11:01:38+05:30
tags: [linux, iptables, docker]
---

## 容器的网络模式

| Driver    | Description                                                              |
| --------- | ------------------------------------------------------------------------ |
| `bridge`  | The default network driver.                                              |
| `host`    | Remove network isolation between the container and the Docker host.      |
| `none`    | Completely isolate a container from the host and other containers.       |
| `overlay` | Overlay networks connect multiple Docker daemons together.               |
| `ipvlan`  | IPvlan networks provide full control over both IPv4 and IPv6 addressing. |
| `macvlan` | Assign a MAC address to a container.                                     |

## Host网络模式

```shell
# Create a new cgroup and assign it a classid
mkdir /sys/fs/cgroup/net_cls/my_cgroup
echo 0x100001 > /sys/fs/cgroup/net_cls/my_cgroup/net_cls.classid

# Run a Docker container and move its process to the newly created cgroup
docker run -d --name my_container my_image
echo $(docker inspect -f '{{.State.Pid}}' my_container) > /sys/fs/cgroup/net_cls/my_cgroup/cgroup.procs

# Use iptables to mark the packets based on the classid
iptables -t mangle -A OUTPUT -m cgroup --cgroup 0x100001 -j MARK --set-mark 1

# Use tc
# configuring tc
tc qdisc add dev eth0 root handle 10: htb
tc class add dev eth0 parent 10: classid 10:1 htb rate 40mbit
# creating traffic class 10:1
tc filter add dev eth0 parent 10: protocol ip prio 10 handle 1: cgroup
```

说明：

> **Host模式，容器与主机的网络配置没有隔离**，需要通过设置 net_cls.classid 标记流量
> 
> 参考文档：[Network classifier cgroup &mdash; The Linux Kernel documentation](https://www.kernel.org/doc/html/v5.3/admin-guide/cgroup-v1/net_cls.html)

> net_cls.classid 数据格式：0xAAAABBBB， AAAA is the major handle number and BBBB is the minor handle number，eg： 0x100001 => 10:1



## 非Host网络模式

```shell
# Get the PID of the container's network namespace
PID=$(docker inspect -f '{{.State.Pid}}' <container_name_or_id>)

# Enter the network namespace using nsenter
nsenter --net=/proc/$PID/ns/net iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080
```

说明：

> **非Host模式，容器与主机网络配置通过 [Network namespaces](https://lwn.net/Articles/580893/) 隔离**，需要切换 network namespace 进行配置

> network_namespaces手册：[network_namespaces(7) - Linux manual page](https://man7.org/linux/man-pages/man7/network_namespaces.7.html)

**namespace 执行小工具**，`nsexec.c` https://github.com/chaosblade-io/chaosblade/blob/master/nsexec.c

```c
#define _GNU_SOURCE
#include <stdio.h>
#include <unistd.h>
#include <errno.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <getopt.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/prctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>

extern char** environ;

int enter_ns(int pid, const char* type) {
#ifdef __NR_setns
    char path[64], selfpath[64];
    snprintf(path, sizeof(path), "/proc/%d/ns/%s", pid, type);
    snprintf(selfpath, sizeof(selfpath), "/proc/self/ns/%s", type);

    struct stat oldns_stat, newns_stat;
    if (stat(selfpath, &oldns_stat) == 0 && stat(path, &newns_stat) == 0) {
        // Don't try to call setns() if we're in the same namespace already
        if (oldns_stat.st_ino != newns_stat.st_ino) {
            int newns = open(path, O_RDONLY);
            if (newns < 0) {
                return -1;
            }

            // Some ancient Linux distributions do not have setns() function
            int result = syscall(__NR_setns, newns, 0);
            close(newns);
            return result < 0 ? -1 : 1;
        }
    }
#endif // __NR_setns
    return 0;
}

void sig(int signum){}

int main(int argc, char *argv[]) {

    int target = 0;
    char *cmd;

    int stop = 0;
    int opt;
    int option_index = 0;
    char *string = "st:mpuni";

    int ipcns = 0;
    int utsns = 0;
    int netns = 0;
    int pidns = 0;
    int mntns = 0;

    while((opt =getopt(argc, argv, string))!= -1) {
        switch (opt) {
            case 's':
                stop = 1;
                break;
            case 't':
                target = atoi(optarg);
                break;
            case 'm':
                mntns = 1;
                break;
            case 'p':
                pidns = 1;
                break;
            case 'u':
                utsns = 1;
                break;
            case 'n':
                netns = 1;
                break;
            case 'i':
                ipcns = 1;
                break;
            default:
                break;
        }
    }

    // check target pid
    if (target <= 0) {
        fprintf(stderr, "%s is not a valid process ID\n", target);
        return 1;
    }

    // pause
    if(stop) {
            char *pe = "pause";
            prctl(PR_SET_NAME, pe);
            signal(SIGCONT,sig);
            pause();
            char *nc = "nsexec";
            prctl(PR_SET_NAME, nc);
    }

    // enter namespace
    if(ipcns) {
        enter_ns(target, "ipc");
    }

    if(utsns) {
        enter_ns(target, "uts");
    }

    if(netns) {
        enter_ns(target, "net");
    }

    if(pidns) {
        enter_ns(target, "pid");
    }

    if(mntns) {
        enter_ns(target, "mnt");
    }

    // fork exec
    pid_t pid;
    int status;

    if((pid = fork())<0) {
        status = -1;
    } else if(pid == 0){
        // args
        int i,j=0;
        char *args[256] = {NULL};
        for(i = optind; i < argc; i++, j++) {
            args[j] = argv[i];
        }
        execvp(argv[optind], args);
        _exit(127);
    } else {
        while(waitpid(pid, &status, 0) < 0){
            if(errno != EINTR){
                status = -1;
                break;
            }
        }
        if(WIFEXITED(status)){
            exit(WEXITSTATUS(status));
        }
    }
    return 0;
}
```

```shell
# 测试

# compile
gcc nsexec.c -o nsexec

# Get the PID of the container's network namespace
PID=$(docker inspect -f '{{.State.Pid}}' <container_name_or_id>)

# exec
./nsexec -n -t PID -- /bin/sh -c 'iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 8080'

# check
./nsexec -n -t PID -- /bin/sh -c 'iptables -t nat -L'


Chain PREROUTING (policy ACCEPT)
target     prot opt source               destination
REDIRECT   tcp  --  anywhere             anywhere             tcp dpt:http redir ports 8080

Chain INPUT (policy ACCEPT)
target     prot opt source               destination

Chain POSTROUTING (policy ACCEPT)
target     prot opt source               destination

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
```
