---
title: 基于 Filebeat、Kafka、Flink、ES、ClickHouse、HBase 的日志系统建设
date: 2025-10-25
description: 从架构到实现与运维的端到端实践，含配置与脚本示例。
tags: [日志, Filebeat, Kafka, Flink, Elasticsearch, ClickHouse, HBase, 大数据, 实时, 运维]
---

# 概览
- 目标：构建可扩展、低延迟、可检索与可分析的日志平台，支持实时处理与历史归档。
- 数据流：`Filebeat → Kafka → Flink → {Elasticsearch | ClickHouse | HBase}`。
- 架构图：
  ![系统架构](/log-system-architecture.svg)

# 1. 系统架构设计
- 角色定位
  - Filebeat：轻量采集器，支持多源文件、容器日志，提供行聚合、过滤与缓冲，向 Kafka 可靠投递。
  - Kafka：日志总线与缓冲层，解耦生产与消费，提供分区并行与持久化，作为 Flink Source。
  - Flink：实时计算引擎，做清洗、解析、路由与指标聚合，Exactly-Once 输出至各存储。
  - Elasticsearch：面向检索与可视化（Kibana），适合结构化/半结构化日志快速查询。
  - ClickHouse：面向多维分析与聚合（OLAP），高吞吐写入与秒级分析，适合报表与趋势洞察。
  - HBase：长周期明细存储与宽表查询，支撑低频但深度明细回溯。
- 高可用与容错
  - Filebeat：内置重试与持久队列（spool）；Kafka 端启用 `acks=all` 与幂等写。
  - Kafka：Broker 多副本+ISR，控制器自动选举；跨机房可启用 MirrorMaker2。
  - Flink：Checkpoint+Savepoint，RocksDB 状态后端，事务性 Sink（两阶段提交）。
  - Elasticsearch：索引副本与 ILM 滚动；跨集群搜索可做容灾；
  - ClickHouse：分片+副本，ReplicatedMergeTree，失败节点自动恢复；
  - HBase：HDFS 冗余、RegionServer 自动迁移，ZK 保证一致性。

# 2. 技术选型分析
- 选择考量与对比
  - Filebeat vs Fluent Bit：生态与可维护性、配置一致性；FB 多模块成熟，FB→Kafka 链路稳定。
  - Kafka vs Pulsar：Kafka 在日志生态与 Flink Source 上成熟；事务性写与生态工具完备。
  - Flink vs Spark Streaming：更低延迟与原生事件时间，Exactly-Once 更易实现。
  - ES vs OpenSearch：社区与商业支持综合评估；选 ES 8.x 以简化部署与安全集成。
  - ClickHouse vs Druid：写入吞吐与查询延迟综合更优，维护成本低；
  - HBase vs Cassandra：基于 HDFS 的生态整合与线性扩展、适合明细长保留。
- 版本建议与兼容性
  - Kafka 3.x（带 KRaft 或 ZK）、Flink ≥1.17、ES 8.x、ClickHouse ≥23.x、HBase 2.x、JDK 17。
  - 序列化：JSON 起步，推荐 Avro/Protobuf+Schema Registry，便于演进与兼容。
- 性能基准（示例环境：8C32G+NVMe，千兆网）
  - Kafka 单 Broker 吞吐（LZ4 压缩，批量写）：≥150k msg/s（1KB）；
  - Flink 端到端延迟（解析+路由）：p95 ≤ 300ms；
  - ES 索引速率：单节点 ≥20k doc/s（bulk 5k，刷新 5s）；
  - ClickHouse 插入：≥150MB/s（HTTP batch）；
  - HBase Put：≥50k row/s（批量 1k，Async 客户端）。

# 3. 核心实现细节
- Filebeat 配置
```yaml
filebeat.inputs:
  - type: log
    paths: ["/var/log/app/*.log"]
    multiline.pattern: '^\['
    multiline.negate: true
    multiline.match: after
    fields: {app: myapp, env: prod}
    processors:
      - drop_event:
          when:
            equals: {log.level: "debug"}
output.kafka:
  hosts: ["kafka1:9092","kafka2:9092"]
  topic: "logs.raw"
  compression: lz4
  partition.round_robin:
    reachable_only: true
  required_acks: -1
  bulk_max_size: 2048
```
- Kafka 主题规划
  - 命名：`logs.{env}.{app}.{type}`；分区数按峰值吞吐与消费者并行度估算；RF≥3。
  - Producer：`acks=all`、`enable.idempotence=true`、`linger.ms=5-20`、`batch.size=64-256KB`。
  - 保留：热数据 7-14 天，冷归档转对象存储或 CH/HBase。
- Flink 处理主线（Java 示例）
```java
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
env.enableCheckpointing(30000);
Properties props = new Properties();
props.put("bootstrap.servers", "kafka1:9092");
FlinkKafkaConsumer<String> source = new FlinkKafkaConsumer<>("logs.raw", new SimpleStringSchema(), props);
DataStream<String> raw = env.addSource(source);
DataStream<LogEvent> parsed = raw.map(Json::parse).assignTimestampsAndWatermarks(...);
// 分流：检索类 → ES，分析类 → CH，明细长保留 → HBase
SideOutput esOut = ...; SideOutput chOut = ...; SideOutput hbaseOut = ...;
parsed.process(new RouterFn(esOut, chOut, hbaseOut));
// Elasticsearch sink（bulk，低刷新）
parsed.getSideOutput(esOut).addSink(EsSink.bulk("http://es:9200", "logs-idx"));
// ClickHouse sink（HTTP insert）
parsed.getSideOutput(chOut).addSink(ClickHouseSink.http("http://ch:8123", "INSERT INTO logs VALUES (?, ?, ?)"));
// HBase sink（Async Put）
parsed.getSideOutput(hbaseOut).addSink(HBaseSink.async("zookeeper:2181", "logs:evt"));
env.execute("log-pipeline");
```
- Elasticsearch 索引与分片
```json
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "refresh_interval": "5s",
    "index.translog.durability": "async"
  },
  "mappings": {
    "properties": {
      "@timestamp": {"type": "date"},
      "app": {"type": "keyword"},
      "level": {"type": "keyword"},
      "message": {"type": "text"}
    }
  }
}
```
- ClickHouse 表设计
```sql
CREATE TABLE logs (
  ts DateTime,
  app String,
  level LowCardinality(String),
  message String
) ENGINE = MergeTree
PARTITION BY toDate(ts)
ORDER BY (ts, app)
SETTINGS index_granularity = 8192;
```
- HBase RowKey 与列族
```
RowKey: <rev_ts><tenant><app><hash>
CF: d (detail), m (meta)
预分区：按时间与租户做 split；避免热点。
```

## 日志采集模块配置（容器与主机）

### 容器环境日志采集
- 采集 Docker 标准输出（stdout/stderr）
  - 方法 A（文件采集）：Docker 默认 `json-file` 驱动将容器日志写入 `/var/lib/docker/containers/<cid>/<cid>-json.log`。
    ```yaml
    filebeat.inputs:
      - type: log
        enabled: true
        paths:
          - /var/lib/docker/containers/*/*-json.log
        processors:
          - add_docker_metadata:
              host: "unix:///var/run/docker.sock"  # 通过 Docker API 增强容器元数据
          - decode_json_fields:
              fields: ["message"]
              target: "json"
              overwrite_keys: true
        multiline.pattern: '^{"log":"'   # 若应用以多行日志写入一条 JSON，可按需开启
        multiline.negate: false
        multiline.match: after
    ```
  - 方法 B（容器输入）：使用 `type: container` 读取容器运行时日志（支持 Docker/Containerd CRI），适合 K8s。
    ```yaml
    filebeat.inputs:
      - type: container
        enabled: true
        paths:
          - /var/log/containers/*.log  # Kubernetes CRI 标准路径
        processors:
          - add_kubernetes_metadata:
              host: ${NODE_NAME}
              matchers:
                - logs_path:
                    logs_path: "/var/log/containers/"  # 基于路径匹配 Pod/容器元数据
          - drop_event:
              when:
                equals:
                  kubernetes.labels.log_level: "debug"  # 示例：按标签过滤低价值日志
    ```
- 容器日志文件挂载采集
  - 为 Filebeat 容器挂载主机日志目录与 Docker/K8s 元数据接口：
    - Docker：挂载 `/var/lib/docker/containers` 与 `/var/run/docker.sock`
    - K8s：挂载 `/var/log/containers`、`/var/log/pods`、`/var/lib/docker/containers`（取决于运行时）
- Kubernetes DaemonSet 部署示例
  ```yaml
  apiVersion: apps/v1
  kind: DaemonSet
  metadata:
    name: filebeat
    namespace: logging
  spec:
    selector:
      matchLabels: {app: filebeat}
    template:
      metadata:
        labels: {app: filebeat}
      spec:
        serviceAccountName: filebeat
        hostNetwork: true
        dnsPolicy: ClusterFirstWithHostNet
        containers:
          - name: filebeat
            image: docker.elastic.co/beats/filebeat:8.12.0
            args: ["-c", "/etc/filebeat.yml", "-e"]
            env:
              - name: NODE_NAME
                valueFrom: {fieldRef: {fieldPath: spec.nodeName}}
            volumeMounts:
              - {name: config, mountPath: /etc/filebeat.yml, subPath: filebeat.yml}
              - {name: varlog, mountPath: /var/log}
              - {name: containers, mountPath: /var/lib/docker/containers, readOnly: true}
              - {name: dockersock, mountPath: /var/run/docker.sock}
            securityContext:
              runAsUser: 0
        volumes:
          - name: config
            configMap: {name: filebeat-config}
          - name: varlog
            hostPath: {path: /var/log}
          - name: containers
            hostPath: {path: /var/lib/docker/containers}
          - name: dockersock
            hostPath: {path: /var/run/docker.sock}
  ---
  apiVersion: v1
  kind: ConfigMap
  metadata:
    name: filebeat-config
    namespace: logging
  data:
    filebeat.yml: |
      filebeat.inputs:
        - type: container
          enabled: true
          paths:
            - /var/log/containers/*.log
          processors:
            - add_kubernetes_metadata:
                host: ${NODE_NAME}
                matchers:
                  - logs_path:
                      logs_path: "/var/log/containers/"
      output.kafka:
        hosts: ["kafka1:9092","kafka2:9092"]
        topic: "logs.raw"
        partition.round_robin.reachable_only: true
        compression: lz4
        required_acks: -1
  ```
- 容器元数据增强
  - Docker：`add_docker_metadata` 通过 Docker API 提取容器名、镜像、标签等；
  - Kubernetes：`add_kubernetes_metadata` 注入 Pod/Namespace/Labels/Annotations；可用 `drop_event`/`drop_fields` 做过滤与瘦身。

### 主机环境日志采集
- 采集系统日志（syslog/auth/journald）
  - 使用系统模块（推荐）：
    ```yaml
    filebeat.modules:
      - module: system
        syslog:
          enabled: true
          var.paths: ["/var/log/syslog", "/var/log/messages"]
        auth:
          enabled: true
          var.paths: ["/var/log/auth.log", "/var/log/secure"]
    ```
  - 或文件输入（通用）：
    ```yaml
    filebeat.inputs:
      - type: log
        paths:
          - /var/log/*.log
          - /var/log/nginx/*.log
        multiline.pattern: '^\\['  # 以时间/方括号开始的堆栈等多行
        multiline.negate: true
        multiline.match: after
        fields_under_root: true
        fields:
          host.role: "web"
          env: "prod"
        processors:
          - drop_fields: {fields: ["log.offset", "input.type"]}
          - rename:
              fields:
                - from: "host.name"
                  to: "hostname"
    ```
- 主机标签与自定义字段
  - 使用 `fields` 与 `fields_under_root: true` 直接展开到事件根，提高检索友好性；配合 `tags: [prod, region-cn]` 标注环境。
- 日志轮转与归档建议
  - 应用侧启用 `logrotate` 或等效机制，控制单文件大小与保留周期；
  - Filebeat 相关参数：
    - `close_inactive: 5m`（无新数据关闭文件句柄）
    - `clean_inactive: 168h`（长时间无活动的文件从注册表清理）
    - `ignore_older: 24h`（忽略过久文件）
    - `scan_frequency: 10s`（扫描新文件频率）

### 通用配置要求
- 完整的 `filebeat.yml` 示例（容器与主机通用骨架）
```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths: ["/var/log/app/*.log"]
    multiline.pattern: '^\\['
    multiline.negate: true
    multiline.match: after
    processors:
      - drop_event:
          when:
            equals: {log.level: "debug"}
      - decode_json_fields:
          fields: ["message"]
          target: "json"
          overwrite_keys: true
      - add_docker_metadata:
          host: "unix:///var/run/docker.sock"
      - add_kubernetes_metadata:
          host: ${NODE_NAME}
output.kafka:
  hosts: ["kafka1:9092","kafka2:9092"]
  topic: "logs.raw"
  compression: lz4
  partition.round_robin.reachable_only: true
  required_acks: -1
  client_id: "filebeat-prod"
  max_message_bytes: 1000000
# 安全（示例，按需启用）
# ssl.certificate_authorities: ["/etc/ssl/ca.pem"]
# sasl.mechanism: scram-sha-512
# username: "beat_user"
# password: "secret"
# 监控接口
http.enabled: true
http.host: 0.0.0.0
http.port: 5066
logging.level: info
logging.selectors: ["publish", "processors"]
```
- 过滤与字段处理
  - 首选在采集侧做降噪：`drop_event`、`drop_fields`、`dissect`/`decode_json_fields`、`rename`；
  - 统一时间戳：`timestamp` 处理器将自定义时间字段映射到 `@timestamp`。
- Kafka 输出参数说明
  - `required_acks=-1`（all ISR 确认）、`compression=lz4`、`max_message_bytes` 控制单消息大小；
  - `partition.round_robin.reachable_only=true` 避免不可达分区；`client_id` 标识采集实例；
  - 安全：SASL SCRAM 与 SSL 证书链；生产环境建议启用加密与认证。
- 性能与安全建议
  - 控制输入文件数量与 `harvester_limit`，避免句柄耗尽；
  - 合理 `bulk_max_size` 与 Kafka 端 `linger.ms`/`batch.size` 匹配；
  - 采集侧最小权限运行，限制可读取路径；容器中避免特权运行。

### 验证方案
- 功能验证
  - 本地：`filebeat test output` 检查与 Kafka 的连通；`filebeat -e -d "publish"` 观察事件发送；
  - 端到端：使用 `kcat -C -b kafka1:9092 -t logs.raw -o -10` 拉取最新评论，校验字段；
- 常见问题排查
  - 容器元数据缺失：检查是否挂载 `/var/run/docker.sock` 或正确配置 `add_kubernetes_metadata`；
  - 多行合并异常：确认 `multiline.pattern` 与日志格式匹配，适当调整 `timeout`；
  - 无法读取文件：校验路径与权限，确认 Filebeat 运行用户与宿主机挂载；
  - Kafka 429/缓慢：检查 `required_acks`、网络与批量参数，监控 broker 队列与磁盘；
- 性能监控配置建议
  - 启用 `http.enabled: true` 暴露指标（`/stats`），采集 `beat.events`、`harvester.open_files`、`output.events` 成功/失败；
  - 用 Prometheus 抓取并设置告警：采集速率低于预期、发送失败率升高、打开文件数异常增长。

# 4. 性能优化经验
- Filebeat：`bulk_max_size` 调整批量；启用持久队列；过滤低价值日志降低链路压力。
- Kafka：合适分区数与 RF；Broker `num.network.threads`/`socket.send.buffer.bytes`；启用 LZ4；控制批大小与 linger。
- Flink：优化并行度与算子链；RocksDB state、增大 `write-buffer-size`；Checkpoint 间隔与超时合理化。
- ES：降低刷新频率（5-10s）、增大 `indexing.buffer`、合理分片；使用 ILM 滚动与冷/温节点。
- CH：控制 parts 数量，批量写入；`max_insert_block_size`、`max_threads` 调优；后台合并监控。
- HBase：RowKey 防热点；`memstore`/`blockcache` 调整；Major/Minor compaction 节奏。
- 容量规划：按峰值吞吐与增长率规划分区/分片/Region 数量，留有 30% 余量。

# 5. 运维监控方案
- 指标
  - Filebeat：harvesters、publish queue 使用率、掉包率。
  - Kafka：ISR、Under-Replicated Partitions、Consumer Lag、请求队列长度。
  - Flink：Backpressure、Checkpoint Time/Fail、Task Failures。
  - ES：JVM heap、GC、Indexing rate、Query p95/p99、Threadpool 队列。
  - CH：parts 数、后台 merges、replication lag、查询耗时分布。
  - HBase：RegionServer 负载、Compaction、读写延迟。
- 告警阈值示例（PromQL）
```
kafka_server_replica_manager_underreplicatedpartitions > 0
sum(rate(es_indexing_index_total[5m])) < expected_rate * 0.7
```
- 运维清单：滚动升级、备份与快照、容量巡检、索引与表维护、Checkpoint 与 Savepoint 验证。

# 6. 实际应用案例（示例）
- 规模：日均 2TB，峰值 250k events/s；端到端 p95 ≤ 500ms。
- 查询：ES 关键词检索 p95 ≤ 200ms；CH 1 亿行聚合 p95 ≤ 2s。
- 价值：统一日志入口、降低故障定位时间 ≥50%，支持审计与增长分析。

# 7. 部署脚本示例（片段）
```bash
#!/usr/bin/env bash
set -euo pipefail
# 安装并启动 Filebeat（示例）
apt-get update && apt-get install -y filebeat
cp filebeat.yml /etc/filebeat/filebeat.yml
systemctl enable filebeat && systemctl restart filebeat
# Kafka Producer 依赖 JDK
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
# Flink 提交示例
flink run -c com.example.LogPipeline ./log-pipeline.jar
```

# 8. 典型问题与解决
- Kafka 负载不均：分区键散列不均导致热点 → 优化 Key 与增加分区。
- Flink Checkpoint 失败：外部存储带宽不足 → 升级存储与拉长间隔、压缩状态。
- ES 写入 429：线程池队列满 → 降低刷新频率、调大 bulk、限流入口。
- CH parts 过多：小批次写导致合并压力 → 增大批次与控制并发。
- HBase 热点 Region：RowKey 顺序导致集中 → 前缀散列或反转时间戳。

# 9. 对比传统方案的改进
- 相比仅 ELK：引入 Kafka 与 Flink 实现解耦与实时计算；ClickHouse/HBase 提供高效分析与长期明细，整体可用性与扩展性更佳。

# 10. 架构演进方向
- Schema Registry+Avro/Protobuf；Kafka 分层存储；Flink Stateful Functions；ES 冷/温节点与 CCR；ClickHouse 对象存储分层；HBase 与 Data Lake（Iceberg/Hudi）打通。

# 后台控制系统详细设计

为支撑日志平台的可配置性、查询可扩展性与稳定告警能力，设计统一的后台控制系统，包含采集配置模块、查询分析模块与日志告警模块。每个模块提供架构图、技术选型、性能指标、接口定义与异常处理及一致性保障方案。

## 1) 采集配置模块

- 架构设计图：
  ![采集配置中心架构](/backend-control-config-architecture.svg)

- 关键技术选型说明
  - 配置中心：`PostgreSQL` 存储配置与审计，`Git` 作为版本库（拉取与回滚），`etcd/Consul` 用于轻量型在线 KV 与 Watch；通过 `OpenAPI` 提供读写接口。
  - 变更分发：`Kafka` 主题 `config-updates` 广播配置变更；`Flink`/微服务消费后生成增量快照。
  - Agent 管理：Filebeat、Fluent Bit、自研采集代理统一通过 `HTTPS/gRPC` 拉取配置或被动订阅；支持多协议采集（HTTP/HTTPS/TCP/UDP）。
  - 校验与灰度：配置 Schema（`JSON Schema`/`Protobuf`）校验，支持批次灰度与逐步扩散；失败自动回滚。

- 配置项设计
  - 采集频率：`scan_frequency`、`harvester_limit`、`ignore_older/close_inactive`；
  - 数据格式：`json/line/custom`，字段映射与 `decode_json_fields/dissect`；
  - 过滤规则：`drop_event/drop_fields/rename/timestamp`；
  - 协议参数：HTTP/HTTPS（`headers/auth/timeout`）、TCP/UDP（`host/port/max_message_bytes`）。
  - 版本控制：每次提交生成 `versionId`（Git commit），支持标签与回滚；所有变更留审计轨迹。

- 性能指标要求
  - 吞吐：配置读取 `p99 ≥ 2k rps`；写入 `p99 ≥ 200 rps`。
  - 传播延迟：集群内 `p95 ≤ 5s` 到达所有在线 Agent。
  - 可用性：`≥ 99.95%`（双活/主备部署）。

- 与其他模块交互接口定义
  - REST/gRPC（示例）：
    - `POST /api/v1/configs`（创建配置，返回 `versionId`）
    - `GET /api/v1/configs/{id}`（读取配置）
    - `POST /api/v1/configs/{id}/deploy?strategy=canary`（灰度发布）
    - `POST /api/v1/configs/{id}/rollback`（版本回滚）
  - Kafka：`topic=config-updates`（key: `agentId/group`，value: `configVersion`）。

- 异常处理与一致性保障
  - 乐观并发控制（`version` 字段）；写前校验与写后审计。
  - 分发失败重试与死信队列（DLQ）；Agent 端本地快照与超时回退策略。
  - 事件顺序保障：`configVersion` 单调递增，Agent 只接受更高版本；幂等应用。
  - 部署回滚与熔断：批次灰度监控异常触发自动回滚；对下游 Kafka/HTTP 超时启用熔断。

## 2) 查询分析模块

- 架构设计图：
  ![查询分析引擎架构](/backend-control-query-architecture.svg)

- 关键技术选型说明
  - 分布式查询引擎：`Trino/Presto` 用于 SQL 跨源查询（ES/ClickHouse/HBase 适配器）；
  - DSL 引擎：`Lucene/KQL` 风格 DSL 转换为 ES 查询；复杂聚合落 CH 物化视图。
  - 缓存与索引优化：`Redis` 查询结果缓存（Key=归一化查询+时间窗）；CH 物化视图与稀疏索引；ES 使用 `keyword` 与 `nested` 正确映射。
  - 路由层：根据查询类型与代价估算路由至 ES（检索）或 CH（聚合），支持双写兜底。

- 多维聚合功能
  - 维度：`app/env/host/region/userId` 等，支持 `group by/rollup/cube`；
  - 时间窗：`HOPPING/TUMBLING/SLIDING`；预聚合表加速报表查询。

- 性能指标要求
  - 吞吐：并发查询 `p99 ≥ 500 qps`（缓存命中场景）；
  - 延迟：实时检索 `p95 ≤ 300ms`（ES）；重聚合 `p95 ≤ 2s`（CH）；
  - 可用性：`≥ 99.9%`，路由层与引擎多副本。

- 与其他模块交互接口定义
  - HTTP/WS：
    - `POST /api/v1/query/sql`（body: SQL，支持分页与超时）
    - `POST /api/v1/query/dsl`（body: DSL，支持流式返回）
    - `GET /api/v1/query/{id}/status`（异步查询状态）
  - 结果缓存：`GET /api/v1/query/cache/{hash}`；`DELETE /api/v1/query/cache/{hash}`。

- 异常处理与一致性保障
  - 超时与降级：超过 SLA 自动降级为预聚合与近似结果；
  - 重试与幂等：幂等查询 ID；后端重试限制与指数退避；
  - 数据一致性：跨源时间窗对齐；ES/CH 双写校验差异并标记结果版本；
  - 背压控制：路由层限流与队列；防止查询风暴。

## 3) 日志告警模块

- 架构设计图：
  ![日志告警引擎架构](/backend-control-alert-architecture.svg)

- 关键技术选型说明
  - 规则引擎：`Flink` 流式评估（事件时间），支持多级告警（INFO/WARNING/ERROR/CRITICAL）；
  - 时间窗口：`Sliding/Tumbling` 窗口，支持去重键与聚合阈值；
  - 通知通道：`SMTP` 邮件、短信网关（`HTTP` SDK）、`Webhook`（签名校验与重试）；
  - 抑制与降噪：重复告警抑制、合并策略、秒级阈值与指数退避；支持维护窗口与静默策略。

- 性能指标要求
  - 吞吐：规则评估 `≥ 1M events/min`；
  - 延迟：端到端告警触发 `p95 ≤ 5s`；
  - 可用性：`≥ 99.9%`，检查点与状态容灾。

- 与其他模块交互接口定义
  - 规则管理：
    - `POST /api/v1/alerts/rules`（创建/更新，返回 `ruleId/version`）
    - `GET /api/v1/alerts/rules/{id}`（读取）
    - `POST /api/v1/alerts/rules/{id}/disable`（禁用）
  - 告警事件：
    - `GET /api/v1/alerts/events?level=ERROR&window=1h`（查询告警事件）
    - `POST /api/v1/alerts/notifications/test`（通道联通性测试）
  - Kafka：`topic=alerts-input`（原始事件），`topic=alerts-output`（告警结果）。

- 异常处理与一致性保障
  - Exactly-Once：Kafka + Flink 两阶段提交，通知端幂等；
  - 顺序与乱序：事件时间窗口处理，迟到数据允许度 `allowedLateness`；
  - 抑制策略：重复告警聚合与限流，按 `dedupKey` 与时间窗去重；
  - 故障自愈：checkpoint 失败报警与自动重启；通道失败重试与 DLQ。