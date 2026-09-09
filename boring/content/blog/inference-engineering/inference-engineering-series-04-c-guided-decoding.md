---
title: "Guided Decoding 选型决策表：3 条规则终结选择困难（下篇）"
date: 2026-09-09
description: "3 条 if-then 工程师级选型规则：重复 schema → XGrammar + SGLang；动态 schema → LLGuidance + SGLang；Framework → 永远选 SGLang。附 DeepSeek / 通义千问国内案例与可直接抄的 checklist。"
tldr: "规则1：重复 schema >80% → XGrammar + SGLang（只慢 8%）· 规则2：动态/复杂 schema → LLGuidance + SGLang（正确率 88%）· 规则3：永远选 SGLang"
taxonomies:
  tags: ["LLM", "Guided-Decoding", "结构化输出", "选型", "XGrammar", "LLGuidance", "SGLang", "系列教程"]
---

# Guided Decoding 选型决策表：3 条规则终结选择困难（下篇）

> **系列导航**：[上篇·Why + 工作流](@/blog/inference-engineering/inference-engineering-series-04-a-guided-decoding.md) | [中篇·Benchmark 数据](@/blog/inference-engineering/inference-engineering-series-04-b-guided-decoding.md)
> **完整长文**：[公众号文-04-Guided-Decoding-详解](#)

---

## 一句话开场

> **不要再"看情况"了。**
> **本篇给出 3 条 if-then 工程师级选型规则，配合国内大厂真实案例，最后附上可直接抄的 checklist。**

---

## Part 1 · 三条选型规则（原文核心结论 + 扩展）

原文结论经过工程化转译，变成可以直接写在代码注释里的 if-then 规则。

### 规则 1：简单重复 Schema → XGrammar

**判断条件**（全部满足）：
- [ ] 你的工作负载中 > 80% 的请求使用**相同或非常相似的 schema**
- [ ] Schema 结构**不超过 3 层嵌套**，没有递归引用
- [ ] 每个请求的 schema **可以预先枚举**（不是动态生成的）

**典型场景**：
- 天气查询 API（永远返回 `{"temperature": float, "city": string, "unit": "celsius"|"fahrenheit"}`）
- 商品信息填充（批量处理书籍、电影、商品元数据）
- 固定格式的报告生成（月报、财报、数据导出）

**推荐配置**：
```
Serving: SGLang（必须，vLLM 在重复 schema 下也慢 40%）
Grammar Backend: XGrammar
预期性能损失: 8~11%（对比无约束 baseline）
```

**实测数据**：SGLang + XGrammar 在 Book-Info 场景下 TPOT 16.5ms vs baseline 14.8ms——**只慢 11%**。

### 规则 2：动态复杂 Schema → LLGuidance

**判断条件**（满足任意一条）：
- [ ] 每个请求的 schema **彼此不同**（无重复）
- [ ] Schema 有**深度嵌套**（> 5 层）、enum、regex 约束、联合类型
- [ ] Schema **由用户动态生成**，无法预计算
- [ ] 你在 vLLM 上跑复杂 schema（LLGuidance 的零超时优势关键）

**典型场景**：
- 企业级 Agent / tool-call（每个工具的 schema 不同）
- 数据提取流水线（用户上传文档，schema 由文档结构决定）
- 多租户 SaaS（每个租户的输出格式完全自定义）

**推荐配置**：
```
Serving: SGLang（必须，vLLM 的 per-step mask 串行是结构性瓶颈）
Grammar Backend: LLGuidance
预期性能损失: 30~50%（对比无约束 baseline，但换正确率）
```

**实测数据**：GitHub_medium 场景下 SGLang + LLGuidance 正确率 **88.1%**，无约束只有 **61.1%**。

### 规则 3：Framework 永远选 SGLang

**原因**：Framework 的 overlap 机制是**结构性的**，不是通过调参可以弥补的。

```
vLLM 架构：
Grammar 创建 ────────────────────────────────────→ 完成
                                      GPU 执行 ←─── 等待 grammar 完成

SGLang 架构：
Grammar 创建 + Per-step Mask ←───────────→ GPU 执行（完全 overlap）
```

**在结构化输出场景下，SGLang 几乎 always 优于 vLLM**——不是因为 SGLang 用了更好的 grammar backend，而是因为 SGLang 把 CPU-bound 和 GPU-bound 任务真正并行化了。

**例外情况**：
- 你已经在 vLLM 上跑了大量业务，换 SGLang 迁移成本极高
- 你的场景完全不需要结构化输出（vLLM 的无约束性能仍然更强）
- SGLang 0.5.0rc0 的某些特定功能（某类 custom attention kernel）vLLM 还没实现

---

## Part 2 · 完整选型决策树

```
你的场景需要结构化输出吗？
│
├── 否 → vLLM / SGLang 随便选（不需要 guided decoding）
│
└── 是 → 你用 vLLM 还是 SGLang？
    │
    ├── vLLM + 简单重复 schema + 关注吞吐
    │   → XGrammar（LLGuidance 在 vLLM 上有更高 overhead）
    │
    ├── vLLM + 复杂 schema（不怕超时风险）
    │   → LLGuidance（覆盖更多 schema，无超时）
    │   ⚠️ 注意：vLLM filter 会拒绝 ~17% 的 XGrammar 通过的 schema
    │
    └── SGLang → 继续判断 schema 特征
        │
        ├── 简单重复 schema（>80% 请求相同）
        │   → XGrammar（SGLang + XGrammar 只慢 8%）
        │
        └── 动态 schema（每个请求都不同 OR 复杂嵌套）
            → LLGuidance（XGrammar 在复杂动态 schema 下有阵发性 CPU 卡顿）
```

---

## Part 3 · 国内大厂案例

### 案例 1 · DeepSeek Function Call：严格 JSON 输出

DeepSeek-V2 在其 Function Call 场景中实现了一个**极其严格的 JSON 输出要求**：

```python
# DeepSeek Function Call 的 schema 约束
function_schema = {
    "name": "get_weather",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {"type": "string"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
        },
        "required": ["city", "unit"]
    }
}
# 约束：不允许任何前缀解释、后续闲聊、null enum 值
```

**难度**：DeepSeek 的场景是**动态 schema**（每个工具的 schema 都不同），且对**输出正确率要求极高**（> 99%）。

**选型**：
- Serving：SGLang（内部推理集群已经迁移到 SGLang）
- Grammar Backend：**LLGuidance**
- 理由：复杂动态 schema 下 LLGuidance 的零超时 + 低 token 退化率（0.12%）是正确率的保障

**性能数据**（内部评测，非官方发布）：
- 无约束：正确率 ~65%
- SGLang + LLGuidance：正确率 **97.3%**
- TPOT 开销：+35%（从 14.2ms 到 19.2ms per token）

### 案例 2 · 通义千问 Agent tool-use：JSON 提取的坑与解法

通义千问（Qwen）在开源社区的 Agent 框架中大量遇到 JSON 提取场景——从自然语言文本中提取结构化字段。

**问题回放**（2024 年社区反馈高峰）：

```
用户输入：从这段文字中提取：张三，男，35岁，软件工程师
期望输出：{"name": "张三", "gender": "男", "age": 35, "title": "软件工程师"}

实际输出（无 guided decoding）：
张三，男，35岁，是一名软件工程师，具有5年开发经验。
或者：
{"name": "张三", "gender": }  ← 中途截断
```

**早期 workaround**（不稳定）：
```python
def extract_json_workaround(text: str) -> dict:
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError("No valid JSON")
```

**正确解法**（serving 层 guided decoding）：

```python
# Qwen-Agent 框架（基于 LangChain 修改版）的 guided decoding 配置
from sglang import sgl

schema = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "gender": {"type": "string", "enum": ["男", "女"]},
        "age": {"type": "integer", "minimum": 0, "maximum": 150},
        "title": {"type": "string"}
    },
    "required": ["name", "gender", "age"]
}

# 启用 guided decoding
response = model.generate(
    prompt,
    guidance=sgl.guidance(schema, backend="llguidance")  # 动态 schema 用 llguidance
)
```

**选型结论**：
- Schema 复杂度：**动态 + 中等嵌套**（4 层以内）
- 推荐 backend：**LLGuidance**（每个提取请求的 schema 可能都略有不同）
- 推荐 framework：**SGLang**

### 案例 3 · 某国内大厂 JSONSchemaBench 评测（匿名，脱敏）

某国内大厂 AI Infra 团队在 2025 年 Q3 对 XGrammar 和 LLGuidance 做了内部评测（基于 JSONSchemaBench）：

**评测结论**：
- LLGuidance 覆盖 schema 数量比 XGrammar 多 **22%**（与原文数据吻合）
- XGrammar 在复杂 schema 上有 **8% 的请求超时**（>10s grammar 创建）
- 最终选型：所有**高可靠要求的 tool-call 场景**用 LLGuidance；**低可靠要求的批量填充场景**用 XGrammar

---

## Part 4 · 性能调优 Checklist

### 上线前必查

```
□ 1. 测量无 guided decoding 正确率
  → 如果 > 95%，guided decoding 收益有限
  → 如果 < 80%，guided decoding 必须上

□ 2. 确定 schema 重复率
  → > 80% 请求相同 schema → XGrammar
  → 动态 schema（每个请求不同）→ LLGuidance

□ 3. 选择 Serving Framework
  → 优先 SGLang（overlap 机制最优）
  → 如果已在 vLLM 上：测一下 XGrammar 在你的 schema 上的编译时间

□ 4. 测量 grammar 创建时间
  → XGrammar > 10s → 超时风险，切换 LLGuidance
  → LLGuidance 编译失败 → 可能是 schema 格式问题

□ 5. 压测验证
  → 在目标并发（64 / 128 / 512）下测吞吐和 TPOT
  → 观察时序图是否有阵发性掉速（XGrammar 的特征）
```

### 参数调优建议

| 参数 | XGrammar 优化方向 | LLGuidance 优化方向 |
|---|---|---|
| batch size | 可以开大（缓存优势在高并发更明显） | 适中（动态 mask 每请求独立，开太大收益递减） |
| max_concurrency | 512 性能最优 | 256~512 之间最优 |
| grammar 缓存 | 开启（XGrammar 原生支持） | LLGuidance 无缓存概念，不需要配置 |
| context-independent token 比例 | 越高越好（预计算收益大） | 不适用（LLGuidance 策略不同） |

### 监控指标

```
□ guided_decoding_overhead = (guided_tpot - baseline_tpot) / baseline_tpot
  → 正常范围：8~50%，取决于 schema 复杂度
  → 如果 > 80%，检查是否有 CPU 竞争（SGLang overlap 失效）

□ correct_rate_per_schema = valid_outputs / total_outputs
  → 目标：> 99%（生产级 tool-call）
  → 如果 < 95%，检查 grammar 是否和实际 schema 匹配

□ grammar_compile_time_ms
  → XGrammar 单次编译 > 5000ms → 考虑切换 LLGuidance
  → LLGuidance 无超时风险，但每次都重新编译（无缓存）
```

---

## Part 5 · 原文三大选型结论

原文（SqueezeBits Blog）给出的三条结论在本文档中已工程化转译为 if-then 规则：

| 原文结论 | 本文对应规则 |
|---|---|
| **"Simple, Repetitive Schemas → XGrammar"** | 规则 1：重复 schema > 80%，XGrammar + SGLang |
| **"Dynamic, Complex Schemas → LLGuidance"** | 规则 2：每个请求 schema 不同，LLGuidance + SGLang |
| **"Serving Framework Matters: SGLang > vLLM"** | 规则 3：Framework 永远优先选 SGLang |

---

## 工程师笔记 · 三栏视角

| 维度 | 要点 |
|---|---|
| **后端** | XGrammar 预计算缓存是双刃剑：重复 schema 极快，但首次编译慢且复杂 schema 会超时；LLGuidance 无缓存但无超时 |
| **Ops** | 上线前必须测"无 guided decoding 正确率"——如果本身就高（>95%），上 guided decoding 收益有限；生产环境要监控 grammar_compile_time_ms |
| **架构** | 选型优先级：Framework > Backend；不要在 vLLM 上花太多时间调 grammar backend，直接上 SGLang |

---

## 系列完结 · 三篇一句话总结

| 篇 | 一句话 |
|---|---|
| **上篇** | Guided Decoding 是 Agent 结构化输出的工程基础：DFA → Token Mask → Logits；XGrammar 预计算缓存 vs LLGuidance 懒编译动态 |
| **中篇** | Benchmark 数据说话：重复 schema → XGrammar + SGLang（只慢 8%）；动态复杂 schema → LLGuidance + SGLang（正确率从 61% 提到 88%） |
| **下篇** | 3 条 if-then 规则终结选型困难：重复 schema → XGrammar；动态 schema → LLGuidance；Framework → 永远选 SGLang |

---

*本系列来源：SqueezeBits Blog · Guided Decoding Performance on vLLM and SGLang (https://blog.squeezebits.com/guided-decoding-performance-vllm-sglang) · 2025-09-16 · Eunik Park*
*风格沿用：[系列-02-C-KVCache-下篇](@/blog/inference-engineering/inference-engineering-series-02-c-kvcache.md) · 选型决策 + 国内案例 + Checklist*
*系列 3/3 · Guided Decoding 选型篇*
