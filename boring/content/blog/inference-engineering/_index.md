---
title: "AI 推理工程"
description: "Inference Engineering 大系列 6 卷 18 篇长文——KV Cache、Paged Attention、Guided Decoding、Distributed Training、Post-Training 等 LLM 推理工程化的第一性原理长文,适合 LLM 平台 / SRE / 后端工程师。"
paginate_by: 20
sort_by: "date"
template: "inference-engineering.html"
---

# Inference Engineering 大系列

> **副标题**:从 KV Cache 到 Post-Training——LLM 推理工程化的第一性原理。
> **风格**:翻译 + 中文工程视角 + 结构化对照表 + 工程师笔记。
> **来源**:2026-09-09 剪藏的 11 篇高质量英文长文(总字数 ~235K),拆解为 6 个子系列。

---

## 系列总览

| 系列 | 主题 | 节点 | 文章数 | 状态 |
|---|---|---|---|---|
| [系列-01 · Roadmap](@/blog/inference-engineering/inference-engineering-series-01-a-roadmap.md) | 9 节点 Inference Engineering 学习路线 | 路线图 | 3 篇 + 1 总览 | ✅ |
| [系列-02 · KV Cache](@/blog/inference-engineering/inference-engineering-series-02-a-kvcache.md) | KV Cache 第一性原理(显存/延迟/并发) | 节点 1-2 | 3 篇 | ✅ |
| [系列-03 · Paged Attention](@/blog/inference-engineering/inference-engineering-series-03-a-paged-attention.md) | 显存浪费 60-80% → <4% 的工程革命 | 节点 3-4 | 3 篇 | ✅ |
| [系列-04 · Guided Decoding](@/blog/inference-engineering/inference-engineering-series-04-a-guided-decoding.md) | 结构化输出:2×2 选型(XGrammar × vLLM/SGLang) | 节点 5/8 | 3 篇 | ✅ |
| [系列-05 · Distributed Training](@/blog/inference-engineering/inference-engineering-series-05-a-distributed-training.md) | 单卡 16Ψ bytes → DP → ZeRO → Ray Train | 节点 7 | 3 篇 | ✅ |
| [系列-06 · Post-Training](@/blog/inference-engineering/inference-engineering-series-06-a-post-training.md) | 从 base 到 instruct:SFT + RLHF/RLVR/PRM | 新增独立 | 3 篇 | ✅ |

---

## 📑 导航索引(按子系列分卷)

### 母索引(必读)

- [Inference Engineering 学习路线总结](@/blog/inference-engineering/inference-engineering-series-00-roadmap-summary.md) — 9 节点路线图 + 中文工程视角(总览)
- [AI 学习系列 · Inference Engineering 第二期素材盘点](@/blog/inference-engineering/inference-engineering-series-00-resource-index.md) — 11 篇剪藏素材的归并 / 编排决策记录

### 系列-01 · Inference Engineering 学习路线图(3 篇)

- [系列-01-A · 路线图上篇](@/blog/inference-engineering/inference-engineering-series-01-a-roadmap.md) — 9 节点全景速览
- [系列-01-B · 路线图中篇](@/blog/inference-engineering/inference-engineering-series-01-b-roadmap.md) — 节点 1-5 深度展开
- [系列-01-C · 路线图下篇](@/blog/inference-engineering/inference-engineering-series-01-c-roadmap.md) — 节点 6-9 深度展开

### 系列-02 · KV Cache 第一性原理(3 篇)

- [系列-02-A · KVCache 上篇](@/blog/inference-engineering/inference-engineering-series-02-a-kvcache.md) — 为什么需要 KV cache
- [系列-02-B · KVCache 中篇](@/blog/inference-engineering/inference-engineering-series-02-b-kvcache.md) — TTFT 与修复
- [系列-02-C · KVCache 下篇](@/blog/inference-engineering/inference-engineering-series-02-c-kvcache.md) — 显存代价与救兵

### 系列-03 · Paged Attention(3 篇)

- [系列-03-A · PagedAttention 上篇](@/blog/inference-engineering/inference-engineering-series-03-a-paged-attention.md) — Block Table 与碎片治理
- [系列-03-B · PagedAttention 中篇](@/blog/inference-engineering/inference-engineering-series-03-b-paged-attention.md) — vLLM 实现与 2-3× 吞吐数据
- [系列-03-C · PagedAttention 下篇](@/blog/inference-engineering/inference-engineering-series-03-c-paged-attention.md) — MQA/GQA/MLA 横向 + 配套技术

### 系列-04 · Guided Decoding(3 篇)

- [系列-04-A · GuidedDecoding 上篇](@/blog/inference-engineering/inference-engineering-series-04-a-guided-decoding.md) — Why 结构化输出 + 工作流
- [系列-04-B · GuidedDecoding 中篇](@/blog/inference-engineering/inference-engineering-series-04-b-guided-decoding.md) — 2×2 benchmark 全图
- [系列-04-C · GuidedDecoding 下篇](@/blog/inference-engineering/inference-engineering-series-04-c-guided-decoding.md) — 选型决策表 + Function Call 实践

### 系列-05 · Distributed Training(3 篇)

- [系列-05-A · DistributedTraining 上篇](@/blog/inference-engineering/inference-engineering-series-05-a-distributed-training.md) — 单卡账本 16Ψ bytes + 省钱三件套
- [系列-05-B · DistributedTraining 中篇](@/blog/inference-engineering/inference-engineering-series-05-b-distributed-training.md) — DP + ZeRO-1/2/3 + 通信原语
- [系列-05-C · DistributedTraining 下篇](@/blog/inference-engineering/inference-engineering-series-05-c-distributed-training.md) — Ray Train 实战 + 并行预告

### 系列-06 · Post-Training(3 篇)

- [系列-06-A · PostTraining 上篇](@/blog/inference-engineering/inference-engineering-series-06-a-post-training.md) — 从 base 到 instruct + SFT 全景
- [系列-06-B · PostTraining 中篇](@/blog/inference-engineering/inference-engineering-series-06-b-post-training.md) — 五大奖励族(RLHF/RLAIF/RLVR/PRM/Rubric)
- [系列-06-C · PostTraining 下篇](@/blog/inference-engineering/inference-engineering-series-06-c-post-training.md) — 算法矩阵 + 评估体系

---

## 🎯 适合谁读

- **LLM 平台 / SRE / 后端工程师**:理解 LLM 推理的资源账本(显存、计算、通信)、服务化框架(vLLM/SGLang)、训练范式
- **AI Infra 工程师**:从 KV cache 切到 Paged Attention、从 DP 切到 ZeRO/FSDP、从 SFT 切到 RL——工程化 LLM 全栈必备
- **产品经理 / 技术 Leader**:理解"为什么 AI 推理这么贵"、"如何选型框架"、"训练 vs 后训练的钱和效果权衡"

## 📊 系列画像

- **总字数**:~85K 中文字符 + ~235K 英文字符原文附录
- **总文件数**:20 篇 markdown(6 卷 × 3 篇 + 2 篇总览) + 17 张 SVG 配图
- **来源素材**:`@itsmenikhitha` / `Hamza El-Shafie` / `SqueezeBits` / `Suman Debnath` / `Han Fang + Karthik` / `@akshay_pachaar`
- **风格定位**:工程师视角的"翻译 + 中文工程语境补充",避免学术综述的抽象,也不只调用 API

---

## 📚 关联系列

- [Agent Skills 系列教程](@/blog/agent-skills-series-01-agents-have-no-memory.md) — AI 智能体没有持久记忆,Skill 模块化的工程实践
- [AI Agent 系列教程](@/blog/ai-agent-series-01-what-is-agent.md) — 从 Agent 定义 / Tools/MCP / Memory/RAG / Evaluation 到多模态未来
- [Tutorial 合集](/blog/tutorial/) — 跨主题工程实践教程