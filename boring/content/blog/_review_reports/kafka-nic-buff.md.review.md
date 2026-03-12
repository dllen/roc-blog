# 技术评审报告：kafka-nic-buff.md

- 发现问题：高 3 / 中 9 / 低 1
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L205 | 技术准确性 | properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 | Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。 | 高 |
| 2 | L206 | 技术准确性 | properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 | Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。 | 高 |
| 3 | L207 | 技术准确性 | properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 | Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。 | 高 |
| 4 | L154 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 5 | L202 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 6 | L230 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 7 | L353 | 可读性 | 标题层级跳跃：H1 -> H4 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 8 | L410 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 9 | L454 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 10 | L466 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 11 | L489 | 可读性 | 标题层级跳跃：H1 -> H3 | 调整为逐级递进（例如 H2 后使用 H3）。 | 中 |
| 12 | L501-L508 | 技术准确性 | Shell 片段可能存在语法问题：/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmpzw2vrc3s.sh: line 4: syntax error near unexpected token `"compression.type",'<br>/var/folders/6s/_8f2jwts5lz74g8gml1gym4h0000gn/T/tmpzw2vrc3s.sh: line 4: `props.put("compression.type", "lz4");' | 确保示例是可执行脚本：移除输出行、补全引号/括号/if-fi 等结构。 | 中 |
| 13 | L23 | 可读性 | 中英文/数字混排缺少空格（风格不统一） | 中文与英文/数字之间加空格；标识符用反引号包裹。 | 低 |

## 建议批注写法（可直接复制到原文对应位置）

### Issue 1（高）
<!-- TODO(高): properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 -->
> **Note:** Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。

### Issue 2（高）
<!-- TODO(高): properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 -->
> **Note:** Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。

### Issue 3（高）
<!-- TODO(高): properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 -->
> **Note:** Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。

### Issue 4（中）
<!-- TODO(中): 标题层级跳跃：H1 -> H3 -->
> **Note:** 调整为逐级递进（例如 H2 后使用 H3）。

### Issue 5（中）
<!-- TODO(中): 标题层级跳跃：H1 -> H3 -->
> **Note:** 调整为逐级递进（例如 H2 后使用 H3）。

### Issue 6（中）
<!-- TODO(中): 标题层级跳跃：H1 -> H3 -->
> **Note:** 调整为逐级递进（例如 H2 后使用 H3）。

## 重构版本（建议整篇替换：结构 + 代码块标注 + 命令可执行性）

### 1) 统一标题层级（示例结构）

建议把全篇统一到 `##/###` 两级（必要时再引入 `####`），避免 H1 之后直接跳到 H3/H4：

- `## NIC Buffer：概念与数据路径`
- `## Kafka 写入链路：Producer → Broker → Disk`
- `## Kafka 读取链路：Broker → Consumer`
- `## 可观测性与排障：指标与命令`
- `## 调参策略：目标、压测与回滚`

### 2) 修正 `.properties` 注释（对应 Issue 1-3）

```properties
# broker/server.properties
# Socket 发送缓冲区（受 OS wmem 上限约束）
socket.send.buffer.bytes=102400
# Socket 接收缓冲区（受 OS rmem 上限约束）
socket.receive.buffer.bytes=102400
```

### 3) 避免将非 Shell 内容放入 `bash` 代码块（对应 Issue 12）

原则：
- Java 配置示例必须用 `java` 代码块
- 命令行示例必须用 `bash` 代码块
- 不在 `bash` 代码块里混入 `props.put(...)` 之类 Java 语句

### 4) 将“修改 /proc 伪文件”改为可复现的 sysctl 做法（补强工程可执行性）

```bash
# 查看当前上限
sysctl net.core.wmem_max
sysctl net.core.rmem_max

# 临时生效（重启失效）
sudo sysctl -w net.core.wmem_max=134217728
sudo sysctl -w net.core.rmem_max=134217728

# 永久生效（建议写入 /etc/sysctl.d/）
cat <<'EOF' | sudo tee /etc/sysctl.d/99-kafka-net.conf
net.core.wmem_max = 134217728
net.core.rmem_max = 134217728
EOF
sudo sysctl --system
```

### 5) 监控与排障命令：替换掉不准确/不可用的示例

如果目的是看 consumer group lag/offsets，不建议直接消费 `__consumer_offsets`。更可执行的命令是：

```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups
```

### 6) 一份可直接发布的“精简重写稿”（可复制为新正文）

```markdown
## NIC Buffer：概念与数据路径

NIC buffer（网卡缓冲区）是网卡用于暂存收发数据包的队列/缓冲资源。它并不等同于 socket 缓冲（内核网络栈）或应用缓冲（用户态），但会共同决定吞吐、抖动与丢包/重传行为。

### 数据路径（抽象）

```
App → socket send buffer → TCP/IP → NIC TX ring → Network → NIC RX ring → TCP/IP → socket recv buffer → App
```

> **Note:** Kafka 的调参必须同时看“Kafka 配置 + OS 网络栈 + NIC 队列 + 磁盘/页缓存”，否则容易出现“单点加大参数但系统瓶颈未变”的错觉。

## Kafka 写入链路：Producer → Broker → Disk

### Producer 侧关键参数（示例）

```java
Properties props = new Properties();
props.put(\"buffer.memory\", 67108864);
props.put(\"batch.size\", 65536);
props.put(\"linger.ms\", 10);
props.put(\"compression.type\", \"lz4\");
props.put(\"acks\", \"all\");
```

### Broker 侧 socket 缓冲（示例）

```properties
# broker/server.properties
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
```

## Kafka 读取链路：Broker → Consumer

### Consumer 抓取参数（示例）

```properties
# consumer.properties
fetch.min.bytes=1048576
fetch.max.wait.ms=50
max.partition.fetch.bytes=8388608
```

## 可观测性与排障：指标与命令

```bash
# consumer group offsets / lag
kafka-consumer-groups.sh --bootstrap-server <broker:9092> --describe --all-groups

# 网络连接与队列（按需）
ss -tin

# 网卡 ring 大小（需要 ethtool）
sudo ethtool -g eth0
```

## 调参策略：目标、压测与回滚

- 先定义目标（吞吐/延迟/丢包/重试）与基线，再改参数。
- 每次只改一类参数（Producer / Broker / Consumer / OS），配合压测与指标对齐。
- 保留参数快照与回滚路径，避免“线上不可逆试错”。
```
