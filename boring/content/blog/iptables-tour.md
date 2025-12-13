---
title: "iptables相关资料收集和整理"
date: 2024-01-27T12:13:35+05:30
update_date: 2024-01-27T12:13:35+05:30
description: "netfilter/iptables（简称为iptables）组成Linux平台下的包过滤防火墙，与大多数的Linux软件一样，这个包过滤防火墙是免费的，它可以代替昂贵的商业防火墙解决方案，完成封包过滤、封包重定向和网络地址转换（NAT）等功能"
tag: [linux, iptables]
---

## iptables 规则表和链

### iptables介绍

    netfilter/iptables（简称为iptables）组成Linux平台下的包过滤防火墙，与大多数的Linux软件一样，这个包过滤防火墙是免费的，它可以代替昂贵的商业防火墙解决方案，完成封包过滤、封包重定向和网络地址转换（NAT）等功能。

    规则（rules）其实就是网络管理员预定义的条件，规则一般的定义为“如果数据包头符合这样的条件，就这样处理这个数据包”。规则存储在内核空间的信息 包过滤表中，这些规则分别指定了源地址、目的地址、传输协议（如TCP、UDP、ICMP）和服务类型（如HTTP、FTP和SMTP）等。当数据包与规 则匹配时，iptables就根据规则所定义的方法来处理这些数据包，如放行（accept）、拒绝（reject）和丢弃（drop）等。配置防火墙的 主要工作就是添加、修改和删除这些规则。

    Iptables和netfilter的关系是一个很容易让人搞不清的问题。很多的知道iptables却不知道netfilter。其实iptables只是Linux防火墙的管理工具而已，位于/sbin/iptables。真正实现防火墙功能的是netfilter，它是Linux内核中实现包过滤的内部结构。

### iptables传输数据包的过程

1. 当一个数据包进入网卡时，它首先进入PREROUTING链，内核根据数据包目的IP判断是否需要转送出去。

2. 如果数据包就是进入本机的，它就会沿着图向下移动，到达INPUT链。数据包到了INPUT链后，任何进程都会收到它。本机上运行的程序可以发送数据包，这些数据包会经过OUTPUT链，然后到达POSTROUTING链输出。

3. 如果数据包是要转发出去的，且内核允许转发，数据包就会如图所示向右移动，经过FORWARD链，然后到达POSTROUTING链输出。

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/az6bh6fzc9.webp)





### iptables规则表和链

表（tables）提供特定的功能，iptables内置了4个表，即filter表、nat表、mangle表和raw表，分别用于实现包过滤，网络地址转换、包重构(修改)和数据跟踪处理。

链（chains）是数据包传播的路径，每一条链其实就是众多规则中的一个检查清单，每一条链中可以有一 条或数条规则。当一个数据包到达一个链时，iptables就会从链中第一条规则开始检查，看该数据包是否满足规则所定义的条件。如果满足，系统就会根据 该条规则所定义的方法处理该数据包；否则iptables将继续检查下一条规则，如果该数据包不符合链中任一条规则，iptables就会根据该链预先定 义的默认策略来处理数据包。

Iptables采用“表”和“链”的分层结构。在REHL4中是三张表五个链。现在REHL5成了四张表五个链了，不过多出来的那个表用的也不太多，所以基本还是和以前一样。下面罗列一下这四张表和五个链。注意一定要明白这些表和链的关系及作用。

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/fjqpcju771.webp)



#### 规则表

1. Filter 表：（作用链：INPUT、FORWARD、OUTPUT）用于过滤数据包，内核模块 [net/ipv4/netfilter/iptable_filter.c](https://gitee.com/mirrors/linux_old1/blob/master/net/ipv4/netfilter/iptable_filter.c)；

2. Nat 表：（作用链：PREROUTING、POSTROUTING、OUTPUT）用于网络地址转换（IP、端口），内核模块 [net/ipv4/netfilter/iptable_nat.c](https://gitee.com/mirrors/linux_old1/blob/master/net/ipv4/netfilter/iptable_nat.c)；

3. Mangle 表：（作用链：PREROUTING、POSTROUTING、INPUT、OUTPUT、FORWARD , 即作用于全部链），修改数据包的服务类型、TTL、并且可以配置路由实现QOS内核模块，内核模块 [net/ipv4/netfilter/iptable_mangle.c](https://gitee.com/mirrors/linux_old1/blob/master/net/ipv4/netfilter/iptable_mangle.c)；

4. Raw 表：（作用链：OUTPUT、PREROUTING），决定数据包是否被状态跟踪机制处理，内核模块：[net/ipv4/netfilter/iptable_raw.c](https://gitee.com/mirrors/linux_old1/blob/master/net/ipv4/netfilter/iptable_raw.c)



> Raw表REHL4没有，常用的是Filter/Nat；



#### 规则链

1. INPUT：进来的数据包应用此规则链中的策略

2. OUTPUT：外出的数据包应用此规则链中的策略

3. FORWARD：转发数据包时应用此规则链中的策略

4. PREROUTING：对数据包作路由选择前应用此链中的策略，**所有的数据包进来的时侯都先由这个链处理**

5. POSTROUTING：对数据包作路由选择后应用此链中的策略，**所有的数据包出来的时侯都先由这个链处理**



规则链顺序：Raw --> Mangle --> Nat --> Filter

**入站数据流向：**

    从外界到达防火墙的数据包，先被PREROUTING规则链处理（是否修改数据包地址等），之后会进行路由选择（判断该数据包应该发往何处），如果数据包的目标主机是防火墙本机（比如说Internet用户访问防火墙主机中的web服务器的数据包），那么内核将其传给INPUT链进行处理（决定是否允许通过等），通过以后再交给系统上层的应用程序（比如Apache服务器）进行响应。

**转发数据流方向：**

    来自外界的数据包到达防火墙后，首先被PREROUTING规则链处理，之后会进行路由选择，如果数据包的目标地址是其它外部地址（比如局域网用户通过网关访问QQ站点的数据包），则内核将其传递给FORWARD链进行处理（是否转发或拦截），然后再交给POSTROUTING规则链（是否修改数据包的地址等）进行处理。

**出站数据流向：**

    防火墙本机向外部地址发送的数据包（比如在防火墙主机中测试公网DNS服务器时），首先被OUTPUT规则链处理，之后进行路由选择，然后传递给POSTROUTING规则链（是否修改数据包的地址等）进行处理。



#### 管理和设置iptables规则

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/7lir5ujikd.webp)

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/zvozz5swl1.webp)



**iptables的基本用法：**`iptables [-t 表名] 命令选项 ［链名］ ［条件匹配］ ［-j 目标动作或跳转］`

> 表名、链名用于指定iptables命令所操作的表和链，命令选项用于指定管理iptables规则的方式（比如：插入、增加、删除、查看等；条件匹配用于指定对符合什么样 条件的数据包进行处理；目标动作或跳转用于指定数据包的处理方式（比如允许通过、拒绝、丢弃、跳转（Jump）给其它链处理。
> 
> ---
> 
> **命令选项：**
> 
> -A 在指定链的末尾添加（append）一条新的规则
> 
> -D 删除（delete）指定链中的某一条规则，可以按规则序号和内容删除
> 
> -I 在指定链中插入（insert）一条新的规则，默认在第一行添加
> 
> -R 修改、替换（replace）指定链中的某一条规则，可以按规则序号和内容替换
> 
> -L 列出（list）指定链中所有的规则进行查看
> 
> -E 重命名用户定义的链，不改变链本身
> 
> -F 清空（flush）
> 
> -N 新建（new-chain）一条用户自己定义的规则链
> 
> -X 删除指定表中用户自定义的规则链（delete-chain）
> 
> -P 设置指定链的默认策略（policy）
> 
> -Z 将所有表的所有链的字节和数据包计数器清零
> 
> -n 使用数字形式（numeric）显示输出结果
> 
> -v 查看规则表详细信息（verbose）的信息
> 
> -V 查看版本(version)
> 
> -h 获取帮助（help）
> 
> ---
> 
> **数据包处理方式：**
> 
> ACCEPT 允许数据包通过
> 
> DROP 直接丢弃数据包，不给任何回应信息
> 
> REJECT 拒绝数据包通过，必要时会给数据发送端一个响应的信息
> 
> LOG在/var/log/messages文件中记录日志信息，然后将数据包传递给下一条规则
> 
> ---
> 
> **iptables防火墙规则的保存和恢复：**
> 
> iptables-save把规则保存到文件中，再由目录rc.d下的脚本（/etc/rc.d/init.d/iptables）自动装载
> 
> 使用命令iptables-save来保存规则。一般用
> 
> `iptables-save > /etc/sysconfig/iptables`
> 
> 生成保存规则的文件 `/etc/sysconfig/iptables`，
> 
> 也可以用
> 
> `service iptables save`
> 
> 它能把规则自动保存在`/etc/sysconfig/iptables`中。
> 
> 当计算机启动时，rc.d下的脚本将用命令iptables-restore调用这个文件，从而就自动恢复了规则



#### 常见实用案例

```bash

# 删除INPUT链的第一条规则
iptables -D INPUT 1

# iptables防火墙常用的策略
1.拒绝进入防火墙的所有ICMP协议数据包
iptables -I INPUT -p icmp -j REJECT


2.允许防火墙转发除ICMP协议以外的所有数据包
iptables -A FORWARD -p ! icmp -j ACCEPT
说明：使用“！”可以将条件取反。


3.拒绝转发来自192.168.1.10主机的数据，允许转发来自192.168.0.0/24网段的数据
iptables -A FORWARD -s 192.168.1.11 -j REJECT
iptables -A FORWARD -s 192.168.0.0/24 -j ACCEPT
说明：注意要把拒绝的放在前面不然就不起作用了啊。


4.丢弃从外网接口（eth1）进入防火墙本机的源地址为私网地址的数据包
iptables -A INPUT -i eth1 -s 192.168.0.0/16 -j DROP
iptables -A INPUT -i eth1 -s 172.16.0.0/12 -j DROP
iptables -A INPUT -i eth1 -s 10.0.0.0/8 -j DROP


5.封堵网段（192.168.1.0/24），两小时后解封。
# iptables -I INPUT -s 10.20.30.0/24 -j DROP
# iptables -I FORWARD -s 10.20.30.0/24 -j DROP
# at now 2 hours at> iptables -D INPUT 1 at> iptables -D FORWARD 1
说明：这个策略咱们借助crond计划任务来完成，就再好不过了。
[1]   Stopped     at now 2 hours


6.只允许管理员从202.13.0.0/16网段使用SSH远程登录防火墙主机。
iptables -A INPUT -p tcp --dport 22 -s 202.13.0.0/16 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j DROP
说明：这个用法比较适合对设备进行远程管理时使用，比如位于分公司中的SQL服务器需要被总公司的管理员管理时。


7.允许本机开放从TCP端口20-1024提供的应用服务。
iptables -A INPUT -p tcp --dport 20:1024 -j ACCEPT
iptables -A OUTPUT -p tcp --sport 20:1024 -j ACCEPT


8.允许转发来自192.168.0.0/24局域网段的DNS解析请求数据包。
iptables -A FORWARD -s 192.168.0.0/24 -p udp --dport 53 -j ACCEPT
iptables -A FORWARD -d 192.168.0.0/24 -p udp --sport 53 -j ACCEPT


9.禁止其他主机ping防火墙主机，但是允许从防火墙上ping其他主机
iptables -I INPUT -p icmp --icmp-type Echo-Request -j DROP
iptables -I INPUT -p icmp --icmp-type Echo-Reply -j ACCEPT
iptables -I INPUT -p icmp --icmp-type destination-Unreachable -j ACCEPT


10.禁止转发来自MAC地址为00：0C：29：27：55：3F的和主机的数据包
iptables -A FORWARD -m mac --mac-source 00:0c:29:27:55:3F -j DROP
说明：iptables中使用“-m 模块关键字”的形式调用显示匹配。咱们这里用“-m mac –mac-source”来表示数据包的源MAC地址。


11.允许防火墙本机对外开放TCP端口20、21、25、110以及被动模式FTP端口1250-1280
iptables -A INPUT -p tcp -m multiport --dport 20,21,25,110,1250:1280 -j ACCEPT
说明：这里用“-m multiport –dport”来指定目的端口及范围

12.禁止转发源IP地址为192.168.1.20-192.168.1.99的TCP数据包。
iptables -A FORWARD -p tcp -m iprange --src-range 192.168.1.20-192.168.1.99 -j DROP
说明：此处用“-m –iprange –src-range”指定IP范围。

13.禁止转发与正常TCP连接无关的非—syn请求数据包。
iptables -A FORWARD -m state --state NEW -p tcp ! --syn -j DROP
说明：“-m state”表示数据包的连接状态，“NEW”表示与任何连接无关的，新的嘛！

14.拒绝访问防火墙的新数据包，但允许响应连接或与已有连接相关的数据包
iptables -A INPUT -p tcp -m state --state NEW -j DROP
iptables -A INPUT -p tcp -m state --state ESTABLISHED,RELATED -j ACCEPT
说明：“ESTABLISHED”表示已经响应请求或者已经建立连接的数据包，“RELATED”表示与已建立的连接有相关性的，比如FTP数据连接等。

15.只开放本机的web服务（80）、FTP(20、21、20450-20480)，放行外部主机发住服务器其它端口的应答数据包，将其他入站数据包均予以丢弃处理。
iptables -I INPUT -p tcp -m multiport --dport 20,21,80 -j ACCEPT
iptables -I INPUT -p tcp --dport 20450:20480 -j ACCEPT
iptables -I INPUT -p tcp -m state --state ESTABLISHED -j ACCEPT
iptables -P INPUT DROP

# 常用的 Linux iptables 规则

1. 删除所有现有规则
iptables -F

2. 设置默认的 chain 策略
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP


3. 阻止某个特定的 IP 地址
BLOCK_THIS_IP="x.x.x.x"
iptables -A INPUT -s "$BLOCK_THIS_IP" -j DROP

4. 允许全部进来的（incoming）SSH
iptables -A INPUT -i eth0 -p tcp --dport 22 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

5. 只允许某个特定网络进来的 SSH
iptables -A INPUT -i eth0 -p tcp -s 192.168.200.0/24 --dport 22 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

6. 允许进来的（incoming）HTTP
iptables -A INPUT -i eth0 -p tcp --dport 80 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 80 -m state --state ESTABLISHED -j ACCEPT

7. 多端口（允许进来的 SSH、HTTP 和 HTTPS）
iptables -A INPUT -i eth0 -p tcp -m multiport --dports 22,80,443 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp -m multiport --sports 22,80,443 -m state --state ESTABLISHED -j ACCEPT

8. 允许出去的（outgoing）SSH
iptables -A OUTPUT -o eth0 -p tcp --dport 22 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i eth0 -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

9. 允许外出的（outgoing）SSH，但仅访问某个特定的网络
iptables -A OUTPUT -o eth0 -p tcp -d 192.168.101.0/24 --dport 22 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i eth0 -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT

10. 允许外出的（outgoing） HTTPS
iptables -A OUTPUT -o eth0 -p tcp --dport 443 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A INPUT -i eth0 -p tcp --sport 443 -m state --state ESTABLISHED -j ACCEPT

11. 对进来的 HTTPS 流量做负载均衡
iptables -A PREROUTING -i eth0 -p tcp --dport 443 -m state --state NEW -m nth --counter 0 --every 3 --packet 0 -j DNAT --to-destination 192.168.1.101:443
iptables -A PREROUTING -i eth0 -p tcp --dport 443 -m state --state NEW -m nth --counter 0 --every 3 --packet 1 -j DNAT --to-destination 192.168.1.102:443
iptables -A PREROUTING -i eth0 -p tcp --dport 443 -m state --state NEW -m nth --counter 0 --every 3 --packet 2 -j DNAT --to-destination 192.168.1.103:443

12. 从内部向外部 Ping
iptables -A OUTPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-reply -j ACCEPT


13. 从外部向内部 Ping
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT
iptables -A OUTPUT -p icmp --icmp-type echo-reply -j ACCEPT

# 14. 允许环回（loopback）访问
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

15. 允许 packets 从内网访问外网
# if eth1 is connected to external network (internet)
# if eth0 is connected to internal network (192.168.1.x)
iptables -A FORWARD -i eth0 -o eth1 -j ACCEPT

# 16. 允许外出的  DNS
iptables -A OUTPUT -p udp -o eth0 --dport 53 -j ACCEPT
iptables -A INPUT -p udp -i eth0 --sport 53 -j ACCEPT

17. 允许 NIS 连接
# rpcinfo -p | grep ypbind ; This port is 853 and 850
iptables -A INPUT -p tcp --dport 111 -j ACCEPT
iptables -A INPUT -p udp --dport 111 -j ACCEPT
iptables -A INPUT -p tcp --dport 853 -j ACCEPT
iptables -A INPUT -p udp --dport 853 -j ACCEPT
iptables -A INPUT -p tcp --dport 850 -j ACCEPT
iptables -A INPUT -p udp --dport 850 -j ACCEPT

18. 允许某个特定网络 rsync 进入本机
iptables -A INPUT -i eth0 -p tcp -s 192.168.101.0/24 --dport 873 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 873 -m state --state ESTABLISHED -j ACCEPT

19. 仅允许来自某个特定网络的 MySQL 的链接
iptables -A INPUT -i eth0 -p tcp -s 192.168.200.0/24 --dport 3306 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 3306 -m state --state ESTABLISHED -j ACCEPT

20. 允许 Sendmail 或 Postfix
iptables -A INPUT -i eth0 -p tcp --dport 25 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 25 -m state --state ESTABLISHED -j ACCEPT

21. 允许 IMAP 和 IMAPS
iptables -A INPUT -i eth0 -p tcp --dport 143 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 143 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i eth0 -p tcp --dport 993 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 993 -m state --state ESTABLISHED -j ACCEPT

22. 允许 POP3 和 POP3S
iptables -A INPUT -i eth0 -p tcp --dport 110 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 110 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i eth0 -p tcp --dport 995 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 995 -m state --state ESTABLISHED -j ACCEPT

23. 防止 DoS 攻击
iptables -A INPUT -p tcp --dport 80 -m limit --limit 25/minute --limit-burst 100 -j ACCEPT

24. 设置 422 端口转发到 22 端口
iptables -t nat -A PREROUTING -p tcp -d 192.168.102.37 --dport 422 -j DNAT --to 192.168.102.37:22
iptables -A INPUT -i eth0 -p tcp --dport 422 -m state --state NEW,ESTABLISHED -j ACCEPT
iptables -A OUTPUT -o eth0 -p tcp --sport 422 -m state --state ESTABLISHED -j ACCEPT

25. 为丢弃的包做日志（Log）
iptables -N LOGGING
iptables -A INPUT -j LOGGING
iptables -A LOGGING -m limit --limit 2/min -j LOG --log-prefix "IPTables Packet Dropped: " --log-level 7
iptables -A LOGGING -j DROP

```





## mangle 表

### 介绍

    mangle 表是 iptables 中用于修改数据包的标记的表，它可以在数据包经过路由表之前，根据规则修改数据包的IP头部的一些字段，如 TTL 值、TOS 值等。这样可以影响数据包在网络中的转发方式和处理方式。mangle 表包含五个链：PREROUTING、POSTROUTING、INPUT、OUTPUT 和 FORWARD。mangle 表的优先级仅次于 raw 表，它会在 nat 表和 filter 表之前执行。

### 示例

    mangle 表的一个常见应用场景是实现策略路由，即根据不同的数据包选择不同的路由表进行转发。例如，如果我们想要让不同端口的数据包走不同的网关出去，我们可以使用 mangle 表来给数据包打上标记，然后根据标记来指定路由表。具体的步骤如下：



1. 首先，我们需要定义两个路由表，比如 10 和 20，并且分别添加默认路由到不同的网关。假设我们有两个网卡 eth1 和 eth2，分别连接到网关 202.106.x.x 和 211.108.x.x，我们可以使用 ip 命令来添加路由表
   
   ```bash
   ip route add default via 202.106.x.x dev eth1 table 10
   ip route add default via 211.108.x.x dev eth2 table 20
   ```

2. 然后，我们需要使用 mangle 表来给不同端口的数据包打上标记，比如我们想要让 80 和 443 端口的数据包走 eth1 网卡，而 20 和 21 端口的数据包走 eth2 网卡，我们可以使用 iptables 命令来设置 mangle 表
   
   ```bash
   iptables -t mangle -A PREROUTING -i eth0 -p tcp --dport 80:443 -j MARK --set-mark 1
   iptables -t mangle -A PREROUTING -i eth0 -p tcp --dport 20:21 -j MARK --set-mark 2
   ```

3. 最后，我们需要使用 ip 命令来添加规则，让打上标记的数据包按照对应的路由表进行转发
   
   ```bash
   ip rule add from all fwmark 1 table 10
   ip rule add from all fwmark 2 table 20
   ```
   
   

## raw 表

### 介绍

    raw 表是 iptables 中用于处理特殊类型的数据包的表，它可以决定是否对数据包进行连接跟踪（connection tracking），即是否记录数据包的状态信息。连接跟踪是一种消耗资源的操作，如果我们想要提高性能或者避免某些问题，我们可以使用 raw 表来让某些数据包跳过连接跟踪。raw 表只包含两个链：PREROUTING 和 OUTPUT。raw 表是 iptables 中优先级最高的表，它会在其他任何表之前执行。

### 示例

    raw 表的一个常见应用场景是处理 ICMP 数据包，即互联网控制消息协议数据包。ICMP 数据包是一种用于网络诊断和管理的数据包，比如 ping 命令就是发送 ICMP echo 请求并接收 ICMP echo 应答来测试网络连通性。如果我们想要禁止某些主机 ping 我们或者被我们 ping，我们可以使用 raw 表来设置规则。具体的步骤如下

1. 首先，我们需要确定要禁止 ping 的主机的 IP 地址，比如 192.168.1.100

2. 然后，我们需要使用 raw 表来设置规则，让该主机发出或者发往的 ICMP 数据包跳过连接跟踪，并且直接丢弃。我们可以使用 iptables 命令来设置 raw 表
   
   ```bash
   iptables -t raw -A PREROUTING -s 192.168.1.100 -p icmp -j DROP
   iptables -t raw -A OUTPUT -d 192.168.1.100 -p icmp -j DROP
   ```
   
   > 下面解释为什么使用 raw 表来禁止 ping 比使用 filter 表更好。
   > 
   > ping 命令是一种用于测试网络连通性的工具，它发送 ICMP 数据包到目标主机，并等待回应。如果目标主机能够正常响应，那么就说明网络是通的。如果目标主机无法响应，那么就说明网络有问题或者被阻止了。
   > 
   > 如果我们想要禁止某些主机 ping 我们或者被我们 ping，我们可以使用 iptables 的防火墙功能来设置规则，让 ICMP 数据包被丢弃或者拒绝。iptables 有四个表来管理不同类型的规则，分别是 filter、nat、mangle 和 raw。其中 filter 表是默认的表，用于过滤数据包；nat 表是用于实现网络地址转换；mangle 表是用于修改数据包的标记；raw 表是用于处理特殊类型的数据包。
   > 
   > 一般来说，我们可以使用 filter 表来禁止 ping，只需要在 INPUT 链和 OUTPUT 链上添加规则，让 ICMP 数据包被 DROP 或者 REJECT 即可。例如，如果我们想要禁止 192.168.1.100 这个主机 ping 我们或者被我们 ping，我们可以使用以下命令：
   > 
   > ```bash
   > iptables -A INPUT -s 192.168.1.100 -p icmp -j DROP
   > iptables -A OUTPUT -d 192.168.1.100 -p icmp -j DROP
   > ```
   > 
   > 这样做的效果是一样的，但是有一个缺点，就是 filter 表会对数据包进行连接跟踪（connection tracking），即记录数据包的状态信息。连接跟踪是一种消耗资源的操作，它会占用内存和 CPU 的资源，并且可能导致一些问题，如连接表溢出、连接超时等。如果我们不需要对 ICMP 数据包进行连接跟踪，那么使用 filter 表就是一种浪费。
   > 
   > 为了避免这种浪费，我们可以使用 raw 表来禁止 ping，只需要在 PREROUTING 链和 OUTPUT 链上添加规则，让 ICMP 数据包跳过连接跟踪，并且直接丢弃即可。例如，如果我们想要禁止 192.168.1.100 这个主机 ping 我们或者被我们 ping，我们可以使用以下命令：
   > 
   > ```bash
   > iptables -t raw -A PREROUTING -s 192.168.1.100 -p icmp -j DROP
   > iptables -t raw -A OUTPUT -d 192.168.1.100 -p icmp -j DROP
   > ```
   > 
   > 这样做的好处是可以节省资源和提高性能，因为 raw 表是 iptables 中优先级最高的表，它会在其他任何表之前执行，并且不会对数据包进行连接跟踪。这样就可以减少不必要的开销和风险。
   > 
   > 因此，使用 raw 表来禁止 ping 比使用 filter 表更好，除非我们有特殊的需求需要对 ICMP 数据包进行连接跟踪。
   
   

## 参考文档：

- [iptables详解及常用规则](https://cloud.tencent.com/developer/article/1683700)

- [iptables详解](https://lixiangyun.gitbook.io/iptables_doc_zh_cn/)

- [iptables规则设置用法](https://www.flftuu.com/2021/07/20/iptables%E8%A7%84%E5%88%99%E8%AE%BE%E7%BD%AE%E7%94%A8%E6%B3%95/)

- [iptables mangle表和raw表应用场景介绍](https://www.cnblogs.com/wanghongwei-dev/p/17635179.html)
