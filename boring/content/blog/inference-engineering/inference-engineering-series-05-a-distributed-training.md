---
title: "Distributed Training 上篇：单卡账本 16Ψ bytes 与省钱三件套"
date: 2026-09-09
description: "为什么 GPT-3 在单卡 A100 上要跑 355 年？70B 模型 Adam + FP32 master = 16Ψ bytes 静态显存,A100 80GB 装不下。本文翻译 Suman Debnath 长文,推导单卡账本 + 三件省钱武器(gradient checkpointing / accumulation / mixed precision)。"
tldr: "16Ψ bytes 单卡账本 · Llama-3.1 8B seq=4096: 97GB → 1GB · gradient checkpointing 是关键"
taxonomies:
  tags: ["LLM", "DistributedTraining", "ZeRO", "FSDP", "RayTrain", "系列教程"]
---

# 系列-05 · Distributed Training · 从单卡到集群（上篇）：单卡账本与省钱三件套

> **系列导航**：[中篇·Data Parallel + ZeRO-1/2/3 全图](@/blog/inference-engineering/inference-engineering-series-05-b-distributed-training.md) | [下篇·Ray Train 实战](@/blog/inference-engineering/inference-engineering-series-05-c-distributed-training.md)
> **完整长文**：[公众号文-05-Distributed-Training-详解.md](#)

---

## 一句话开场

> **如果把 GPT-3 塞进一张 A100 80GB 卡里——要跑 355 年。**
> 不是比喻，是用每张 GPU 每秒浮点运算次数和 GPT-3 所需训练量直接除出来的。
> 这一篇讲清楚：单卡为什么会爆显存，以及三件套（gradient checkpointing / gradient accumulation / mixed precision）怎么把不可能变成可能。

---

## Part 1 · 为什么单卡永远不够

### 1.1 一个震撼的数字

| 模型 | 参数量 | 单卡训练时间（估算） |
|---|---|---|
| ResNet-50 | 26M | 31 小时 |
| BERT-Base | 108M | 84 小时 |
| Turing-NLG 17B | 17B | TBA |
| **GPT-3 175B** | **175B** | **~355 年** |

> Source: Suman Debnath / debnsuma.github.io

**355 年**——不是模型太慢，是单卡算力 vs GPT-3 总计算量之间隔了整整 3 个数量级。

### 1.2 单卡四件套：显存去哪了

训练深度学习模型，单卡 HBM（High Bandwidth Memory）被四件事吃光：

| 消耗项 | 符号 | 说明 |
|---|---|---|
| **模型参数** | $\Phi$ | 权重，训练中不变 |
| **参数梯度** | $\nabla \Phi$ | 反向传播必须存，用于更新 |
| **优化器状态** | $\Phi_{\text{optim}}$ | Adam 的 momentum + variance |
| **Activations** | $M_{\text{act}}$ | 每层中间输出，反向时必须保留 |

前三项是**静态占用**——模型架构定下来就定死了；Activations 是**动态占用**——随 batch size 和序列长度剧烈变化。

---

## Part 2 · 静态显存精确账：16Ψ bytes

### 2.1 Adam 优化器为什么是 16Ψ

用 BF16 混合精度训练时，静态显存账如下：

| 消耗项 | 精度 | 每参数字节数 |
|---|---|---|
| 模型参数（forward/backward 用） | BF16（2 bytes） | $2\Psi$ |
| 参数梯度 | BF16（2 bytes） | $2\Psi$ |
| Master Weights（更新用 FP32 副本） | FP32（4 bytes） | $4\Psi$ |
| Adam 一阶动量（$m$） | FP32（4 bytes） | $4\Psi$ |
| Adam 二阶动量（$v$） | FP32（4 bytes） | $4\Psi$ |
| **合计** | | **$16\Psi$ bytes** |

$$
M_{\text{static}} = 16\Psi \quad \text{bytes}
$$

> **工程速记**：Adam 每参数要存 8 bytes（两个 FP32 moment），加上 BF16 的 weights + gradients 4 bytes，再加 FP32 master weights 4 bytes = **每参数 16 bytes**。

### 2.2 70B 模型在单卡上算不过来

$$
70\text{B} \times 16\text{ bytes} = 1120\text{ GB}
$$

A100 80GB 直接爆显存——这还是**静态部分**，没算任何 activations。

### 2.3 Mixed Precision 为什么不省静态显存

有人问：BF16 明明比 FP32 省一半，为什么 $16\Psi$ 不变？

**答**：因为 FP32 master weights + Adam states 本身就是 FP32，不能省。省的只是 forward/backward pass 里的激活值占用——**显存带宽和计算速度受益，但静态占用不变**。

---

## Part 3 · 动态显存：Activations 二次方陷阱

### 3.1 激活显存公式

$$
M_{\text{act}} = L \cdot \text{seq} \cdot \text{bs} \cdot h \cdot \left(34 + \frac{5 \cdot n_{\text{heads}} \cdot \text{seq}}{h}\right)
$$

| 符号 | 含义 |
|---|---|
| $L$ | 模型层数 |
| $\text{seq}$ | 序列长度 |
| $\text{bs}$ | batch size |
| $h$ | 隐层维度 |
| $n_{\text{heads}}$ | 注意力头数 |

**关键性质**：
- 随 $\text{bs}$ **线性增长**
- 随 $\text{seq}$ **二次方增长**（注意力矩阵的代价）

### 3.2 Llama-3.1 显存曲线（原文数据）

```
┌─────────────────────────────────────────────────────────┐
│  Llama-3.1 显存消耗 vs 序列长度                          │
│                                                         │
│  100GB ┤                        ┌─── 8B (无checkpoint)  │
│        │                   ┌───  │                       │
│   50GB ┤              ┌── 13B   │                       │
│        │         ┌─── 70B       │                       │
│    5GB ┤    ┌──                           8B (selective)│
│        │ 1GB └───────────────────────────── 8B (full)   │
│    0GB ┼──────────────────────────────────────────────  │
│          1K    4K    16K   65K   256K   序列长度         │
│                                                         │
│  来源：Suman Debnath / debnsuma.github.io               │
└─────────────────────────────────────────────────────────┘
```

| 模型 | seq=4096 bs=1 无 checkpoint | selective checkpointing | full checkpointing |
|---|---|---|---|
| **Llama-3.1 8B** | **97 GB** | **17 GB** | **1 GB** |
| Llama-3.1 13B | ~160 GB | ~28 GB | ~1.6 GB |
| Llama-3.1 70B | ~820 GB | ~145 GB | ~8 GB |

> 原文数据：Llama-3.1 8B, batch size=1, seq=4096: **97GB**（无 checkpoint）→ **17GB**（selective）→ **1GB**（full）。

**结论**： activations 是长序列杀手，gradient checkpointing 是解法。

---

## Part 4 · 省钱三件套

### 4.1 件套一：Gradient Checkpointing（激活重算）

**原理**：不存所有中间 activations，forward 时只存特定检查点，backward 时在检查点之间**重新算一遍**。

以时间换显存。

两种策略对比：

| 策略 | 显存节省 | 计算代价 | 适用场景 |
|---|---|---|---|
| **Full Checkpointing** | ~99%（8B 从 97GB → 1GB） | +30~40% compute | 显存极度紧张 |
| **Selective Checkpointing**（仅 MHA 层） | ~82%（97GB → 17GB） | ~+2.7% compute | 实用首选 |

> **为什么只 checkpoint MHA 层**：MHA 激活随 seq 二次方，是显存主犯；MLP 激活量小，存着不亏。

```python
# PyTorch 实现（选择性 checkpointing）
from torch.utils.checkpoint import checkpoint_sequential

# 方案 1: Full — 只存每层输出
model = checkpoint_sequential(module.layers, checkpointEvery=1)

# 方案 2: Selective — 只对 MHA 层重算
class SelectivelyCheckpointedModel(nn.Module):
    def forward(self, x):
        for layer in self.layers:
            if isinstance(layer, MultiHeadAttention):
                x = checkpoint(layer, x, use_reentrant=False)
            else:
                x = layer(x)
        return x
```

### 4.2 件套二：Gradient Accumulation（梯度累积）

**原理**：不把大 batch 一次性装进显存——拆成多个 micro-batches，**串行**算梯度，**累积**到同一个优化器 step。

显存降为 $\frac{1}{n}$（n = micro-batch 数量），代价是训练速度慢 n 倍。

$$
M_{\text{accum}} = \frac{M_{\text{large batch}} \cdot \text{bs}}{n \cdot \text{micro\_bs}} = \frac{M_{\text{large batch}}}{n}
$$

```python
# Gradient Accumulation 示例
micro_batch_size = 4
accum_steps = 8  # effective batch size = 4 × 8 = 32

for epoch in range(epochs):
    optimizer.zero_grad()
    for i, (x, y) in enumerate(data_loader):
        loss = model(x, y)
        loss.backward()  # 不 step，只累积梯度
        if (i + 1) % accum_steps == 0:
            optimizer.step()      # 一次性更新
            optimizer.zero_grad() # 重置
```

**国内大厂案例：阿里 PAI 分布式训练**——阿里云机器学习平台 PAI 文档记载，使用 gradient accumulation + gradient checkpointing 组合，在 V100 32GB 卡上成功训练 Llama-2-7B，effective batch size 达到 2048（micro-bs=1，accum_steps=2048）。

### 4.3 件套三：Mixed Precision（混合精度）

**原理**：forward/backward 用 BF16（2 bytes），optimizer step 用 FP32 master copy（4 bytes）——**计算速度更快 + 激活显存减半**。

| 阶段 | 精度 | 显存 | 目的 |
|---|---|---|---|
| Forward / Backward | BF16 | 2Ψ | 省显存、省带宽 |
| Optimizer Step | FP32 | 4Ψ | 数值稳定 |
| Gradients | BF16 | 2Ψ | 通信量减半 |

```python
# PyTorch 混合精度三行配置
scaler = torch.cuda.amp.GradScaler()
with torch.cuda.amp.autocast():
    outputs = model(inputs)
scaler.scale(loss).backward()
scaler.step(optimizer)
scaler.update()
```

---

## Part 5 · 国内大厂案例

### 5.1 百川智能 Baichuan 训练体系

百川在 2023-2024 年的公开技术分享中披露：
- 基于 DeepSpeed ZeRO-2 + gradient checkpointing 组合
- 在 32 卡 A100 80GB 集群上训练 Baichuan-7B
- Activation memory 通过 selective checkpointing 控制，单卡可容纳 7B 全量参数

### 5.2 智谱 ChatGLM 训练成本

智谱 ChatGLM 系列（ChatGLM-6B）在单卡 RTX 3090（24GB）上通过：
- FP16 混合精度
- Gradient checkpointing（full）
- Gradient accumulation（accum=8）

成功完成 1T tokens 的微调——证明了省钱三件套在工程上的可行性。

### 5.3 Qwen（通义千问）训练体系

阿里云 Qwen 团队公开的预训练基础设施（2024）：
- 使用 DeepSpeed ZeRO-3 + FSDP 混合
- 配合 BF16 mixed precision
- 在百卡集群上训练 Qwen-72B

> **架构视角**：Qwen-72B 的训练是典型的 ZeRO-3（参数分片）而非简单 DP——这正是中篇要展开的内容。

---

## 本篇小结

| 概念 | 一句话 | 公式 |
|---|---|---|
| Adam 16Ψ | BF16 混合精度下每参数固定 16 bytes | $M_{\text{static}} = 16\Psi$ |
| Activation 公式 | 随 batch 线性、随 seq 二次方 | $M_{\text{act}} = L \cdot \text{seq} \cdot \text{bs} \cdot h \cdot (34 + \frac{5 n_{\text{heads}} \cdot \text{seq}}{h})$ |
| Full Checkpointing | 牺牲 30-40% compute，省 99% 激活显存 | 8B: 97GB → 1GB |
| Selective Checkpointing | 只对 MHA 重算，省 82% 激活显存，compute 代价仅 2.7% | 8B: 97GB → 17GB |
| Gradient Accumulation | 用时间换显存，effective batch size 不变 | $M_{\text{accum}} = M_{\text{large batch}} / n$ |
| Mixed Precision | BF16 forward/backward + FP32 optimizer | 激活减半，计算加速 |

**中篇预告**：三件套只能延缓，不能根治——当模型参数量本身（比如 70B）已经超过任何单卡承载能力时，必须上**分布式**。Data Parallel 的 All-Reduce / ZeRO-1/2/3 的递进逻辑——下一章讲透。

---

*风格沿用：系列-02 KV Cache 长文风格（机制 → 公式 → 国内案例 → 工程师视角）*
*系列 1/3 · Distributed Training 上篇 · 来源：Suman Debnath / debnsuma.github.io*
