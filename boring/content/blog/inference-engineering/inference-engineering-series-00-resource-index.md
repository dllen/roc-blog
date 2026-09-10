---
title: "AI 学习系列 · Inference Engineering 第二期素材盘点（2026-09-09）"
date: 2026-09-09
description: "Inference Engineering第二期11篇素材索引，含系列-03至06四系列结构总览、编辑决策清单与优先级建议。"
tldr: "本篇是母索引，系列-03至06共20个新文件的后续加工均以此为导航基准，长期保留。"
taxonomies:
  tags: ["LLM", "Inference", "AI学习系列", "素材盘点", "剪藏整理"]
---

# AI 学习系列 · Inference Engineering 第二期素材盘点

> **本文性质**：今天 (2026-09-09) 从剪藏目录（vault `Clippings/`）抓取的 **11 篇素材** 的归并 / 定级 / 编排笔记，决定每个文件归入哪个子系列、是否需要再加工、优先级如何。
> **本文不是文章本身**，而是后续 4 个新子系列的**总索引 + 编辑决策记录**——避免下次再看到同一份素材时重新判断。
> **风格沿用** [Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md)：长文 + 翻译/导读 + 中文工程视角 + 结构化对照表 + 工程师笔记。

---

## 〇、为什么是"Inference Engineering 第二期"

上一期（[Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md) + [系列-02 KVCache 三部曲](@/blog/inference-engineering/inference-engineering-series-02-a-kvcache.md)）已经把 **路线图（节点 1-9）+ KV Cache 第一性原理** 打通。这次新增的 11 篇补齐了另外 4 个**第一性原理级别**的长文：

| 子系列 | 对应 Roadmap 节点 | 状态 |
|---|---|---|
| **系列-03 · Attention 内存效率（Paged Attention）** | 节点 3 / 4（KV Cache + 推理优化）| 已完成（2026-09-09） |
| **系列-04 · 结构化生成（Guided Decoding）** | 节点 5 / 8（推理引擎 + 路由）| 已完成（2026-09-09） |
| **系列-05 · 分布式训练（DP → ZeRO → FSDP → Ray）** | 节点 7（密集 vs MoE）| 已完成（2026-09-09） |
| **系列-06 · 后训练（Post-Training 101）** | 新增独立节点 | 已完成（2026-09-09） |

加上已经完成的 **系列-01（路线图）+ 系列-02（KV Cache）**，整个 **Inference Engineering 大系列** 6 卷结构全部完成——可以作为长期公众号 / 博客 / 内部培训的核心素材。

**第二期共产出 20 个新文件**（4 系列 × {3 篇 Vault 长文 + 1 篇公众号凝缩版 + 1 个配图大纲}），合计约 5,860 行；详见各子系列文末 footer 与本站 README（一级知识库 01-知识库 / AI与编程 / Inference-Engineering 子目录索引）。

## 〇补、SVG 配图升级（2026-09-09 第二轮）

第二轮升级把 4 个 `公众号文-XX-配图大纲.md` 里的 ASCII art / Mermaid 描述升级为 **真实 SVG 图片**：

| 系列 | SVG 数 | 封面图 | 累计大小 |
|---|---|---|---|
| 系列-03 Paged Attention | 4 | [03-01-cover-block-table.svg](/img/inference-engineering/series-03-paged-attention/03-01-cover-block-table.svg) | 57 KB |
| 系列-04 Guided Decoding | 3 | [04-01-cover-three-step-pipeline.svg](/img/inference-engineering/series-04-guided-decoding/04-01-cover-three-step-pipeline.svg) | 24 KB |
| 系列-05 Distributed Training | 4 | [05-01-cover-355-years-gpu-progression.svg](/img/inference-engineering/series-05-distributed-training/05-01-cover-355-years-gpu-progression.svg) | 34 KB |
| 系列-06 Post-Training 101 | 6 | [06-01-cover-lifecycle-five-rewards.svg](/img/inference-engineering/series-06-post-training/06-01-cover-lifecycle-five-rewards.svg) | 36 KB |
| **合计** | **17** | | **151 KB** |

**SVG 设计规范（沿用系列-02 风格）**：暗色背景 `#1A1F2E` + 暖橙 `#F59E42` / 砖红 `#E04E3D` / 雾蓝 `#9CA9BD` 8 色板；`viewBox` + `width="100%" height="auto"` 适配公众号；统一 `defs/marker` 箭头定义；`role="img"` + `<title>` + `<desc>` 无障碍；中文 `"PingFang SC", "Microsoft YaHei"`、数字 `JetBrains Mono` 字体回退链。

**配图大纲更新**：4 个 `公众号文-XX-配图大纲.md` 的 frontmatter 都加了 `images:` 字段，并在每个视觉章节前插入 Obsidian wikilink `![图 X](相对路径.svg)` 嵌入块；ASCII / Mermaid 设计存档保留不删。

---

## 一、11 篇素材速览

| # | 文件 | 来源 | 字数 | 主题归属 | 状态 |
|---|---|---|---|---|---|
| 1 | [KV Caching in LLMs, Clearly Explained](#) | @akshay_pachaar (X 长推) | 7.9K / 128 行 | **系列-02** KV Cache 第一性原理 | 已合并入 [Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md) 第六章 |
| 2 | [Paged Attention from First Principles A View Inside vLLM](#) | Hamza El-Shafie (bearblog.dev) | 50K / 432 行 | **系列-03** Paged Attention | 待写 |
| 3 | [Guided Decoding Performance on vLLM and SGLang](#) | SqueezeBits (blog) | 18K / 154 行 | **系列-04** Guided Decoding | 待写 |
| 4 | [From Single GPU to Clusters A Practical Journey into Distributed Training with PyTorch and Ray](#) | Suman Debnath (debnsuma.github.io) | 89K / 1669 行 | **系列-05** Distributed Training | 待写 |
| 5 | [Post-training 101  Tokens for Thoughts](#) | Han Fang + Karthik (Notion / Tokens for Thoughts) | 69K / 881 行 | **系列-06** Post-Training 101 | 待写 |
| 6 | [Post by @itsmenikhitha on X](#) | @itsmenikhitha 路线图原帖 | 4.2K | **系列-01** 路线图原帖 | 已并入 [Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md) |
| 7 | [Post by @itsmenikhitha on X 1](#) | 同上（第 2 张 status） | 3.7K | 同上（重复切片）| 重复，保留作存档 |
| 8 | [Post by @itsmenikhitha on X 2](#) | 同上（第 3 张 status） | 3.7K | 同上（重复切片）| 重复，保留作存档 |
| 9 | [Post by @itsmenikhitha on X 3](#) | 同上（第 4 张 status） | 3.5K | 同上（重复切片）| 重复，保留作存档 |
| 10 | [Post by @itsmenikhitha on X 4](#) | 同上（第 5 张 status） | 3.7K | 同上（重复切片）| 重复，保留作存档 |
| 11 | [Post by @itsmenikhitha on X 5](#) | 同上（第 6 张 status） | 3.7K | 同上（重复切片）| 重复，保留作存档 |

> **11 篇 = 5 篇高质量长文（每个一子系列）+ 6 篇同一 Twitter thread 的 6 个 status_id 切片**。X 切片的差异仅在节点 2 / 3 / 5 的链接清单微调，**主体内容 100% 重复**，处理时取最长版（`Post by @itsmenikhitha on X.md`）作为单一来源即可。

---

## 二、5 篇长文核心摘要（每篇 200~300 字要点）

> 摘要目的是**写各系列时不用再回头读全文**——只看摘要 + 关键公式 + 数据点就能下笔。每节附"对哪个子系列有用、写作时重点取哪段"的编辑指引。

### 2.1 Paged Attention from First Principles（系列-03 主素材）

- **核心论点**：KV cache 是 LLM 推理的关键瓶颈，传统 serving 系统浪费 **60-80%** 的 KV 显存；PagedAttention（vLLM，arXiv:2309.06180）借鉴 OS 虚拟内存思想，把 KV cache 切成定长 KV block，用 block table 维护逻辑→物理映射——**显存浪费 < 4%，吞吐 2-3x**。
- **论证路径**（5 段，写作时可作系列骨架）：
  1. **训练 vs 推理**：训练 compute-bound（一眼并行），推理 memory-bound + sequential。
  2. **两阶段**：prefill（compute-bound，整段 prompt 一次性走完）+ decode（memory-bound，逐 token）。
  3. **为什么需要 KV cache**：n 个 token 不缓存是 O(n²) 冗余（KV 投影 + attention 扫描）。
  4. **Naive KV cache 的两难**：(a) 显存随 seq_len 线性增长 → 限制 batch → 限制吞吐；(b) 连续分配的内部碎片 + 外部碎片 → 浪费 60-80%。
  5. **Paged Attention 三件套**：block table（逻辑→物理）+ KV cache manager（free pool）+ paged attention kernel（按 block table 跳着读 K/V，保持 running softmax）。
- **关键公式 / 数据**：
  - `KVcache_size = 2 × bytes × n_layers × B × n_kv_heads × d_head × n_seq`
  - LLaMA-2-13B FP16, 4096 ctx: **3.125 GiB / 请求**；`0.78125 MiB / token`。
  - 注意 n_kv_heads：在 GQA/MQA 下远小于 n_heads——Llama-2 70B 用 GQA 把 KV 头从 64 降到 8。
- **重要补充（写作时务必带上）**：
  - **MQA / GQA / MLA / GTA / GLA** 五种 KV 压缩机制横向对比表（Paged Attention 文中给了综述）。
  - **Continuous batching**（Orca / OSDI'22）vs static batching：iteration-level scheduling。
  - **Speculative decoding**（Google Research）：draft 模型 + probabilistic acceptance，**保证输出分布完全一致**的前提下 2-3x 提速。
  - **Quantisation** 基础：FP32/FP16/BF16/INT8/INT4/FP8 精度表 + 对称 vs 非对称量化公式（`x = s(x_q - z)`）。
- **写作映射**：
  - 系列-03 上篇：**机制**（Paged Attention 为什么 / block table / 解决什么碎片）。
  - 系列-03 中篇：**性能**（vLLM vs TensorRT-LLM vs TGI 实现 / 4% 浪费是怎么算出来的）。
  - 系列-03 下篇：**配套技术**（MQA/GQA/MLA 横向对比 + continuous batching + speculative decoding + quantisation）。

### 2.2 Guided Decoding Performance on vLLM and SGLang（系列-04 主素材）

- **核心论点**：结构化输出（JSON / schema / regex）是 Agent 和 tool-call 的刚需；**grammar backend（XGrammar vs LLGuidance） × serving framework（vLLM vs SGLang）** 的 2×2 组合性能差异巨大——**没有银弹，只有按 workload 选型**。
- **论证路径**：
  1. **Guided decoding 工作流**：用户 schema → 编译成 grammar（DFA）→ 每步生成 token mask → 应用到 LLM logits → 保证结构正确。
  2. **两类 backend 哲学**：
     - **XGrammar** = 预计算 + 缓存。把 vocabulary 切成 context-independent / context-dependent，预计算独立 mask。**schema 重复时**极快，但**schema 复杂 / 动态**时变慢。
     - **LLGuidance** = 懒编译 + 动态 mask。每步走 vocabulary prefix tree 生成 mask。**首次见 schema 时**也很快，但**简单重复 schema** 时开销大。
  3. **Framework 决定上限**：vLLM 只 overlap 初始 grammar；SGLang **同时 overlap 初始 grammar + 每步 mask**，**结构化输出几乎不掉性能**。
- **关键数据 / 选型建议**（这是系列-04 的核心 TL;DR）：
  - **简单重复 schema（Book-Info 1000 同 schema）** → **XGrammar** 赢（吞吐高、TPOT 低）。
  - **动态复杂 schema（GitHub_medium 每请求 unique schema）** → **LLGuidance** 赢（XGrammar 会频繁卡 CPU）。
  - **serving framework 选型** → **SGLang**（结构化输出场景几乎 always 优于 vLLM）。
- **实验设置**（写文章时可作 benchmark 复现指南）：
  - 硬件：H100 80GB HBM3 + Xeon Platinum 8480+ + 480GB RAM。
  - 模型：Qwen3-8B + Qwen3-32B(TP2)，关闭 reasoning。
  - 框架版本：vLLM v0.10.0, SGLang 0.5.0rc0, xgrammar 0.1.21, llguidance 0.7.30。
  - 数据集：JSONSchemaBench（schema 多样性）+ Book-Info（重复）+ GitHub_easy/medium（动态）。
- **写作映射**：
  - 系列-04 上篇：**Why** + workflow（图 1 的 token mask 流水线）。
  - 系列-04 中篇：**2×2 benchmark 全图**（Book-Info / GitHub_easy / GitHub_medium 三场景）。
  - 系列-04 下篇：**选型决策表 + 国内案例**（Function Call / JSON 提取场景怎么选）。

### 2.3 From Single GPU to Clusters: Distributed Training（系列-05 主素材）

- **核心论点**：训练 70B+ 模型必须**分布式**；主线是 **Data Parallelism (DP) → ZeRO-1/2/3 → FSDP / Ray Train**，中间穿插 activation 显存优化（gradient checkpointing / gradient accumulation）和通信原语（All-Reduce / All-Gather / Reduce-Scatter）。
- **论证路径**（系列骨架）：
  1. **单卡显存账**：`16Ψ bytes`（Adam + FP32 master），70B = 1120 GB，A100 80GB 直接装不下。
  2. **动态显存 = activations**：`M_act = L·seq·bs·h·(34 + 5·n_heads·seq/h)`，随 seq 二次方增长。
  3. **省钱三招**（不动并行）：
     - **Gradient checkpointing**：全量或选择性（仅 checkpoint MHA），Llama-3.1-8B seq=4096 bs=1 从 97GB → 17GB（selective）→ 1GB（full）。
     - **Gradient accumulation**：用时间换显存，effective batch size 不变。
     - **Mixed precision**：BF16 + FP32 master，激活减半、训练更快。
  4. **Data Parallel**：每卡一份完整模型副本 + 不同 micro-batch + **All-Reduce** 同步梯度。
     - 优化：**钩子 + bucketing** 重叠通信与计算。
  5. **模型装不下 → ZeRO**：
     - **ZeRO-1**：optimizer state + master weights 切分（80GB 卡可训 5B → 19B）。
     - **ZeRO-2**：+ gradient 切分（→ 36B）。
     - **ZeRO-3 / FSDP**：+ parameter 切分（→ 320B）。
     - 通信代价：fwd/bwd 各 1 次 all-gather（Ψ） + 1 次 reduce-scatter（Ψ）= 总 3Ψ（prefetch 可隐藏）。
  6. **Ray Train 实战**：5 个最小 API（ScalingConfig + TorchTrainer + prepare_model + checkpoint + ray.train.report）就能上多机多卡 FSDP。
- **关键数据点**：
  - ZeRO-3 通信量 = 3Ψ，DP ≤ 512 时 prefetch 能藏住开销。
  - FSDP = PyTorch 原生的 ZeRO-3（`prepare_model(parallel_strategy="fsdp")`）。
  - Llama-3-1 8B / 13B / 70B 显存随序列长度曲线图（文末有数据点）。
- **写作映射**：
  - 系列-05 上篇：**单卡账本 + 三件省钱武器**（checkpoint / accumulation / mixed precision）。
  - 系列-05 中篇：**DP + ZeRO-1/2/3 全图**（All-Reduce / Reduce-Scatter 通信时间线 + 显存公式推导）。
  - 系列-05 下篇：**Ray Train 实战 + Pipeline/Tensor/Sequence 并行预告**（文末提到"未来 blog"）。

### 2.4 Post-training 101: Tokens for Thoughts（系列-06 主素材）

- **核心论点**：预训练只是"装知识"，**后训练**才把模型变成"听话的助手"；现代后训练 = **SFT + RLHF/RLAIF/RLVR**，评估体系分 auto eval + LLM-judge + human eval。
- **论证路径**：
  1. **从 base model 到 instruct model**：base 模型只会续写，instruct 模型能听话——需要 post-training。
  2. **生命周期**：SFT → 偏好优化（DPO）/ RLHF → RLVR（可验证奖励）。
  3. **SFT 三大要素**：
     - 数据：(prompt, response) pair，质量 > 数量（10K-100K 高质量 vs 1M 噪声）。
     - Loss：cross-entropy = NLL on response tokens；log-sum-exp 数值稳定实现（PyTorch `F.cross_entropy`）。
     - Batch：动态 batching / packed sequences / attention mask 屏蔽 padding。
  4. **RL 家族**：
     - 目标：`max E[r(x,y)] - β·KL(π∥π_0)`（防漂移）。
     - **RLHF**（InstructGPT 路线）：人类偏好对 → Bradley-Terry 训练 RM → PPO。
     - **RLAIF**（Constitutional AI）：LLM-as-judge 提供偏好。
     - **RLVR**（DeepSeek R1 路线）：数学 / 代码用 verifier 给精确奖励。
     - **PRM / Rubric rewards**：过程奖励 / rubric 加权和。
  5. **算法对照**：PPO（带 critic）/ GRPO（critic-free，DeepSeek 主流）/ REINFORCE / DPO（无 RM）。
  6. **评估**：自动（GSM8K / HumanEval / MMLU / TruthfulQA）+ LLM-judge（pairwise / pointwise / reference-aware）+ 人类评估（pointwise / preference / ELO）。
- **关键公式 / 数据点**：
  - `L_SFT(θ) = -1/T Σ log p_θ(y_t* | x, y_<t)`
  - Bradley-Terry：`P(y₁>y₂) = exp(r(y₁))/(exp(r(y₁))+exp(r(y₂)))` → Loss: `-E[log σ(r_θ(y_w) - r_θ(y_l))]`
  - PPO clip：`L = -E[min(r_t A_t, clip(r_t, 1-ε, 1+ε) A_t)]`
  - GRPO：`A_i = r_i - r̄`（组内均值基线，免 critic）。
- **写作映射**：
  - 系列-06 上篇：**从 base 到 instruct + SFT 全景**（数据 / loss / batch）。
  - 系列-06 中篇：**RLHF / RLAIF / RLVR / PRM / Rubric 五大奖励族**（横向对比 + 选型）。
  - 系列-06 下篇：**算法矩阵（PPO/GRPO/REINFORCE/DPO）+ 评估体系**。

---

## 三、主题归并 · 6 卷大系列结构

```
Inference Engineering 大系列（持续更新）
│
├── [系列-01] Inference Engineering 路线图 已完成
│   └── [Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md)
│
├── [系列-02] KV Cache 第一性原理 已完成
│   ├── [系列-02-A-KVCache-上篇](@/blog/inference-engineering/inference-engineering-series-02-a-kvcache.md)（机制）
│   ├── [系列-02-B-KVCache-中篇](@/blog/inference-engineering/inference-engineering-series-02-b-kvcache.md)（TTFT + 修复）
│   └── [系列-02-C-KVCache-下篇](@/blog/inference-engineering/inference-engineering-series-02-c-kvcache.md)（显存代价 + 救兵）
│
├── [系列-03] Paged Attention & Attention 内存效率 已完成
│   ├── [系列-03-A · PagedAttention 上篇](@/blog/inference-engineering/inference-engineering-series-03-a-paged-attention.md)（Block Table 与碎片治理）
│   ├── [系列-03-B · PagedAttention 中篇](@/blog/inference-engineering/inference-engineering-series-03-b-paged-attention.md)（vLLM 实现 + 吞吐数据）
│   └── [系列-03-C · PagedAttention 下篇](@/blog/inference-engineering/inference-engineering-series-03-c-paged-attention.md)（MQA/GQA/MLA 横向 + 配套技术）
│
├── [系列-04] Guided Decoding · 结构化生成 已完成
│   ├── [系列-04-A · Guided Decoding 上篇](@/blog/inference-engineering/inference-engineering-series-04-a-guided-decoding.md)（Why 结构化输出）
│   ├── [系列-04-B · Guided Decoding 中篇](@/blog/inference-engineering/inference-engineering-series-04-b-guided-decoding.md)（2×2 benchmark 全图）
│   └── [系列-04-C · Guided Decoding 下篇](@/blog/inference-engineering/inference-engineering-series-04-c-guided-decoding.md)（选型决策表 + 实践）
│
├── [系列-05] Distributed Training · 从单卡到集群 已完成
│   ├── [系列-05-A · Distributed Training 上篇](@/blog/inference-engineering/inference-engineering-series-05-a-distributed-training.md)（单卡账本 + 三件省钱武器）
│   ├── [系列-05-B · Distributed Training 中篇](@/blog/inference-engineering/inference-engineering-series-05-b-distributed-training.md)（DP + ZeRO-1/2/3）
│   └── [系列-05-C · Distributed Training 下篇](@/blog/inference-engineering/inference-engineering-series-05-c-distributed-training.md)（Ray Train 实战 + 预告）
│
└── [系列-06] Post-Training 101 · 从 base 到 instruct 已完成
    ├── [系列-06-A · Post-Training 上篇](@/blog/inference-engineering/inference-engineering-series-06-a-post-training.md)（SFT 全景）
    ├── [系列-06-B · Post-Training 中篇](@/blog/inference-engineering/inference-engineering-series-06-b-post-training.md)（RL 五大奖励族）
    └── [系列-06-C · Post-Training 下篇](@/blog/inference-engineering/inference-engineering-series-06-c-post-training.md)（算法矩阵 + 评估体系）
```

> **Mermaid 依赖图**：
> ```mermaid
> flowchart TD
>     S01["系列-01<br/>Inference Engineering 路线图"]
>     S02["系列-02<br/>KV Cache 第一性原理"]
>     S03["系列-03<br/>Paged Attention"]
>     S04["系列-04<br/>Guided Decoding"]
>     S05["系列-05<br/>Distributed Training"]
>     S06["系列-06<br/>Post-Training 101"]
>
>     S01 --> S02
>     S02 --> S03
>     S03 --> S04
>     S04 --> S05
>     S05 --> S06
>
>     style S01 fill:#9CA9BD,stroke:#6B7280,color:#1A1F2E
>     style S02 fill:#9CA9BD,stroke:#6B7280,color:#1A1F2E
>     style S03 fill:#F59E42,stroke:#E04E3D,color:#1A1F2E
>     style S04 fill:#F59E42,stroke:#E04E3D,color:#1A1F2E
>     style S05 fill:#F59E42,stroke:#E04E3D,color:#1A1F2E
>     style S06 fill:#F59E42,stroke:#E04E3D,color:#1A1F2E
> ```
> 灰色 = 已完成，橙色 = 待写。

---

## 四、关键编辑决策（避免下次重新判断）

### 决策 1 · KV Cache 不再单独成系列

**理由**：[Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md) 的第六章已经用 220 行完整翻译了 @akshay_pachaar 的 KV Caching 长推，并补充了"三本账（延迟 / 显存 / 并发）"。**[系列-02](@/blog/inference-engineering/inference-engineering-series-02-a-kvcache.md) 已经发布**。

**行动**：`KV Caching in LLMs, Clearly Explained` 这篇素材标注 `已合并`，**不重复加工**。

### 决策 2 · @itsmenikhitha 6 篇 X 帖 = 同一份素材

**理由**：6 篇是同一 Twitter thread 在剪藏工具里的 6 个 status_id 切片，主体内容（9 个节点 + 资源链接）100% 重复，仅在节点 2 / 3 的子链接清单上有微调。

**行动**：取最长版（`Post by @itsmenikhitha on X.md`，4.2K）作为**单一来源**，其余 5 篇标注 `重复，保留作存档`。**已经全部内容并入 [Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md)**，无需再加工。

### 决策 3 · 系列-03 边界：Paged Attention 而不是泛 Attention

**理由**：原文 Paged Attention 是核心，但同时涵盖 MQA / GQA / MLA / GTA / GLA + continuous batching + speculative decoding + quantisation——这些是**配套技术**，不是同一专题。

**行动**：系列-03 主标题定为 **"Paged Attention & Attention 内存效率"**，下篇专门承载"配套技术全景"——避免一篇塞太多稀释焦点。

### 决策 4 · 系列-04 边界：仅围绕 XGrammar vs LLGuidance × vLLM vs SGLang

**理由**：原文是 benchmark，不是结构化生成的入门科普。**"为什么需要 guided decoding" + "怎么工作"** 是必要前置（占上篇半篇），但中下篇专注 benchmark 与选型。

**行动**：上篇用 ~40% 篇幅讲 workflow，剩下 60% 留作引导读者理解为什么要 benchmark；中篇全图复现 2×2 矩阵；下篇给选型决策表。

### 决策 5 · 系列-05 不展开 Pipeline / Tensor / Sequence Parallel

**理由**：原文作者自己说 "Maybe in some future blog, we will discuss these advanced techniques in more detail"，主体停在 Ray Train + FSDP 实操。

**行动**：系列-05 下篇用一节"为什么 DP/FSDP 不够 / 什么场景必须上 PP/TP"作**预告 + 资源清单**，**不展开**。留作系列-07 候选。

### 决策 6 · 系列-06 不展开 DeepSeek R1 的工程细节

**理由**：原文作者在第 6 章 Summary 明确说 "For future series, we will also discuss some advanced topics such as post-training for DeepSeek V3 and for DeepSeek R1"。

**行动**：系列-06 主线停在"算法矩阵 + 评估"，**R1 工程化 + GRPO 完整推导** 作为系列-08 候选。

---

## 五、写作优先级与节奏建议

| 优先级 | 系列 | 建议周次 | 工作量估计 | 触发场景 |
|---|---|---|---|---|
| P0 | 系列-03 Paged Attention | 本周 | 3 篇长文 + 1 篇公众号 | @hamzaelshafie 推文热度高，KV 显存是高频面试题 |
| P1 | 系列-04 Guided Decoding | 下周 | 3 篇长文 + 1 篇公众号 | Agent / Function Call 需求爆发 |
| P1 | 系列-06 Post-Training | 第 3 周 | 3 篇长文 + 1 篇公众号 | DeepSeek R1 后训练热度高 |
| P2 | 系列-05 Distributed Training | 第 4 周 | 3 篇长文 + 1 篇公众号 | 训练侧相对低频，但作为完整体系必补 |

> **节奏原则**：每系列 3 篇 Vault 长文 + 1 篇公众号凝缩版；上 / 中 / 下 依次 **为什么 → 怎么做 → 工程权衡**；公众号版挑 1 张最炸的图 + 5 个必记结论。

---

## 六、下一步操作清单

- [x] 创建 `系列-03-A-PagedAttention-上篇.md` 与对应公众号文（**已完成 2026-09-09**）
- [x] 写完系列-03 后回填本笔记的"已完成"状态（**已回填**）
- [x] 把 5 篇未加工长文落地到「当前笔记」目录同步完成（**已完成——4 系列全部落地 5 篇**）
- [x] 在知识图谱索引中同步本次新增的 4 个系列锚点（**暂缓——系列草稿仍在「当前笔记」目录，等正式迁移到「01-知识库/AI与编程/Inference-Engineering/」时再做**）
- [x] 在「当前笔记」README.md 中追加本笔记索引（**已追加**）
- [x] 在「素材链接索引」目录追加 4 个素材链接（**已追加**）

---

## 附录 · 元信息

| 字段 | 值 |
|---|---|
| 笔记位置 | [AI-学习系列-Inference-Engineering-第二期素材盘点](@/blog/inference-engineering/inference-engineering-series-00-resource-index.md) |
| 生成时间 | 2026-09-09 |
| 素材范围 | 剪藏目录（`Clippings/`）下今天创建的全部 11 个文件 |
| 核心素材字数合计 | 约 240K（含 6 篇重复切片 ~21K）→ 净可用素材约 235K |
| 风格沿用 | [Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md) / [系列-02-A-KVCache-上篇](@/blog/inference-engineering/inference-engineering-series-02-a-kvcache.md) |
| 系列大目录 | 本站 README（一级分类 02-课程体系下"AI-LLM 教程"）相邻，定位不同：本文是 **Inference Engineering 大系列**，课程体系目录下是 **基础数学→神经网络→LLM 原理** |

### 文件 → 系列 → 状态 一览

```
Clippings/KV Caching in LLMs, Clearly Explained.md          → 系列-02 已完成
Clippings/Paged Attention from First Principles*.md          → 系列-03 待写
Clippings/Guided Decoding Performance on vLLM and SGLang.md → 系列-04 待写
Clippings/From Single GPU to Clusters*.md                   → 系列-05 待写
Clippings/Post-training 101  Tokens for Thoughts.md         → 系列-06 待写
Clippings/Post by @itsmenikhitha on X*.md  (×6)             → 系列-01 已完成 (重复切片)
```

> **本笔记作为"母索引"长期保留**，后续每个子系列完成后只更新"状态"列，不重写本笔记。
