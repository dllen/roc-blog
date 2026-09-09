---
title: "9 步走完 LLM 推理工程（下）：MoE vs Dense、LLM 路由、端到端全景 + 4 周实操路径"
date: 2026-09-09
description: "9节点路线图下篇，涵盖MoE vs Dense选型、LLM路由三大策略、端到端推理7层链路，附4周实操路径与速览对照表。"
tldr: "80%的生产请求不需要最强模型，LLM路由可省50~70%成本；路由+缓存+fallback=AI Gateway三件套，跟传统微服务网关同构。"
taxonomies:
  tags: ["LLM", "Inference", "MoE", "Routing", "路线图", "系列教程"]
---

# 9 步走完 LLM 推理工程（下）：MoE vs Dense、LLM 路由、端到端全景 + 4 周实操路径

> **系列导航**：[上篇·节点 1-3（基础段位）](@/blog/inference-engineering/inference-engineering-series-01-a-roadmap.md) | [中篇·节点 4-6（系统段位）](@/blog/inference-engineering/inference-engineering-series-01-b-roadmap.md)
> **完整长文**：[Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md)

---

## 一句话开场

> **上篇**搞清"模型多大"；**中篇**搞清"跑得快"；**本篇**搞清"选得对 / 串得通 / 省得下来"。

节点 7-9 是"前沿段位"——三个最实战的问题：

- **节点 7**：**MoE 还是 Dense**？什么时候上 MoE，什么时候不上？
- **节点 8**：**LLM 路由**怎么省 50~70% 成本？
- **节点 9**：**端到端推理**——从 HTTP 请求到 GPU 指令，一条请求到底经过哪些层？

最后给一份 **4 周实操路径**，看完就能动手。

---

## 节点 7 · MoE vs Dense Models（混合专家 vs 密集模型）

**核心权衡**：

| 维度 | Dense | MoE |
|---|---|---|
| **推理显存** | 全参数常驻 | 全专家常驻（仍需全部加载） |
| **计算量** | 每个 token 算全部参数 | 每个 token 只算 `top-k` 专家（2/4/8） |
| **小 batch 表现** | 稳定 | **专家并行通信开销大，可能反慢** |
| **大 batch 表现** | 稳定 | 吞吐优势明显 |

**工程师笔记**：

> **高并发 + 长 prompt → Dense 占优**；**低并发 + 短 prompt → MoE 占优**。
> MoE 必须用专门的 serving 框架（DeepSeek-MoE / vLLM-EP），传统 vLLM 跑 MoE 效率减半。
> 私有化部署显存吃紧时，**宁愿选 Dense-13B 而不是 MoE-8x7B**——后者需要 96GB+ 显存。

**资源**：[MoE vs Dense Models: Inference](https://epoch.ai/gradient-updates/moe-vs-dense-models-inference)

---

## 节点 8 · LLM Routing（大模型路由）

**三种主流路由策略**：

1. **规则路由**：按 token 数、用户等级分流——简单但脆弱
2. **成本优先路由**：用便宜模型打头阵，质量不达标时升级——动态 fallback
3. **学习式路由**：训练一个"路由器模型"，预测最优目标——`RouteLLM` / `OpenRouter` / `NotDiamond`

**工程师笔记**：

> **80% 的生产请求其实不需要最强模型**，路由可以省 50~70% 的成本。
> 路由层要"可观测"——记录"为什么这条请求被路由到了 X 模型"，否则出问题时无法归因。
> **LLM 路由 + 缓存 + fallback = AI Gateway 的三件套**，跟传统微服务网关同构。

**资源**：[LLM Routing](https://liuxunzhuo.com/llm-routing/)

---

## 节点 9 · End-to-End LLM Inference（端到端推理全景）

**完整链路**：

1. **API 网关**：鉴权、限流、计费、prompt 缓存
2. **调度器**：continuous batching 决策，新请求排队
3. **Tokenizer**：BPE/SentencePiece，文本 → token IDs
4. **Prefill**：整段 prompt 一次性算，建立 KV cache
5. **Decode loop**：每步 sample 一个 token → 写入 KV cache → 终止判断
6. **Detokenizer**：token IDs → 文本 → 流式返回
7. **后处理**：tool call 解析、logprobs、usage 计费回写

**工程师笔记**：

> **Tracing 必须打通端到端**——OpenTelemetry 配 GenAI semantic conventions。
> 故障定位按链路分层：**网关 → 引擎 → kernel → GPU**。不要一上来就跑 `nvidia-smi`。

**资源**：[How LLM Inference Works](https://arpitbhayani.me/blogs/how-llm-inference-works)

---

## 国内大厂案例 · 阿里 PAI-Blade + Qwen 全栈（节点 7-9 范例）

> **阿里 PAI-Blade** 是阿里云 PAI 团队开源的 LLM 推理引擎（https://github.com/alibaba/PAI-Blade），把节点 7-9 全栈打通：
>
> - **节点 7**：原生支持 **Qwen2.5 系列 MoE（Qwen2.5-57B-A14B 等）**，自动专家并行
> - **节点 8**：内置 **LLM Router**，基于规则 + 成本的混合路由策略
> - **节点 9**：**端到端 tracing** + 监控 dashboard，可观测性完整
>
> 公开数据：Qwen 系列在 PAI-Blade 上 **batch=32 时吞吐比原生 HF Transformers 提升 8x**（阿里官方 benchmark）。
>
> Qwen 模型默认使用 **GQA（节点 3 进阶）**，KV cache 显存减少 4~8x；同时支持 **YARN 长度外推**（context 从 4K 扩到 128K 只需调参）。
>
> **工程师视角**：这就是"9 节点路线图"在国内工业界的真实落地图——**MoE + 路由 + 端到端可观测**，缺一不可。

---

## 4 周实操路径（工程师可直接执行）

> 看完不动手，等于没看。

- **第 1 周**：跑通 `vllm serve meta-llama/Llama-3-70B-Instruct --quantization awq`，观察 `gpu_memory_utilization`、`max_num_seqs` 参数对吞吐的影响
- **第 2 周**：用 `genai-bench` / `vllm bench` 测 TTFT / TPOT / tokens/s，画曲线
- **第 3 周**：上 Speculative Decoding（用 EAGLE-2 或 Medusa），对比基准
- **第 4 周**：搭一个简易 AI Gateway（LiteLLM + Redis 缓存），跑通路由 + 缓存

---

## 工程师 5 分钟速览对照表（收藏转发）

| 维度 | 你必须能答出来的问题 | 实战对应 |
|---|---|---|
| **显存** | 70B FP16 占多少？INT4 后多少？KV cache 在 seq=8k, batch=32 时多少？ | 选卡、容量规划 |
| **吞吐** | `tokens/s/$` 怎么算？continuous batching 为啥是 GPU 利用率开关？ | GPU 采购、SLA |
| **延迟** | TTFT 和 TPOT 是什么？分别由 Prefill / Decode 哪个决定？ | 线上 SLA、用户体验 |
| **优化** | Speculative decoding 提速多少？什么场景掉质量？FlashAttention 省什么？ | 性能调优 |
| **引擎** | vLLM / SGLang / TensorRT-LLM 怎么选？什么时候必须上 EP？ | 架构选型 |
| **架构** | LLM Router 三种策略？AI Gateway 三件套是什么？ | 平台设计、成本优化 |

---

## 系列总结

> **9 个节点，3 篇系列，1 张心智图，1 份实操路径**——这就是 2026 年做 Inference Engineer 的"地图"。

| 段位 | 节点 | 一句话 |
|---|---|---|
| **基础** | 1-3 | 算清楚 / 压得动 / 存下来 |
| **系统** | 4-6 | 跑得快 / 选得对 / 拆得开 |
| **前沿** | 7-9 | 懂得选 / 省得下来 / 串得通 |

**收藏本文 + 系列 + 姊妹篇《KV Cache 第一性原理》，按图索骥，每周精进一个节点。半年后，你就是团队里最懂"模型怎么跑起来"的那个人。**

---

## 互动 & 系列预告

**互动**：你团队在做 LLM 推理时，最愿意投入精力优化的方向是什么？A. 显存 B. 吞吐 C. 延迟 D. 成本。评论区选。

**姊妹篇**：[《为什么 ChatGPT 第一个字永远慢：从第一性原理拆解 KV Cache》](@/blog/inference-engineering/inference-engineering-series-02-a-kvcache.md)——把节点 3 用 6 段图解 + 算账展开成一篇深度长文。

---

*本系列来源：@itsmenikhitha / Twitter (路线图) + 原创工程视角 + 国内大厂案例*
*风格：长文 + 翻译原文 + 中文工程视角 + 结构化对照表*
*系列 3/3 · 9 节点前沿段位 + 实操路径*
