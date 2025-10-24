---
title: "Linux CGroups and Namespaces"
date: 2024-01-11T22:01:58+05:30
description: "Namespaces 用来做资源隔离，CGroups 用来做资源限制，Namespaces、CGroups、Chroot 是 Docker 核心基础技术。"
tags: [docker, container]

---

Namespaces 用来做进程间资源隔离，Namespaces 中进程使用的资源对其他进程不可见（包括 进程ID、Hostnames、用户ID、文件、网络 等内核资源）。

Cgroup 用来做资源限制，包括 CPU、内存、网络、磁盘 等系统资源；

Namespaces和 Cgroup 是Linux 容器技术的基石。

如果进程更改了特定Namespaces下的全局资源(如 PID) ，则只有同一Namespaces中的进程才能看到此更改。(不管初始化进程是什么，都可以用 PID 1启动进程)

以下是Linux内核中的几种Namespaces类型:

**User Namespace**

给予进程的独立用户和组ID。进程可以在其命名空间中升级到Root用户。

User Namespace是嵌套的。所有User Namespace都有一个父User Namespace (Root User Namespace除外) ，并且有零个或多个子 User Namespace。

**PID Namespace**

PID Namespace 用来隔离进程 ID。不同 PID Namespace 下的不同进程可以具有相同的进程 ID。PID Namespace 的第一个进程采用 PID 1，随后的进程ID 按顺序生成。

**Network Namespace**

Network Namespace 用于隔离网络。Network Namespace 中的进程可以独立于其他Network Namespace使用自定义/特定的路由表、 IP 地址、网络设备和其他网络资源。

*备注：我们可以使用使用网络命名空间的 `ip netns` 命令来创建虚拟网络设备*

**Mount Namespace**

不影响主机文件系统，为命名空间下的进程挂载文件系统。

**IPC Namespace**

IPC Namespace下的进程可以以独立的方式使用 IPC 资源。例如消息队列、共享内存和 SystemVIPC 对象。

**UNIX Time Sharing(UTS) Namespace**

UNIX Time Sharing(UTS) Namespace 下的进程似乎在不同的机器上运行 (隔离主机名，不同的主机名)。

**Control Group (cgroup)**

使用 cgroup，可以限制 Namespace 下进程的资源，如 CPU、内存、磁盘等。

**Time Namespace**

Time Namespace下的进程可以有不同的系统时间。

**Example with `unshare`**

可以使用 unshare 命令在 namespace 中执行进程。

```
Usage:
 unshare [options] [<program> [<argument>...]]

Run a program with some namespaces unshared from the parent.

Options:
 -m, --mount[=<file>]      unshare mounts namespace
 -u, --uts[=<file>]        unshare UTS namespace (hostname etc)
 -i, --ipc[=<file>]        unshare System V IPC namespace
 -n, --net[=<file>]        unshare network namespace
 -p, --pid[=<file>]        unshare pid namespace
 -U, --user[=<file>]       unshare user namespace
 -C, --cgroup[=<file>]     unshare cgroup namespace
 -f, --fork                fork before launching <program>
     --kill-child[=<signame>]  when dying, kill the forked child (implies --fork); defaults to SIGKILL
     --mount-proc[=<dir>]  mount proc filesystem first (implies --mount)
 -r, --map-root-user       map current user to root (implies --user)
     --propagation slave|shared|private|unchanged
                           modify mount propagation in mount namespace
 -s, --setgroups allow|deny  control the setgroups syscall in user namespaces

 -h, --help                display this help
 -V, --version             display version
```

`unshare --user --pid --map-root-user --mount-proc --fork bash`

```
--user: 创建user namespace
--pid: 不从父进程继承pid命名空间，在子进程内执行ps，无法看到父进程原有的进程
--map-root-user:  namespace 中支持 root 权限
--mount-proc: 确保创建了 PID 和 Mount namespace 后，自动挂载 /proc 文件系统，无需我们手动执行 `mount -t proc proc /proc` 命令
--fork: 执行unshare的进程fork一个新的子进程，在子进程里执行unshare传入的参数
```

> 使用 `--mount-proc`，可以隔离宿主机 `/proc` 文件系统，使用独立的进程ID；
> 可以通过 `lsns` 命令列出 namespaces；

**Control Groups**

通过Control Groups，CPU、磁盘、网络、内存和其他系统资源都可以受到限制。我们可以使用 cgroup 创建资源限制配置。

- 优先级: 我们可以使用 cgroup 对名称空间中的进程进行优先排序。
- 统计和监控: 可以在 cgroup 级别进行监控和统计资源。
- 管理：同一 cgroup 下的进程可以由单个命令管理。

CGroup 工具：

Debian `sudo apt install cgroup-tools`

Centos `sudo yum install libcgroup` `sudo yum install libcgroup-tools`

**示例**

```bash
# 创建 memory cgroup
sudo cgcreate -g memory:test-memory-limiter
ls -la /sys/fs/cgroup/memory/test-memory-limiter/

# 限制内存
sudo cgset -r memory.limit_in_bytes=50M my-memory-limiter
cat /sys/fs/cgroup/memory/test-memory-limiter/memory.limit_in_bytes

# 编译测试程序
# gcc high_mem.c -o high_mem.c

# 执行内存限制进程
# sudo cgexec -g memory:test-memory-limiter ./high_mem

# namespace 下执行内存限制进程
sudo cgexec -g memory:test-memory-limiter unshare -fp - mount-proc /bin/bash
```

`high_mem.c` 代码

```
int main()
{
        while(1)
        {
                void *m = malloc(1024*1024);
                memset(m,0,1024*1024);
        }
        return 0;
}
```

> 可以通过 `systemd-cgtop`  查看 `cgroup` 资源使用情况；

**参考文档**

* [What Are Namespaces and cgroups, and How Do They Work?](https://www.nginx.com/blog/what-are-namespaces-cgroups-how-do-they-work/)
* [Resource Management Guide](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/7/html/resource_management_guide/index)
* [Understanding Linux Namespaces](https://theboreddev.com/understanding-linux-namespaces/)
* [Wiki Linux namespaces](https://en.wikipedia.org/wiki/Linux_namespaces)
* [namespaces(7) — Linux manual page](https://man7.org/linux/man-pages/man7/namespaces.7.html)
* [The Power of Linux Cgroups: How Containers Take Control of Their Resources](https://towardsdatascience.com/the-power-of-linux-cgroups-how-containers-take-control-of-their-resources-ba564fef13b0)
