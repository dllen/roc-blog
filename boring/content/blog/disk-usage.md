---
title: "Elasticsearch 磁盘使用优化实践"
date: 2024-09-19T12:00:00+08:00
description: "从索引、映射、生命周期与归档等方面系统化降低磁盘占用，兼顾性能与可靠性。"
tags: [Elasticsearch, 性能优化, 存储]
---

## 背景与目标

- 背景：随着数据规模增长与保留期延长，Elasticsearch 的段文件、复制、存储字段与快照会快速膨胀。
- 目标：在保证查询能力与可靠性的前提下，系统性降低磁盘使用成本，并明确权衡与风险。

参考：
- Tune for disk usage（Elasticsearch 6.8 指南）：https://www.elastic.co/guide/en/elasticsearch/reference/6.8/tune-for-disk-usage.html
- Optimize disk usage（Elastic Docs）：https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/disk-usage

## 一页清单（Quick Wins）

- 将索引设置为 `index.codec: best_compression`，仅在只读或写入压力可接受场景使用。
- 只对需要排序/聚合的字段启用 `doc_values`（默认），避免在 `text` 字段开启 `fielddata`。
- 为不需要短语/位置查询的 `text` 字段设置 `index_options: docs` 并关闭 `norms`。
- 依赖 `_source` 返回，谨慎使用 `store: true`；必要时做 `_source` 过滤而非禁用。
- 控制每索引的分片数量和大小，减少小分片；副本数按可靠性需求设置。
- 对只读索引执行 `forcemerge` 到较少段；通过 ILM 编排 rollover/shrink/forcemerge/delete。
- 采用快照与（版本支持下的）searchable snapshots，将冷数据转移到对象存储。

## 索引级压缩：`best_compression`

- 原理与权衡：将存储字段等改为更高压缩率（如 DEFLATE），降低磁盘占用但增加 CPU 与写入延迟。
- 仅影响新段：更改后只对新生成的段生效；老段需 `forcemerge` 才能受益。
- 设置示例：

```json
PUT my-index/_settings
{
  "index": {
    "codec": "best_compression"
  }
}
```

- 对只读历史索引，在 ILM 的 warm/cold 阶段配合 `forcemerge` 使用更合适。

## 映射优化：字段级减负

- 文本字段（不需要短语/位置时）：

```json
PUT my-index
{
  "settings": { "index.codec": "best_compression" },
  "mappings": {
    "properties": {
      "message": {
        "type": "text",
        "index_options": "docs",
        "norms": false
      },
      "status": {
        "type": "keyword",
        "doc_values": true
      },
      "ts": {
        "type": "date",
        "doc_values": true
      }
    }
  }
}
```

- 说明：
  - `index_options: docs` 仅索引文档号，减少位置信息存储；不适用于短语查询与高亮。
  - `norms: false` 关闭字段归一化元数据，缩减磁盘与内存。
  - 对需要聚合/排序的字段保留 `doc_values`；在 `text` 上避免开启 `fielddata`。

- 存储策略：
  - 默认不 `store` 字段，依赖 `_source` 返回；对超大文档可做 `_source` 过滤（`_source.includes/excludes`）。
  - 禁用 `_source` 会影响重建与更新；仅在有严格外部存储与明确不需重建时考虑。

## 分片与副本：结构成本控制

- 分片数量与大小：每分片都有元数据与段开销；避免大量小分片。结合数据规模设置 `number_of_shards`，通过 ILM 的 `shrink` 合并到更少分片。
- 副本数（`number_of_replicas`）：降低副本可节省磁盘，但会降低容错能力；生产通常至少 1 副本。
- 示例：小型索引可用：

```json
PUT small-index
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1
  }
}
```

## 生命周期（ILM）：自动化编排

- 策略示例（按规模调整）：

```json
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_size": "50gb", "max_age": "7d" }
        }
      },
      "warm": {
        "actions": {
          "forcemerge": { "max_num_segments": 1 },
          "shrink": { "number_of_shards": 1 }
        }
      },
      "cold": {
        "actions": {
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": { "delete": {} }
      }
    }
  }
}
```

- 注意：`freeze` 在新版本中已有替代方案（如 searchable snapshot/frozen tier），按版本文档选择对应能力。

## 段合并：只读索引上的 `forcemerge`

- 仅对只读索引使用，避免影响写入与查询；可显著减少段文件和开销。

```json
POST my-index/_forcemerge?max_num_segments=1
```

## 快照与归档（按版本能力）

- 使用快照（S3/HDFS/自建对象存储）降低本地磁盘占用；在支持的版本上启用可检索快照，将冷数据转移到低成本存储。

## 监控与水位（防止磁盘打满）

- 使用默认或更严格的磁盘水位防护（按需调整）：

```json
PUT _cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.disk.watermark.low": "85%",
    "cluster.routing.allocation.disk.watermark.high": "90%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
  }
}
```

- 搭配监控告警（如 Prometheus/Elastic Monitoring）对索引大小、段数、合并耗时、快照失败率等关键指标设置阈值。

## 风险与权衡

- `best_compression`：写入与合并更耗 CPU；在写重负载场景谨慎使用。
- 关闭 `norms` 与降低 `index_options`：会影响打分、短语查询与高亮；按查询需求评估。
- 减少副本：降低磁盘但降低容错；需结合可靠性与恢复目标（RPO/RTO）。
- `forcemerge`：仅对只读索引执行；过程耗时且资源占用高，建议窗口期执行。
- 禁用 `_source`：几乎阻断重建与更新能力；一般不推荐。

## 参考

- Elasticsearch 6.8：Tune for disk usage
  - https://www.elastic.co/guide/en/elasticsearch/reference/6.8/tune-for-disk-usage.html
- Elastic Docs：Optimize disk usage
  - https://www.elastic.co/docs/deploy-manage/production-guidance/optimize-performance/disk-usage