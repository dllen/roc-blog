---
title: "HySparse2 详解：让长上下文 Agent 的 Prefill 便宜 5 倍"
date: 2026-10-15T10:00:00+08:00
description: "小米 MiMo 团队 HySparse2:两层 KV 共享(KV Bridging + KV Reuse),内层 token 级稀疏 + 外层跨解码器复用,80B-A3B MoE 上 Prefill FLOPs 降低 5 倍、KV Cache 从 12GB 压缩到 2.69GB,MRCR-v2 提升 11.30 分。"
taxonomies:
  tags: ["HySparse2", "长上下文", "Prefill 优化", "LLM", "小米 MiMo"]
extra:
  update_date: 2026-10-15T10:00:00+08:00
---

## 一句话总结

小米 MiMo 团队搞出了一个新注意力架构 **HySparse2**，通过「两层 KV 共享」让 Agent 处理长上下文时的 Prefill 计算量暴降 **5 倍**，KV Cache 显存从 12GB 压缩到 **2.69GB**，同时长上下文检索精度还更高了。

---

## 背景：Agent 场景的 Prefill 困境

### 什么是 Prefill？

LLM 推理分两步：**Prefill**（把用户输入灌进去，算第一颗 token）和 **Decode**（一个个生成后续 token）。

Prefill 的本质是**一次性算完所有输入 token 的注意力**，token 越多，计算量越大。

### Agent 的典型画像

```
观察（很长）：|tool_output_1|tool_output_2|tool_output_3|...|历史对话|
动作（很短）：|action_token|
```

Agent 每轮交互的典型特征：

- **观察极长**：来自工具调用、环境反馈、网页内容……可能好几万 token
- **动作极短**：可能就几个 token

这就尴尬了：每次都要把「长观察 + 短动作」全部 Prefill 一遍，但 90% 的计算花在处理那个「长观察」上，产出却只有「短动作」。

### 现有方案的痛点

| 方案 | 痛点 |
|------|------|
| 全注意力 | token 多了直接爆显存和算力 |
| 滑动窗口注意力（SWA） | 只看附近 token，长距离依赖丢光光 |
| 块级稀疏（HySparse） | 块太大，检索精度不够；SWA 分支和稀疏分支分离，资源浪费 |

**核心矛盾**：长距离的全局信息要保留，但算力又撑不住。

---

## 核心方法：两层 KV 共享

### 直观类比

想象你在读一本**很长的推理小说**：

- **内层记忆（KV Reuse）**：你记住每章的关键人物和情节（全局 token 的 KV）
- **外层记忆（KV Bridging）**：你有一份章节摘要本，可以随时翻阅（轻量的跨层共享）
- **早停机制**：读完摘要本感觉够了，就可以停止精读（Prefill 提前退出）

---

### 外层：KV Bridging（跨解码器共享）

HySparse2 采用了类似 **YOCO** 的架构，把解码器分成两层：

```
Self-Decoder（自解码器）
    ↓ 隐藏状态
Cross-Decoder（交叉解码器）
    ↓ 生成最终输出
```

**Self-Decoder**：

- 用滑动窗口注意力（SWA），只算附近 token
- 计算量小，但丢失了长距离依赖

**Cross-Decoder**：

- 不从原始输入构建 KV，而是**复用 Self-Decoder 的隐藏状态**
- 这就是「跨层共享」——Cross-Decoder 不需要重新计算所有历史 token 的注意力

**关键洞察**：只要 Self-Decoder 完成了，后面的 Cross-Decoder 层完全可以**提前退出**，因为 Cross-Decoder 的输入就是 Self-Decoder 的输出，没有新信息要吸收。

---

### 内层：KV Reuse（稀疏选择 + token 级粒度）

HySparse2 保留了前身 HySparse 的核心思路，并做了两处改进：

#### 改进 1：块级稀疏 → token 级稀疏

原 HySparse 按**块**来选择保留哪些 KV——块太大，精细度不够。

HySparse2 改成**逐 token 选择**：每个 token 自己决定要不要把自己的 KV 保留下来，粒度更细，检索精度更高。

#### 改进 2：合并 SWA 分支

原 HySparse 里，稀疏层还有一个单独的 SWA 分支来保留局部信息，等于两套机制并存。

HySparse2 直接把这个 SWA 分支**砍掉**，强制让「最近的几个 token」走滑动窗口机制，然后其余 token 走稀疏选择——**一套机制搞定局部+全局**，减少冗余。

---

### 联合效果：Prefill 提前退出

有了 KV Bridging，所有 Cross-Decoder 的 KV 都是从 Self-Decoder 的隐藏状态构建的。

**Prefill 流程变成了这样**：

```
输入 token
    ↓
Self-Decoder（完整计算滑动窗口注意力）
    ↓ 产出隐藏状态
[提前退出！] ← 跳过所有 Cross-Decoder 层
    ↓
生成 action token
```

因为 Self-Decoder 的输出已经包含了足够的信息（KV Bridging 机制保证了这一点），Cross-Decoder 的计算可以被完全跳过。

这在 Agent 场景下尤其有效：每次 prefill 的都是长观察 + 短动作，动作生成只需要 Self-Decoder 的输出就够用了。

---

## 实验效果

### 硬件配置

80B-A3B MoE 模型（80B 总参，激活 3B）

### Prefill 计算量

| 方案 | FLOPs（相对比值） |
|------|-------------------|
| Hybrid SWA（MiMo-V2 基线） | 1x |
| HySparse | 1.72x |
| **HySparse2** | **0.20x**（降低 5.02 倍） |

### KV Cache 显存

| 方案 | KV Cache 大小 |
|------|---------------|
| Hybrid SWA 基线 | 12.09 GB |
| **HySparse2** | **2.69 GB**（压缩 4.5 倍） |

### 基准测试（Light Post-Training 后）

| 基准 | 相比 HySparse 提升 |
|------|-------------------|
| MRCR-v2（多跳检索） | +11.30 分 |
| RULER-v2（长上下文综合） | +19.81 分 |
| AgentPPL | 更低（更好） |
| LongPPL（256k token 内） | 更低（更好） |

---

## 为什么重要

### 1. 精准命中 Agent 场景

Agent 场景的核心矛盾是「长观察、短动作」——HySparse2 专门为此设计，不是通用优化，是**定向爆破**。

### 2. 5 倍算力节省意味着什么

- 同样一块 GPU，原来只能处理 1 个长上下文请求，现在能处理 **5 个**
- 长上下文的延迟从秒级降到亚秒级
- 云端推理成本直接降 80%

### 3. 精度不降反升

通常加速方案都会有精度损失，但 HySparse2 在 MRCR 和 RULER 上都明显超越了基线。原因是：

- token 级稀疏选择比块级更精细，检索更准
- 去除 SWA 分支冗余，减少了噪声干扰
- KV Bridging 保证了跨层信息传递的完整性

### 4. KV Cache 压缩 4.5 倍

12GB → 2.69GB 的 KV Cache 意味着：

- 同样显存能同时服务更多并发请求
- 移动端/端侧部署长上下文模型成为可能
- 降低了 KV Cache 传输的通信开销

---

## 总结

HySparse2 的核心创新是**两层 KV 共享**：

- **外层（KV Bridging）**：Cross-Decoder 复用 Self-Decoder 的隐藏状态，Prefill 可以提前退出
- **内层（KV Reuse）**：token 级稀疏选择 + 合并 SWA 分支，提高检索精度并减少冗余

配合「长观察、短动作」的 Agent 典型特征，HySparse2 在几乎不损失精度的情况下，把 Prefill 算力砍到原来的 **1/5**，KV Cache 显存压缩到原来的 **1/4.5**。

这是小米 MiMo 团队（LLM-Core）的工作，论文来自 arXiv 2609.26368。

---

**相关论文**：

- YOCO: You Only Cache Once
- HySparse: Hybrid Sparse Attention for Efficient Long-context LLM
