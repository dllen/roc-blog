---
title: "Guided Decoding 性能实测：2×2 Benchmark 全图（中篇）"
date: 2026-09-09
description: "SqueezeBits 原始 benchmark 完整复现：Book-Info（重复 schema）、GitHub_easy（动态简单）、GitHub_medium（动态复杂）三场景下 XGrammar × LLGuidance × vLLM × SGLang 的吞吐、TPOT、correct rate 数据全面对比。"
tldr: "重复 schema → XGrammar + SGLang（只慢 8%）· 动态复杂 schema → LLGuidance + SGLang（正确率 88% vs 61%）· Framework 选型 > Backend 选型"
taxonomies:
  tags: ["LLM", "Guided-Decoding", "结构化输出", "Benchmark", "XGrammar", "LLGuidance", "SGLang", "系列教程"]
---

# Guided Decoding 性能实测：2×2 Benchmark 全图（中篇）

> **系列导航**：[上篇·Why + 工作流](@/blog/inference-engineering/inference-engineering-series-04-a-guided-decoding.md) | [下篇·选型决策表 + 国内案例](@/blog/inference-engineering/inference-engineering-series-04-c-guided-decoding.md)
> **完整长文**：[公众号文-04-Guided-Decoding-详解](#)

---

## 一句话开场

> **选 XGrammar 还是 LLGuidance？选 vLLM 还是 SGLang？**
> **——没有银弹，只有数据。** 本篇用 SqueezeBits 的原始 benchmark，把三个场景、四个组合的具体数字全部复现给你看。

---

## Part 1 · 实验设置：硬件 + 软件 + 数据集

**所有数据来源**：SqueezeBits Blog · Eunik Park · 2025-09-16

### 硬件环境

| 组件 | 规格 |
|---|---|
| **GPU** | NVIDIA H100 80GB HBM3 |
| **CPU** | Intel Xeon Platinum 8480+（56 核心） |
| **RAM** | 480 GB |
| **CPU-GPU互联** | PCIe |

### 模型配置

| 模型 | 配置 | 备注 |
|---|---|---|
| **Qwen3-8B** | 关闭 reasoning 模式 | 纯 decoder 输出 |
| **Qwen3-32B** | Tensor Parallelism = 2（TP2） | 2 卡并行 |

### 框架版本

| 组件 | 版本 |
|---|---|
| vLLM | v0.10.0 |
| SGLang | 0.5.0rc0 |
| XGrammar | 0.1.21 |
| LLGuidance | 0.7.30 |

### 三类数据集

| 数据集 | 用途 | 特征 |
|---|---|---|
| **JSONSchemaBench** | Schema 多样性与编译鲁棒性 | 覆盖各种 JSON Schema 复杂度 |
| **Book-Info**（1000 请求同 schema） | 重复 schema 场景 | 批量表单填充、天气查询 |
| **GitHub_easy**（每请求 unique schema） | 动态简单 schema | API 响应标准化 |
| **GitHub_medium**（每请求 unique schema） | 动态复杂 schema | 企业级 tool-call |

---

## Part 2 · Schema 鲁棒性：LLGuidance 编译快但失败多

### JSONSchemaBench 编译结果

| Framework | 总 schemas | 成功编译 | 编译失败 | 超时（>10s） | vLLM 过滤拒绝 | **最终通过（Pass ALL）** |
|---|---|---|---|---|---|---|
| XGrammar | ~1700 | 1642 | 32 | 26 | **287** | ~1324 |
| LLGuidance | ~1700 | 1560 | **140** | **0** | 0 | ~1560 |

**关键数据**：
- XGrammar 超时 26 个复杂 schema（CPU 预计算开销过大）
- **LLGuidance 零超时**——懒编译策略在复杂 schema 上天然无超时风险
- XGrammar 的 vLLM 集成过滤拒绝了 287 个 schema——这是 vLLM 的 grammar filter 限制，不是 XGrammar 本身的问题
- LLGuidance 的 schema 覆盖比 XGrammar 多 **18%**（1560 vs 1324）

**工程结论**：
- 如果你的 schema 高度复杂（嵌套很深、有递归引用）→ LLGuidance 覆盖更广
- 如果你的 schema 在 vLLM 上跑 → XGrammar 通过的 schema 集合是 vLLM filter 之后的交集（比纯 XGrammar 少 17%）

---

## Part 3 · Book-Info（重复 Schema）：XGrammar + SGLang 完胜

### 场景设定

1000 个请求，每个请求生成一本书的元数据（author / publisher / ISBN / price 等），**所有请求使用完全相同的 JSON Schema**。

这是典型的生产场景：批量表单填充、固定 tool-call schema、重复的 API 响应格式。

### 吞吐量对比（tokens/sec，Qwen3-8B，并发 512）

| 配置 | 吞吐（tokens/s） | 相对 baseline 变化 |
|---|---|---|
| vLLM baseline（无约束） | 4820 | — |
| vLLM + XGrammar | 2890 | **-40%** |
| vLLM + LLGuidance | 1720 | **-64%** |
| SGLang baseline（无约束） | 5100 | — |
| **SGLang + XGrammar** | **4680** | **-8%** |
| SGLang + LLGuidance | 3200 | **-37%** |

### TPOT 对比（ms/token，Qwen3-32B-TP2，并发 64）

| 配置 | TPOT（ms/token） | 备注 |
|---|---|---|
| vLLM baseline | 15.2 | 正确率 ~72% |
| vLLM + XGrammar | 23.1 | 正确率 **100%**，慢 52% |
| vLLM + LLGuidance | 41.6 | 正确率 100%，慢 **174%** |
| SGLang baseline | 14.8 | 正确率 ~72% |
| **SGLang + XGrammar** | **16.5** | 正确率 **100%**，慢 11% |
| SGLang + LLGuidance | 23.9 | 正确率 100%，慢 61% |

### 核心数据结论

1. **正确率**：无 guided decoding 最高只有 **72%**；XGrammar 和 LLGuidance 都是 **100%**。
2. **XGrammar 在重复 schema 下赢 LLGuidance**：
   - 吞吐：SGLang + XGrammar（4680）比 SGLang + LLGuidance（3200）高出 **46%**
   - TPOT：SGLang + XGrammar（16.5ms）比 SGLang + LLGuidance（23.9ms）低 **31%**
   - 原因：XGrammar 的预计算 + 缓存对重复 schema 极友好，LLGuidance 每次都重新生成 mask
3. **SGLang 在结构化输出场景结构性优于 vLLM**：
   - SGLang + XGrammar 只慢 baseline 8%；vLLM + XGrammar 慢 40%
   - 差别的来源：SGLang 的 per-step mask overlap 机制

---

## Part 4 · GitHub_easy（动态简单 Schema）：LLGuidance 小幅领先

### 场景设定

每个请求使用**不同的 JSON Schema**（来自 GitHub API 文档中的真实 schema），但 schema 结构相对简单。

### 吞吐对比（Qwen3-8B，并发 512）

| 配置 | 吞吐（tokens/s） |
|---|---|
| vLLM + XGrammar | 2100 |
| **vLLM + LLGuidance** | **2480** |
| SGLang + XGrammar | 3800 |
| **SGLang + LLGuidance** | **4420** |

### 正确率

| 配置 | 正确率 |
|---|---|
| 无 guided decoding | 90~94% |
| XGrammar | 96.1%（排除 token 退化后，无效 JSON 格式 2.21%） |
| LLGuidance | **98.2%**（排除 token 退化后，无效 JSON 格式 **0.12%**） |

### 关键洞察

**LLGuidance 在动态 schema 下小幅度领先**——因为每个请求的 schema 都不同，XGrammar 的缓存优势被完全抵消，但 XGrammar 的 context-dependent mask 生成仍然有固定开销。

**LLGuidance 的 token 退化率（0.12%）远低于 XGrammar（2.21%）**——这说明 LLGuidance 的动态 mask 生成更精确，XGrammar 在某些 context-dependent 边界情况下会生成包含非法 token 的 mask。

---

## Part 5 · GitHub_medium（动态复杂 Schema）：LLGuidance 大幅领先

### 场景设定

每个请求使用**不同且复杂的 JSON Schema**（嵌套对象、enum、regex 约束、递归引用）。这是最接近真实企业级 Agent / tool-call 场景的 benchmark。

### 正确率对比（核心指标）

| 配置 | 正确率 |
|---|---|
| 无 guided decoding | **61.1%**（最低点） |
| vLLM + XGrammar | 83.4% |
| vLLM + LLGuidance | 86.7% |
| SGLang + XGrammar | 85.2% |
| **SGLang + LLGuidance** | **88.1%** |

### 吞吐量随时间变化（Qwen3-32B-TP2，并发 64，vLLM）

图 7 的时序数据显示了关键差异：

```
t=0s          t=30s         t=60s         t=90s        t=120s
│              │              │              │              │
无约束   ████████████  ████████████  ████████████  ████████████  （稳定高）
LLGuidance  ████        ██████████    ██████████    ██████████   （稳定偏低）
XGrammar   ████   ▼▼▼  ████   ▼▼▼  ████   ▼▼▼  ████   ▼▼▼    （频繁掉速）
                         ↓              ↓              ↓
                      CPU 卡顿       CPU 卡顿        CPU 卡顿
```

**XGrammar 的频繁掉速**（原文描述为 "erratic behavior with frequent sharp drops"）：
- 原因：当 XGrammar 遇到新的复杂 schema 时，context-dependent mask 生成在 CPU 端产生瓶颈
- 每次遇到新复杂 schema，mask 生成耗时突然增加，导致 GPU 空等
- 这种"stall"是**阵发性的**，难以通过简单的 timeout 掩盖

**LLGuidance 的稳定偏低**：
- 吞吐始终低于无约束 baseline
- 但**没有剧烈波动**——动态 mask 生成的开销是稳定的、可预期的

### 量化数据（SGLang + Qwen3-32B-TP2，并发 64）

| 配置 | 吞吐 tokens/s | TPOT ms/token | 正确率 |
|---|---|---|---|
| SGLang baseline（无约束） | 3100 | 14.8 | 61.1% |
| **SGLang + LLGuidance** | **2100** | 21.3 | **88.1%** |
| SGLang + XGrammar | 1680 | 28.6 | 85.2% |

**LLGuidance 相对 XGrammar**：吞吐高 25%，TPOT 低 26%，正确率高 3%。

---

## Part 6 · 三场景横向对照表

| 维度 | Book-Info（重复简单） | GitHub_easy（动态简单） | GitHub_medium（动态复杂） |
|---|---|---|---|
| **推荐 backend** | **XGrammar** | LLGuidance（小优） | **LLGuidance** |
| **推荐 framework** | **SGLang** | **SGLang** | **SGLang** |
| **正确率（无约束）** | 72% | 90~94% | **61.1%** |
| **正确率（有约束）** | 100% | 96~98% | 83~88% |
| **XGrammar 相对 LLGuidance** | 吞吐 +46%，TPOT -31% | 吞吐 -18% | 吞吐 -25% |
| **framework 影响** | SGLang vs vLLM 差距大 | SGLang vs vLLM 差距大 | SGLang vs vLLM 差距大 |

---

## 工程师笔记 · 三栏视角

| 维度 | 要点 |
|---|---|
| **后端** | GitHub_medium 场景下 vLLM + XGrammar 会产生阵发性 CPU 卡顿（SGLang 无此问题）；测吞吐时要同时看时序图的稳定性 |
| **Ops** | 如果你的场景是"固定 schema 批量请求"（Book-Info 类），XGrammar + SGLang 可以做到只慢 8-11%；如果是"每个请求 schema 都不同"（复杂 tool-call），LLGuidance 是必选 |
| **架构** | 选型优先级：Framework（SGLang）> Backend（XGrammar vs LLGuidance）；不要在 vLLM 上浪费太多时间调 grammar backend |

---

## 本篇小结 + 下篇预告

| 数据 | 值 |
|---|---|
| 重复简单 schema | XGrammar + SGLang：吞吐只慢 8%，TPOT 只慢 11% |
| 动态简单 schema | LLGuidance 小幅领先；SGLang 结构性强于 vLLM |
| 动态复杂 schema | LLGuidance 大幅领先；XGrammar 有阵发性 CPU 卡顿 |
| 正确率底线 | 无 guided decoding 最低可到 61.1%；有约束最高 100% |

**下篇预告（下）**：**选型决策表**（if-then 规则）+ 国内 Function Call / JSON 提取案例 + 性能调优 checklist。

---

*本系列来源：SqueezeBits Blog · Guided Decoding Performance on vLLM and SGLang (https://blog.squeezebits.com/guided-decoding-performance-vllm-sglang) · 2025-09-16 · Eunik Park*
*风格沿用：[系列-02-B-KVCache-中篇](@/blog/inference-engineering/inference-engineering-series-02-b-kvcache.md) · Benchmark 数据复现 + 工程师视角*
*系列 2/3 · Guided Decoding Benchmark 篇*
