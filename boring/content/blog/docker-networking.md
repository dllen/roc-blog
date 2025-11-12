---
title: "Docker 网络模式"
date: 2024-01-21T12:13:30+05:30
update_date: 2024-01-21T12:13:30+05:30
tags: [Docker]
---

Docker 包括一个网络系统，用于管理容器、 Docker 主机和外部世界之间的通信。支持几种不同的网络类型，支持不同的使用场景。

## Docker网络类型

通过网络配置容器可以与其他容器和外部服务进行通信。

容器必须连接到 Docker 网络才能接收任何网络连接。

容器可用的通信路由取决于它的网络配置。

Docker 带有[五个内置的网络驱动程序]([Networking overview | Docker Docs](https://docs.docker.com/network))，它们实现了核心的网络功能:

- bridge

- host

- overlay

- ipvlan

- macvlan

**bridge**

[bridge网络]([Bridge network driver | Docker Docs](https://docs.docker.com/network/drivers/bridge/))在主机和容器之间创建一个基于软件的桥接。

连接到网络的容器可以相互通信，但是它们与网络外的容器是隔离的。

网络中的每个容器都被分配了自己的 IP 地址。

因为网络是桥接到主机的，所以容器也能够在局域网和因特网上进行通信。

但是，它们不会以物理设备的形式出现在LAN上。

**host**

使用[host网络]([Host network driver | Docker Docs](https://docs.docker.com/network/host))的容器共享主机的网络堆栈，而没有任何隔离。

它们没有分配自己的 IP 地址，端口绑定将直接发布到主机的网络接口。

这意味着侦听端口80的容器进程将绑定到 `<host_ip>:80`。

**overlay**

[overlay网络]([Overlay network driver | Docker Docs](https://docs.docker.com/network/overlay))是跨多个 Docker 主机的分布式网络。

网络允许运行在任何主机上的所有容器彼此通信，而不需要 OS 级路由支持。

overlay网络实现了[DockerSwarm]([Swarm mode overview | Docker Docs](https://docs.docker.com/engine/swarm))集群的网络，但是运行两个独立的 Docker Engine 实例时，两个实例的容器必须直接相互通信，也可以使用它们。

这允许您构建自己的类似于 Swarm 的环境。

**ipvlan**

[ipvlan]([IPvlan network driver | Docker Docs](https://docs.docker.com/network/ipvlan)) 是一个先进的驱动程序，提供了对分配给您的容器的 IPv4 和 IPv6地址的精确控制，以及第2层和第3层 VLAN 标记和路由。

将容器化服务与现有物理网络集成时，此驱动程序非常有用。

ipvlan 网络被分配了它们自己的网络接口，这比基于桥接的网络提供了性能优势。

**macvlan**

[macvlan]([Macvlan network driver | Docker Docs](https://docs.docker.com/network/macvlan/)) 是另一个高级选项，它允许容器以物理设备的形式出现在网络上。

它的工作原理是为网络中的每个容器分配一个唯一的 MAC 地址。

这种网络类型要求将主机的一个物理接口专用于虚拟网络。

更广泛的网络还必须进行恰当的配置，以支持Docker主机创建的大量MAC地址。

### 怎么选择使用那种网络类型？

**bridge网络**，对于大多数场景是最合适的选择。网络中的容器可以使用它们自己的IP地址和DNS名称彼此通信。他们也可以访问主机的网络，所以他们可以达到互联网和局域网。

**host网络**，将服务端口直接绑定到主机接口并且不关心网络隔离时，host网络是最佳选择。这种网络模式允许容器化应用程序的服务像直接在主机上运行的网络服务。

**overlay网络**，不同Docker主机上的容器需要彼此直接通信时，需要使用overlay网络。使用pverlay网络可以让你为高可用性建立自己的分布式环境。

**macvlan**，在容器必须作为主机网络上的物理设备出现的情况下，比如当容器运行监视网络流量的应用程序时，macvlan网络非常有用。

**ipvlan网络**，当对容器IP地址、标签和路由有特定要求时，ipvlan网络是一种高级选择。

Docker还支持[第三方网络插件]([Plugins and Services | Docker Docs](https://docs.docker.com/engine/extend/plugins_services))，这些插件使用其他操作模式扩展网络系统。其中包括使用 [OpenStack Neutron](https://docs.openstack.org/neutron/latest/)实现网络的[Kuryr]([GitHub - openstack/kuryr: Bridge between container framework networking and storage models to OpenStack networking and storage abstractions. Mirror of code maintained at opendev.org.](https://github.com/openstack/kuryr))，以及着重于服务发现、安全和容错的覆盖网络 [Weave](https://www.weave.works/docs/net/latest/introducing-weave)。

> NOTE：Docker 网络在容器级别始终是可选的: 
> 
> 容器的网络设置为none将完全禁用其网络堆栈。
> 
> 容器将无法与其他容器通信、主机的服务、互联网。
> 
> 这有助于通过沙箱化不需要连接的应用程序来提高安全性。

## 

## Docker网络怎么工作的？

Docker使用主机的网络栈来实现容器的网络系统。

它通过配置[iptables]([Packet filtering and firewalls | Docker Docs](https://docs.docker.com/network/iptables))规则将流量路由到容器来工作。

这也提供了Docker网络和主机之间的隔离。

[iptables]([iptables(8) - Linux man page](https://linux.die.net/man/8/iptables)) 是标准的Linux包过滤工具。添加到`iptables`规则定义流量通过主机网络栈时如何路由。Docker 网络添加过滤规则，将匹配的流量指向容器的应用程序。规则是自动配置的，所以不需要手动配置`iptables`。

Docker容器被分配它们自己的**[网络命名空间]([network_namespaces(7) - Linux manual page](https://man7.org/linux/man-pages/man7/network_namespaces.7.html))**，这是一个 Linux 内核特性，它提供了独立的虚拟网络环境。

容器还在主机上创建虚拟网络接口，允许它们在其名称空间之外使用主机网络进行通信。

实现Docker网络的细节是非常复杂，需要了解许多操作系统内核。

Docker将它们从最终用户抽象出来，提供 简单、易用、可靠 容器网络配置流程。

在[Docker的文档中]([Packet filtering and firewalls | Docker Docs](https://docs.docker.com/network/iptables))可以查看更多信息。

### Docker网络与VM网络的区别

Docker的网络模型为容器提供了隔离的虚拟环境。这些网络配置满足日常使用，但与传统虚拟机创建的虚拟网络相比，有一些关键的区别。

Docker 使用 命名空间 和 iptables 规则实现网络隔离，而VM通常为每台虚拟机运行单独的网络堆栈。

术语上的差异也可能导致混淆: Docker所称的“桥接”网络类似于大多数VM解决方案中基于[NAT]([Network address translation - Wikipedia](https://en.wikipedia.org/wiki/Network_address_translation))的网络。

通常，VM可以支持比Docker本身允许的范围更广的网络拓扑。然而，Docker 包含了创建所需网络解决方案的所有工具，无论是通过使用 macvlan 分配物理网络上的容器地址，还是通过使用第三方插件实现缺失的网络模型。

## Docker网络实验

### 创建网络

创建Docker网络，请使用 `docker network create` 命令，[文档]([docker network create | Docker Docs](https://docs.docker.com/engine/reference/commandline/network_create))。

可以通过设置-d 标志来指定要使用的驱动程序，例如host或bridge。

如果省略该标志，则将创建bridge网络。

执行以下命令：

```bash
docker network create demo-network -d bridge

docker network ls

NETWORK ID    NAME          VERSION     PLUGINS
e2f4e124c378  demo-network  0.4.0       bridge,portmap,firewall,tuning
```

```bash
docker network inspect demo-network


[
     {
          "name": "demo-network",
          "id": "e2f4e124c378ec1c52a632ca3f64a7cd92a589d10380ad4fdae5cdd842592370",
          "driver": "bridge",
          "network_interface": "cni-podman2",
          "created": "2024-01-21T16:06:51.737081357+08:00",
          "subnets": [
               {
                    "subnet": "10.89.1.0/24",
                    "gateway": "10.89.1.1"
               }
          ],
          "ipv6_enabled": false,
          "internal": false,
          "dns_enabled": false,
          "ipam_options": {
               "driver": "host-local"
          }
     }
]
```



通过 `docker network ls` 和 `docker network inspect demo-network` 查看网络配置。新的网络配置目前没有用，因为没有容器被连接。



### 连接容器和网络

通过使用 `docker run` 命令设置 `--network` 标志，可以将新容器附加到网络。

执行以下命令:

```bash
# 创建桥接网络
docker network create --driver bridge alpine-net

# 创建 alpine1
docker run -dit --name alpine1 --network alpine-net alpine ash

# 创建 alpine2
docker run -dit --name alpine2 --network alpine-net alpine ash

# 创建 alpine3
docker run -dit --name alpine3 alpine ash


```

现在尝试使用这两个容器的名称在它们之间进行通信:

> 备注：如果通过 container name 不能被解析，可以手工添加hosts或者直接使用容器IP通信；

```bash
docker container attach alpine1

# in alpine1
/ # ping -c 2 alpine2
```

```bash

docker container attach alpine1

# in alpine1
/ # ping -c 2 alpine3
ping: bad address 'alpine3'
```



这些容器还不在同一个网络中，因此它们不能直接相互通信。

将`container2`连接到网络:

```bash
docker network connect alpine-net alpine3
```

这些容器现在共享一个网络，使它们能够彼此通信:



```bash

docker container attach alpine1

# in alpine1
/ # ping -c 2 alpine3
PING container2 (172.22.0.3): 56 data bytes
64 bytes from 172.22.0.3: seq=0 ttl=64 time=4.205 ms
```





### 使用Host模式网络



桥接网络是常用的连接容器的方式。

再探讨一下主机网络的功能，其中容器直接连接到主机的网络接口。

执行下面命令：

```bash
docker run -d --name nginx --network host nginx:latest
```



NGINX默认侦听端口80。因为容器使用的是主机网络，所以可以访问主机本地主机上的 NGINX服务器: 80，即使没有显式绑定端口:

```bash
curl localhost:80
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
```



### 使用None模式网络

使用none配置容器网络时，容器将没有可用的连接——无论是到其他容器，还是到其他网络。通过将容器网络配置为`none`禁用网络:

```bash
docker run -it --rm --network none busybox:latest
/ # ping baidu.com
ping: bad address 'baidu.com'
```

这样可以轻松地对未知服务进行沙箱处理。



### 从网络配置中删除容器

Docker允许在不重新启动容器的情况下自由地管理网络连接。

在上一节中，了解了如何在容器创建后连接容器; 

还可以从不再需要的网络中删除容器:

```bash
docker network disconnect demo-network container2
```

这些变更不需要重启会立即生效；



### 管理容器的网络配置

**列出网络配置**

```bash
docker network ls
```

**删除网络配置**

```
docker network rm demo-network
```

**删除没有使用的网络配置**

```bash
docker network prune
```



### 使用Docker Compose配置容器网络

[docker compose]([Docker Compose overview | Docker Docs](https://docs.docker.com/compose/))



可以使用带有 Docker Compose 服务的网络。

使用 Docker Compose 时，通常可以避免手动网络配置，因为Docker Compose中配置的服务会自动添加到共享网桥网络中:



创建 `docker-compose.yaml`

```yaml
version: "3"
services:
  app:
    image: php:7.2-apache
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD=changeme
```



使用 docker compose 部署服务：

```
docker compose up -d
```

如下面的输出所示，Docker Compose 已经为相关服务创建了一个包含两个容器的网络:

```
docker network ls
NETWORK ID     NAME                                        DRIVER    SCOPE
44edcc537a6f   bridge                                      bridge    local
4d60b27f787a   host                                        host      local
358610a7ea97   introduction-to-docker-networking_default   bridge    local
288376a0a4f8   none                                        null      local
```

应用程序容器可以直接与关联的mysql数据库容器通信:



```
docker compose exec -it app bash
root@d7c97936ad48:/var/www/html# apt update && apt install iputils-ping -y
root@d7c97936ad48:/var/www/html# ping mysql
PING mysql (172.23.0.3) 56(84) bytes of data.
64 bytes from introduction-to-docker-networking-mysql-1.introduction-to-docker-networking_default (172.23.0.3): icmp_seq=1 ttl=64 time=0.493 ms
```



**其他网络配置**

可以在 Docker Compose 文件中定义其他网络。

在最外层添加 `networks` 字段，然后通过`networks`中配置网络来连接服务:

```
version: "3"
services:
  app:
    image: php:7.2-apache
    networks:
      - db
  helper:
    image: custom-image:latest
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD=changeme
    networks:
      - db
networks:
  db:
```



这个示例重写默认网络配置。现在，只有app服务可以与mysql通信。helper服务无法到达数据库，因为这两个服务不共享网络。



[Docker Compose - What is It, Example &amp; Tutorial](https://spacelift.io/blog/docker-compose)



## 总结



Docker的网络为容器与其他容器、宿主机之间的通信提供了灵活的选择。

网络中的容器能够通过名称或 IP 地址相互联系。

网络是由一组可插拔的驱动程序实现的，这些驱动程序可以适用与常见的使用场景。

网络依赖于主机的网络栈，但是使用命名空间进行隔离。

这种分离比虚拟机使用的虚拟网络模型要弱，尽管在将容器连接到 macvlan 网络时，它们仍然可以作为物理网络设备出现。



### 参考文档

- [Networking with standalone containers | Docker Docs](https://docs.docker.com/network/network-tutorial-standalone/)

- https://github.com/containers/podman/blob/main/docs/tutorials/basic_networking.md

- https://docs.podman.io/en/latest/markdown/podman-network-create.1.html

- [Networking overview | Docker Docs](https://docs.docker.com/network/)

- https://medium.com/@prajwal.chin/understanding-docker-dns-2ed4b070a0

- [docker网络模式 · Docker -- 从入门到实战](http://docker.baoshu.red/network/mode.html)
