# 技术评审报告：kafka-top-10-optimizations.md

- 发现问题：高 4 / 中 0 / 低 1
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L39 | 技术准确性 | properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 | Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。 | 高 |
| 2 | L79 | 技术准确性 | properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 | Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。 | 高 |
| 3 | L80 | 技术准确性 | properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 | Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。 | 高 |
| 4 | L81 | 技术准确性 | properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 | Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。 | 高 |
| 5 | L5 | 可读性 | 中英文/数字混排缺少空格（风格不统一） | 中文与英文/数字之间加空格；标识符用反引号包裹。 | 低 |

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

### Issue 4（高）
<!-- TODO(高): properties 片段可能有误：值中包含未转义的 #，在 .properties 中会成为 value 的一部分 -->
> **Note:** Java .properties 仅支持行首 #/! 注释；将注释移到上一行，或使用单独注释行。

### Issue 5（低）
<!-- TODO(低): 中英文/数字混排缺少空格（风格不统一） -->
> **Note:** 中文与英文/数字之间加空格；标识符用反引号包裹。

## 重构版本（可直接替换原文相关片段）

### A) `server.properties` / `consumer.properties` 的注释规范（对应 Issue 1-4）

Java `.properties` 严格来说仅支持行首注释（`#`/`!`），形如 `key=value  # 注释` 的写法会把 `#` 后内容当作 value 的一部分。建议改为“注释单独成行”：

#### 1) `replica.lag.time.max.ms`（broker）

```properties
# broker/server.properties
# 示例：5s。需要结合网络/磁盘能力与业务延迟容忍度综合评估
replica.lag.time.max.ms=5000
```

#### 2) 线程配置（broker）

```properties
# broker/server.properties
num.network.threads=8
num.io.threads=16
num.replica.fetchers=4
```

#### 3) 消费者抓取（consumer）

```properties
# consumer.properties
# 1MB：增大以减少请求开销（吞吐优先场景）
fetch.min.bytes=1048576
# 最长等待以凑满批次（延迟敏感业务可调低）
fetch.max.wait.ms=50
# 每分区最大抓取
max.partition.fetch.bytes=8388608
```

### B) `socket.*.buffer.bytes` 与 OS 缓冲的边界说明（补强技术表述）

建议在该节末尾补一句“调参顺序与约束”，避免读者误以为 Kafka 参数可覆盖 OS 上限：

> **Note:** broker 的 `socket.send.buffer.bytes/socket.receive.buffer.bytes` 受 OS `wmem_max/rmem_max` 等上限约束；建议先确认 OS 上限与实际生效值，再逐步调整 Kafka 参数并做压测验证。

### C) KRaft 参数时效性（补充版本范围）

原文已提示“参数名随版本差异”，建议把这一句升级为可执行要求：

> **Note:** KRaft 控制面参数在 Kafka 3.x 的不同版本间有过调整；请以“当前部署版本”的官方配置文档为准，并在文中标注适用版本（例如 Kafka 3.6/3.7）。如果无法确认，建议只给出“排查思路 + 指标/日志关键词”，不直接给出参数名。
