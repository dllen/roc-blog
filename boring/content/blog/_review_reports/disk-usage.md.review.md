# 技术评审报告：disk-usage.md

- 发现问题：高 6 / 中 0 / 低 0
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L34-L41 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 2 | L49-L71 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 3 | L88-L96 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 4 | L102-L130 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 5 | L138-L140 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 6 | L150-L159 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |

## 建议批注写法（可直接复制到原文对应位置）

### Issue 1（高）
<!-- TODO(高): JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

### Issue 2（高）
<!-- TODO(高): JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

### Issue 3（高）
<!-- TODO(高): JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

### Issue 4（高）
<!-- TODO(高): JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

### Issue 5（高）
<!-- TODO(高): JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

### Issue 6（高）
<!-- TODO(高): JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) -->
> **Note:** 修正为合法 JSON（注意逗号/引号/注释）。

## 重构版本（可直接替换原文代码块）

### Issue 1：将 Console 请求写法从 `json` 改为 `http`

```http
PUT my-index/_settings
{
  "index": {
    "codec": "best_compression"
  }
}
```

### Issue 2：创建索引与映射（Kibana Dev Tools/Console 风格）

```http
PUT my-index
{
  "settings": {
    "index.codec": "best_compression"
  },
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

### Issue 3：分片与副本设置（请求行不是 JSON）

```http
PUT small-index
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1
  }
}
```

### Issue 4：ILM 策略（请求行不是 JSON）

```http
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "50gb",
            "max_age": "7d"
          }
        }
      },
      "warm": {
        "actions": {
          "forcemerge": {
            "max_num_segments": 1
          },
          "shrink": {
            "number_of_shards": 1
          }
        }
      },
      "cold": {
        "actions": {
          "freeze": {}
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### Issue 5：`forcemerge` 请求没有 JSON body

```http
POST my-index/_forcemerge?max_num_segments=1
```

### Issue 6：集群设置（请求行不是 JSON）

```http
PUT _cluster/settings
{
  "persistent": {
    "cluster.routing.allocation.disk.watermark.low": "85%",
    "cluster.routing.allocation.disk.watermark.high": "90%",
    "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
  }
}
```
