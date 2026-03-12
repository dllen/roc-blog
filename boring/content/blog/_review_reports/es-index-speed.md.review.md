# 技术评审报告：es-index-speed.md

- 发现问题：高 4 / 中 0 / 低 0
- front-matter：有

## 问题清单

| # | 位置 | 类型 | 问题 | 修改建议 | 优先级 |
|---:|:---:|:---:|---|---|:---:|
| 1 | L37-L44 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 2 | L48-L56 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 3 | L60-L68 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |
| 4 | L77-L84 | 技术准确性 | JSON 片段无法解析：Expecting value: line 1 column 1 (char 0) | 修正为合法 JSON（注意逗号/引号/注释）。 | 高 |

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

## 重构版本（可直接替换原文代码块）

原文的代码块属于 Kibana Dev Tools/Console 风格（请求行 + JSON body），不应标注为 `json`。建议将 fence 语言改为 `http`，并保留请求行。

### Issue 1：刷新间隔（`refresh_interval`）

```http
PUT my-index/_settings
{
  "index": {
    "refresh_interval": "30s"
  }
}
```

### Issue 2：初始加载禁用刷新与副本（窗口期策略）

```http
PUT my-index/_settings
{
  "index": {
    "refresh_interval": "-1",
    "number_of_replicas": 0
  }
}
```

### Issue 3：加载完成后恢复设置

```http
PUT my-index/_settings
{
  "index": {
    "refresh_interval": "1s",
    "number_of_replicas": 1
  }
}
```

### Issue 4：索引缓冲设置（集群级）

```http
PUT _cluster/settings
{
  "persistent": {
    "indices.memory.index_buffer_size": "20%"
  }
}
```
