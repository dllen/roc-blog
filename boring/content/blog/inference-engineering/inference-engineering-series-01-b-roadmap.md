---
title: "9 步走完 LLM 推理工程（中）：怎么让模型跑得快 / 怎么选引擎 / Prefill 与 Decode 怎么拆"
date: 2026-09-09
description: "9节点路线图中篇，涵盖Inference Optimization五大武器、LLM Serving Engines选型矩阵、Prefill与Decode双SLO拆解。"
tldr: "Continuous Batching是GPU利用率从30%→70%+的关键开关；选引擎优先级vLLM > SGLang > TensorRT-LLM，TGI在2026已被边缘化。"
taxonomies:
  tags: ["LLM", "Inference", "vLLM", "TensorRT", "路线图", "系列教程"]
---

# 9 步走完 LLM 推理工程（中）：怎么让模型跑得快 / 怎么选引擎 / Prefill 与 Decode 怎么拆

> **系列导航**：[上篇·节点 1-3（基础段位）](@/blog/inference-engineering/inference-engineering-series-01-a-roadmap.md) | [下篇·节点 7-9 + 4 周路径](@/blog/inference-engineering/inference-engineering-series-01-c-roadmap.md)
> **完整长文**：[Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md)

---

## 一句话开场

> **上篇**搞清了"模型多大、多重、多慢"；**本篇**搞清"怎么让它跑得快、跑得稳"。

节点 1-3 是"地基"，节点 4-6 是"工具箱 + 选型 + 拆解"——三个最重要的工程问题：

- **节点 4**：除了量化，**还有什么招能让推理更快**？（工具箱）
- **节点 5**：用什么"引擎"跑？（vLLM / SGLang / TensorRT-LLM 选型）
- **节点 6**：为什么 batch=1 慢？**Prefill 和 Decode 怎么拆开优化**？（双 SLO）

---

## 节点 4 · Inference Optimization（推理优化）

**五大武器**（截至 2026 仍然成立）：

| # | 技术 | 提速 | 适用 |
|---|---|---|---|
| 1 | **Continuous Batching** | GPU 利用率 30% → 70%+ | 所有引擎 |
| 2 | **Speculative Decoding** | 2~3× 吞吐 | 有 draft 模型时 |
| 3 | **Kernel Fusion**（FlashAttention / FlashInfer） | 1.5~2× 延迟 | 所有引擎 |
| 4 | **TensorRT-LLM** | 1.3~2× 极致性能 | 高 QPS 大厂 |
| 5 | **Prefix Caching / Prompt Cache** | 多轮对话 5×+ | RAG / 多轮 |

**工程师笔记**：

> 上线新模型前先评估"它的 speculative draft 模型有没有现成的"——这通常是最便宜的 2× 提速。
> **Continuous Batching 是 GPU 利用率从 30% → 70%+ 的关键开关**，任何不支持的引擎都不应该选。
> Prefix Cache 是**RAG 系统的隐藏加速器**——同一批文档的 embedding 请求直接命中缓存。

**资源**：[Top 5 AI Model Optimization Techniques](https://developer.nvidia.com/blog/top-5-ai-model-optimization-techniques-for-faster-smarter-inference/)

---

## 节点 5 · LLM Serving Engines（推理引擎）

**核心选型矩阵**：

| 引擎 | 强项 | 弱项 | 典型场景 |
|---|---|---|---|
| **vLLM** | PagedAttention，continuous batching，生态最广 | 单卡极致不如 TensorRT | 通用在线服务 / RAG |
| **SGLang** | RadixAttention，prefix cache 极致 | 生态较新 | 长 prompt + 多轮对话 |
| **TensorRT-LLM** | NVIDIA 官方图优化，**绝对性能之王** | 编译链复杂，灵活性差 | 大厂高 QPS 生产环境 |
| **LMDeploy** | 国产（商汤），TurboMind 对中文友好 | 海外文档少 | 国内中文场景 |
| **Ollama** | 本地一键跑，单机体验最好 | 不是为生产设计 | 开发机 / 边缘 |
| **llama.cpp** | CPU / Apple Silicon / 嵌入式 | 性能天花板低 | 笔记本 / 树莓派 |

**工程师笔记**：

> **优先级 **vLLM > SGLang > TensorRT-LLM**，TGI 在 2026 已经边缘化。**
> 引擎都内置 OpenAI 兼容 API，**接入现有网关（LiteLLM / Higress / APISIX）即可**，不要造轮子。

**资源**：[11 Production LLM Serving Engines](https://faun.pub/11-production-llm-serving-engines-vllm-vs-tgi-vs-ollama-162874402840)

---

## 节点 6 · Forward Pass & Inference Speed（前向传播拆解）

**两阶段拆分**：

- **Prefill**（处理 prompt）：**compute-bound**，吃 FLOPS
- **Decode**（逐 token 生成）：**memory-bound**，吃带宽
- **优化方向完全不同**：Prefill 靠 tensor parallelism；Decode 靠 KV cache 压缩 + speculative decoding

**两个核心 SLO 指标**：

- **TTFT**（Time To First Token）= 用户看到第一个字的等待时间，**Prefill 决定**
- **TPOT**（Time Per Output Token）= 每个字之间的间隔，**Decode 决定**

**工程师笔记**：

> SLA 写"响应 < 2s"是**错的**——要拆 TTFT < 500ms + TPOT < 50ms，这才是可度量的。
> 监控 dashboard 必须分两条曲线，分别告警——否则一个慢查询就把整个指标糊掉。

**资源**：[How Fast Can We Perform a Forward Pass?](https://bounded-regret.ghost.io/how-fast-can-we-perform-a-forward-pass/)

---

## 国内大厂案例 · 字节豆包 MegaScale + Seed-Inference（节点 4 + 5 范例）

> **字节豆包**公开了他们的推理基础设施：**MegaScale**（大规模训练框架）和 **Seed-Inference**（自研推理引擎，集成 speculative decoding + continuous batching）。
>
> 公开数据：
> - 豆包 1.5 Pro **推理成本相比上一代降低 50%**（字节官方口径）
> - **日处理 token 量突破 1.6 万亿**（2024 年中字节公开数据）
> - Seed-Inference 用 Eagle-style speculative decoding，**实测 throughput 提升 2.4x**（字节技术博客）
>
> **工程师视角**：这就是节点 4 + 5 的工业模板——**Speculative Decoding 解决 decode 慢（节点 6），Continuous Batching 提升 GPU 利用率，自研引擎拿到极致性能**。
>
> 同样的故事在阿里 PAI-Blade（开源，https://github.com/alibaba/PAI-Blade）和 DeepSeek-V2/V3 的推理栈中也能看到——**continuous batching + paged attention + 自研优化**是 2026 年的"铁三角"。

---

## 本篇小结 + 下篇预告

| 节点 | 一句话 | 中篇搞清了吗 |
|---|---|---|
| 4 · Optimization | **跑得快** — 5 大武器 | ✓ |
| 5 · Engines | **选得对** — vLLM / SGLang / TensorRT-LLM | ✓ |
| 6 · Forward Pass | **拆得开** — Prefill / Decode 双 SLO | ✓ |

**下篇预告（下）**：节点 7-9 前沿段位——**MoE 与 Dense 怎么选 / LLM 路由怎么省 70% 成本 / 端到端推理全景**。包括 4 周实操路径 + 一份"工程师 5 分钟速览"对照表。

**互动**：你团队用 vLLM、SGLang 还是 TensorRT-LLM？为什么选这个？评论区对线。

---

*本系列来源：@itsmenikhitha / Twitter (路线图) + 原创工程视角 + 国内大厂案例*
*风格：长文 + 翻译原文 + 中文工程视角 + 结构化对照表*
*系列 2/3 · 9 节点系统段位*
