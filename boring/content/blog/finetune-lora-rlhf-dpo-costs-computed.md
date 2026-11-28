---
title: "微调与对齐的三笔账：显存、人工与采样"
date: "2026-11-27"
description: "从我的面试答案笔记《05 微调与模型适配》里取 LoRA/QLoRA、三阶段数据规模、PPO vs DPO 三题，补三个可跑的模型：LoRA 省的是优化器状态而 QLoRA 省基座权重、三阶段的人工成本账、PPO 的采样算力与四模型驻留。"
tldr: "LoRA 省的是优化器状态、QLoRA 省的是基座权重：7B 全参微调要 104.3 GB（16 bytes/param），LoRA(r=16) 只要 13.2 GB，33B 基座压 4-bit + 双量化后 12.4 GB —— 加上激活 4 GB 共 16.9 GB，24GB 单卡装得下。三阶段人工：SFT $15/条、偏好数据 $30/对（条数少一个量级但单位成本高 2 倍），而预训练 10 TB 是 $1.5 亿算力。PPO vs DPO：PPO 驻留 4 个模型（52.2 GB）且每条 prompt 采 K 个回答（K=8 时生成 $614）；DPO 2 个模型、一次过完。"
keywords: ["LoRA", "QLoRA", "RLHF", "DPO", "模型微调"]
taxonomies:
  tags: ["AI 工程", "模型适配", "技术深度", "面试笔记"]
---

微调与对齐的三笔账？显存省在哪、人工标哪段最贵、PPO 到底多花多少钱。我的面试答案笔记《05 微调与模型适配》里有 11 道题（LoRA、QLoRA、Prefix/Prompt Tuning、adapter、预训练-SFT-偏好优化三阶段、RLHF、Deep RL from Human Preferences、DPO 取代 PPO……），答案都写得很完整，但三笔「各是多少」是定性的。这篇把它们算出来。

## 口径说明

- 源是我自己的面试答案笔记 `06-面试/答案/05-微调与适配-答案.md`（38 KB，11 题）。可以自由引用；本文正文主体是**自写可复现模型**。
- 三个脚本只依赖 Python 标准库；输出为实跑结果，逐行可复现（无随机数，两次运行输出逐字一致）。
- 笔记里给出的量（LoRA 的 `W' = W0 + (α/r)BA`、r 典型 4~64、α = r 或 2r、QLoRA 的 NF4 4-bit / 双量化每 block 省 ~0.5 bit / 33B 在 24GB RTX 4090 上微调、三阶段数据规模表、SFT LR=2e-5 2-3 epochs、RLHF LR=5e-7 KL β=0.1、PPO vs DPO 八维表与「显存 4× vs 2×」）直接标注来源；**我为了建模补的**（每参数字节、层数与宽度、标注工时与人力单价、token 单价、K 采样数）都标为「估」。
- **撞题检查**：自动判 HIGH_RISK，命中的是 `inference-engineering` 系列与含「微调/量化」字样的泛词假阳性；已发语料里没有「PEFT 显存结构与偏好对齐成本」这一篇。

## 一、笔记的骨架：三个机制

**Q3 LoRA**：冻结预训练权重 `W0`，旁边加一对**低秩矩阵 A、B** 近似权重更新：`W' = W0 + (α/r)BA`，其中 `W0 ∈ R^{d×k}`、`A ∈ R^{r×k}`（随机高斯初始化）、`B ∈ R^{d×r}`（**全零初始化**，保证初始 ΔW = 0），**r 是瓶颈维度、典型 4~64**，α 是缩放因子（常设 α = r 或 2r）。

**Q4 QLoRA**：**NF4 量化预训练权重 + LoRA Adapter + Paged Optimizers**，让 **33B 模型在 24GB 单卡（RTX 4090）上微调成为可能**。三个创新：NF4 按正态分位数分配量化区间（比传统 INT4 精度高约 10%）；**双量化**（对量化常数本身再做一次 block-wise INT8 量化，每 block 省约 0.5 bit，33B 省约 3GB）；**Paged Optimizers**（用 NVIDIA 统一内存，optimizer 状态在显存不足时自动 page 到 CPU RAM，防 Adam state 峰值 OOM）。

**Q8/Q11 三阶段与 DPO**：数据规模——预训练 1–10 TB 文本（1–15 T tokens）、SFT 10k–1M 条指令（100M–1B tokens）、偏好优化 10k–100k 对（50M–200M tokens）；超参——SFT LR=2e-5、2–3 epochs，RLHF/DPO LR=5e-7、KL β=0.1。PPO vs DPO 的八维对比里最硬的两条是：**显存 4×（policy + ref + RM + value）vs 2×（policy + ref）**、**数据效率低（在线采样）vs 高（一次过完数据集）**；而 DPO 取代 PPO 的四条理由是简单、稳定、便宜（少 2–4 个模型副本）、开源友好。笔记还指出**可验证 reward 场景（RLVR/GRPO）仍该用在线 RL**。

## 二、增量一：LoRA 省的是优化器状态，QLoRA 省的是基座权重

这是两件不同的事，笔记把它们并列了但没拆开算。拆开算：

```python
"""LoRA / QLoRA 的显存账：省的是优化器状态，还是基座权重本身。

用笔记的量：LoRA 的 W0(d x k) + A(r x k) + B(d x r)、r 典型 4~64、QLoRA 的 NF4 4-bit、
双量化每 block 省 ~0.5 bit（33B 省 ~3GB）、33B 在 24GB 单卡（RTX 4090）上微调。
只依赖标准库；输出确定性。
"""
GB = 1024 ** 3

def lora_params(model_b, d, k, layers, r, per_layer_matrices=2):
    """LoRA 参数量：每层每个投影矩阵是 A(r x k) + B(d x r)"""
    per_matrix = r * k + d * r
    return per_matrix * per_layer_matrices * layers

print("一、全参微调的显存账（混合精度的经典口径）")
BYTES_FULL = {"fp16 权重": 2, "fp16 梯度": 2, "fp32 master": 4, "Adam m": 4, "Adam v": 4}
total_bytes = sum(BYTES_FULL.values())
print("   每参数字节：%s -> 合计 %d bytes/param" % (" + ".join("%s %d" % (k2, v) for k2, v in BYTES_FULL.items()), total_bytes))
for name, params in (("7B", 7_000_000_000), ("13B", 13_000_000_000), ("33B", 33_000_000_000)):
    print("   全参微调 %4s：权重+梯度+优化器状态 = %6.1f GB" % (name, params * total_bytes / GB))
print()
print("二、LoRA：基座冻结，梯度与优化器状态只覆盖 LoRA 参数")
D = 4096
LAYERS = 32
for r in (4, 16, 64):
    p = lora_params(7_000_000_000, D, D, LAYERS, r)
    lora_state = p * total_bytes          # LoRA 参数同样要梯度+master+m+v
    base = 7_000_000_000 * 2              # 冻结基座只有 fp16 权重
    print("   7B、r=%2d：LoRA 参数 %10s 个（占全参 %.3f%%）-> 基座 %5.1f GB + LoRA 状态 %5.2f GB = %5.1f GB"
          % (r, format(p, ","), 100 * p / 7_000_000_000, base / GB, lora_state / GB, (base + lora_state) / GB))
print()
print("   => LoRA 省的是**优化器状态与梯度**（只覆盖 r 那部分），不是基座权重。")
print("      7B 全参要 %.0f GB，LoRA 只要 %.0f GB 量级。" % (7_000_000_000 * total_bytes / GB, 7_000_000_000 * 2 / GB))
print()
print("三、QLoRA：基座也压到 4-bit")
NF4_BYTES = 0.5           # 4 bit + 分块量化常数摊销
DOUBLE_QUANT_SAVE = 3 * GB   # 笔记：33B 双量化省 ~3GB
for name, params in (("7B", 7_000_000_000), ("33B", 33_000_000_000)):
    base4 = params * NF4_BYTES
    saved = DOUBLE_QUANT_SAVE if params >= 33_000_000_000 else 0
    print("   %4s：基座 4-bit = %5.1f GB%s" % (name, (base4 - saved) / GB,
          "（双量化再省 %.1f GB）" % (saved / GB) if saved else ""))
print()
print("   验证笔记的说法「33B 在 24GB 单卡（RTX 4090）上微调」：")
p33 = lora_params(33_000_000_000, 8192, 8192, 64, 16)
base33 = 33_000_000_000 * NF4_BYTES - DOUBLE_QUANT_SAVE
lora33_state = p33 * total_bytes
act = 4 * GB
print("     基座 4-bit + 双量化 %5.1f GB" % (base33 / GB))
print("     LoRA 参数 %s 个 -> 状态 %5.2f GB" % (format(p33, ","), lora33_state / GB))
print("     激活/临时缓冲（估）              %5.1f GB" % (act / GB))
total = base33 + lora33_state + act
print("     合计 %5.1f GB -> %s 24GB 单卡" % (total / GB, "装得下" if total <= 24 * GB else "装不下"))
print()
print("判据：")
print("  - **LoRA 省优化器状态，QLoRA 省基座权重**：两者是叠加的两件事，不能互相替代；")
print("    7B 全参 %.0f GB -> LoRA %.1f GB（基座 fp16）-> 33B 基座 4-bit %.1f GB，这就是 33B 进 24GB 的路径。" % (
    7_000_000_000 * total_bytes / GB, 7_000_000_000 * 2 / GB, base33 / GB))
print("  - **r 的收益递减很快**：r 从 4 到 64，LoRA 参数翻 16 倍，但相对全参始终是千分之几；")
print("    所以 r 的选择应该由「数据量与任务难度」定，而不是显存（显存几乎不敏感）。")
```

输出：

```text
一、全参微调的显存账（混合精度的经典口径）
   每参数字节：fp16 权重 2 + fp16 梯度 2 + fp32 master 4 + Adam m 4 + Adam v 4 -> 合计 16 bytes/param
   全参微调   7B：权重+梯度+优化器状态 =  104.3 GB
   全参微调  13B：权重+梯度+优化器状态 =  193.7 GB
   全参微调  33B：权重+梯度+优化器状态 =  491.7 GB

二、LoRA：基座冻结，梯度与优化器状态只覆盖 LoRA 参数
   7B、r= 4：LoRA 参数  2,097,152 个（占全参 0.030%）-> 基座  13.0 GB + LoRA 状态  0.03 GB =  13.1 GB
   7B、r=16：LoRA 参数  8,388,608 个（占全参 0.120%）-> 基座  13.0 GB + LoRA 状态  0.12 GB =  13.2 GB
   7B、r=64：LoRA 参数 33,554,432 个（占全参 0.479%）-> 基座  13.0 GB + LoRA 状态  0.50 GB =  13.5 GB

   => LoRA 省的是**优化器状态与梯度**（只覆盖 r 那部分），不是基座权重。
      7B 全参要 104 GB，LoRA 只要 13 GB 量级。

三、QLoRA：基座也压到 4-bit
     7B：基座 4-bit =   3.3 GB
    33B：基座 4-bit =  12.4 GB（双量化再省 3.0 GB）

   验证笔记的说法「33B 在 24GB 单卡（RTX 4090）上微调」：
     基座 4-bit + 双量化  12.4 GB
     LoRA 参数 33,554,432 个 -> 状态  0.50 GB
     激活/临时缓冲（估）                4.0 GB
     合计  16.9 GB -> 装得下 24GB 单卡

判据：
  - **LoRA 省优化器状态，QLoRA 省基座权重**：两者是叠加的两件事，不能互相替代；
    7B 全参 104 GB -> LoRA 13.0 GB（基座 fp16）-> 33B 基座 4-bit 12.4 GB，这就是 33B 进 24GB 的路径。
  - **r 的收益递减很快**：r 从 4 到 64，LoRA 参数翻 16 倍，但相对全参始终是千分之几；
    所以 r 的选择应该由「数据量与任务难度」定，而不是显存（显存几乎不敏感）。
```

三处结论：

**第一，全参微调的显存是 16 bytes/param，不是 2。** fp16 权重 2 + fp16 梯度 2 + fp32 master 4 + Adam m 4 + Adam v 4 = **16** → **7B 要 104.3 GB、13B 要 193.7 GB、33B 要 491.7 GB**。这解释了为什么「有 7B 权重」和「能微调 7B」之间差着 8 倍。

**第二，LoRA 之所以省显存，是因为梯度与优化器状态只覆盖那 0.03%–0.48% 的 LoRA 参数。** 7B、r=4 → LoRA 参数 209 万个（占全参 **0.030%**），基座 13.0 GB + LoRA 状态 0.03 GB；r=64 → 3355 万个（0.479%），状态 0.50 GB，总计 13.5 GB。**省下的是优化器状态与梯度，不是基座权重**——基座仍以 fp16 全量驻留。

**第三，QLoRA 省的是基座本身，两件事叠加才有 33B/24GB。** 33B 基座压到 4-bit 是 16.5 GB，双量化再省 3 GB → **12.4 GB**；加上 LoRA 状态 0.50 GB 与激活/临时缓冲（估 4 GB）→ **合计 16.9 GB，24GB 单卡装得下** ✓ 与笔记的说法一致。而 7B 基座压 4-bit 后只要 **3.3 GB**。

**顺带一条选型判据：r 对显存几乎不敏感。** r 从 4 到 64，LoRA 参数翻 16 倍，但相对全参始终是千分之几，总显存只从 13.1 GB 变到 13.5 GB。**所以 r 该由「数据量与任务难度」决定，而不是由显存决定**——想省显存请去压基座（QLoRA），调 r 是白费力气。

## 三、增量二：三阶段里最贵的是偏好数据的人工

笔记给了三阶段的数据规模表。把人工成本加上去：

```python
"""三阶段的数据规模与人工成本账：偏好数据是单位成本最高的一段。

用笔记的量：预训练 1-10 TB / 1-15 T tokens、SFT 10k-1M 条 / 100M-1B tokens、
偏好优化 10k-100k 对 / 50M-200M tokens。
只依赖标准库；输出确定性。
"""
GB = 1024 ** 3
HOURS_PER_ITEM = 0.25     # 人工标一条 SFT 样本（估，15 分钟）
HOURS_PER_PAIR = 0.5      # 人工标一对偏好（估，30 分钟：读两个回答 + 选）
LABOR_RATE = 60           # 全成本人力单价（美元/小时，估）

print("%-16s %22s %22s %22s" % ("阶段", "条数（典型）", "token 数", "人工小时（估）"))
rows = (
    ("Pre-training", 0, 0, 0),
    ("SFT", 10_000, 100_000_000, 10_000 * HOURS_PER_ITEM),
    ("SFT 上限", 1_000_000, 1_000_000_000, 1_000_000 * HOURS_PER_ITEM),
    ("Preference Opt", 10_000, 50_000_000, 10_000 * HOURS_PER_PAIR),
    ("Preference 上限", 100_000, 200_000_000, 100_000 * HOURS_PER_PAIR),
)
for name, items, tokens, hours in rows:
    print("%-16s %22s %22s %22s" % (name, format(items, ",") if items else "（不可数）",
                                    format(tokens, ",") if tokens else "-", format(int(hours), ",")))
print()
print("人工成本（按 $%d/小时）：" % LABOR_RATE)
for name, items, tokens, hours in rows:
    if not hours:
        continue
    print("  %-16s %6.0f 人时 = $%s" % (name, hours, format(int(hours * LABOR_RATE), ",")))
print()
print("预训练阶段的对照：")
for tb in (1, 10):
    tokens = tb * 1e12
    cost = tokens / 1e6 * 15      # $15 / 1M token（估，H100 集群口径）
    print("  %2d TB 文本 = %s tokens -> 算力成本约 $%s" % (tb, format(int(tokens), ","), format(int(cost), ",")))
print()
print("单位成本对比（每条样本）：")
print("  SFT：%d 条 x %.2f 小时 = $%.2f/条" % (10_000, HOURS_PER_ITEM, HOURS_PER_ITEM * LABOR_RATE))
print("  偏好：%d 对 x %.2f 小时 = $%.2f/对（还要读两个回答才算一对）" % (10_000, HOURS_PER_PAIR, HOURS_PER_PAIR * LABOR_RATE))
print()
print("判据：")
print("  - **偏好数据的条数比 SFT 少一个量级，但单位成本高 2 倍**（$%s/对 vs $%s/条）；" % (
    format(HOURS_PER_PAIR * LABOR_RATE, ".2f"), format(HOURS_PER_ITEM * LABOR_RATE, ".2f")))
print("    所以它是三阶段里**最贵的一段人工**——这也是「复用已有 RM 数据集」的动机。")
print("  - **预训练阶段的成本形态完全不同**：不是人工而是算力，量级上 $%s（10 TB）——" % format(int(10e12 / 1e6 * 15), ","))
print("    这解释了为什么绝大多数团队只做后两段：前一段的门槛不是钱而是数据与集群规模。")
print("  - 判据：**先算「每阶段人工小时 ÷ 产出质量」再决定做哪一段**——SFT 的单位时间产出通常最高。")
```

输出：

```text
阶段                               条数（典型）                token 数                人工小时（估）
Pre-training                      （不可数）                      -                      0
SFT                              10,000            100,000,000                  2,500
SFT 上限                        1,000,000          1,000,000,000                250,000
Preference Opt                   10,000             50,000,000                  5,000
Preference 上限                   100,000            200,000,000                 50,000

人工成本（按 $60/小时）：
  SFT                2500 人时 = $150,000
  SFT 上限           250000 人时 = $15,000,000
  Preference Opt     5000 人时 = $300,000
  Preference 上限     50000 人时 = $3,000,000

预训练阶段的对照：
   1 TB 文本 = 1,000,000,000,000 tokens -> 算力成本约 $15,000,000
  10 TB 文本 = 10,000,000,000,000 tokens -> 算力成本约 $150,000,000

单位成本对比（每条样本）：
  SFT：10000 条 x 0.25 小时 = $15.00/条
  偏好：10000 对 x 0.50 小时 = $30.00/对（还要读两个回答才算一对）

判据：
  - **偏好数据的条数比 SFT 少一个量级，但单位成本高 2 倍**（$30.00/对 vs $15.00/条）；
    所以它是三阶段里**最贵的一段人工**——这也是「复用已有 RM 数据集」的动机。
  - **预训练阶段的成本形态完全不同**：不是人工而是算力，量级上 $150,000,000（10 TB）——
    这解释了为什么绝大多数团队只做后两段：前一段的门槛不是钱而是数据与集群规模。
  - 判据：**先算「每阶段人工小时 ÷ 产出质量」再决定做哪一段**——SFT 的单位时间产出通常最高。
```

三处结论：

**第一，偏好数据的条数比 SFT 少一个量级，但单位成本高 2 倍。** SFT 标一条要 15 分钟（$15/条），偏好标一对要读**两个**回答再选（30 分钟、$30/对）——于是 1 万条 SFT（2,500 人时、$15 万）与 1 万对偏好（5,000 人时、$30 万）相比，**偏好是三阶段里单位成本最高的一段人工**。这正是「优先复用 HH-RLHF / UltraFeedback 这类现成 RM 数据集」的动机。

**第二，预训练阶段的成本形态完全不同——不是人工，是算力。** 按 $15/1M token 估：1 TB 文本 ≈ **$1,500 万**，10 TB ≈ **$1.5 亿**。所以大多数团队只做后两段，**门槛不是钱而是数据与集群规模**。

**第三，判据是「每阶段人工小时 ÷ 产出质量」，不是「哪个阶段更高级」。** SFT 的单位时间产出通常最高（把模型「格式化」），偏好优化是把模型「价值观化」；如果预算只够一段，先做 SFT。**注意上限也很凶**：SFT 做到 100 万条就是 25 万人时、**$1,500 万**——SFT 数据量不是可以线性堆的。

## 四、增量三：PPO 的钱花在采样与驻留上

笔记的八维对比里「显存 4× vs 2×」和「在线 vs 离线」是最硬的两条。算成钱：

```python
"""PPO vs DPO：采样算力与驻留模型的账。

用笔记的量：PPO 在线 RL、需 RM + value model、显存 4x（policy + ref + RM + value）；
DPO 离线、显存 2x（policy + ref）、数据效率高；RLVR/GRPO 场景采样 K 个回答。
只依赖标准库；输出确定性。
"""
GB = 1024 ** 3
MODEL_PARAMS = 7_000_000_000
FP16_BYTES = 2
GEN_TOKENS = 512           # 每个回答的 token 数（估）
K_SAMPLES = (4, 8, 16, 64) # 每次 prompt 采样的回答数（GRPO 常用 8~64）
PROMPT_PAIRS = 50_000      # 偏好数据条数（估）
TRAIN_TOKEN_COST = 15 / 1e6   # $15 / 1M token 训练算力（估）
GEN_TOKEN_COST = 3 / 1e6      # $3 / 1M token 生成算力（估）

print("一、驻留模型的显存")
for label, models in (("PPO（policy+ref+RM+value）", 4), ("DPO（policy+ref）", 2)):
    mem = MODEL_PARAMS * FP16_BYTES * models / GB
    print("   %-26s %d 个模型 x 7B fp16 = %5.1f GB" % (label, models, mem))
print("   => 差 %d GB：PPO 多出的 RM 与 value 是纯额外驻留（且要一起反传）" % (
    int(MODEL_PARAMS * FP16_BYTES * 2 / GB)))
print()
print("二、PPO 的在线采样开销")
print("   偏好数据 %s 条，每条 prompt 采 K 个回答算 reward：" % format(PROMPT_PAIRS, ","))
print("%-10s %18s %18s %16s" % ("K", "生成次数", "生成 token", "生成成本(估)"))
for k in K_SAMPLES:
    gens = PROMPT_PAIRS * k
    toks = gens * GEN_TOKENS
    cost = toks * GEN_TOKEN_COST
    print("%-10d %18s %18s %16s" % (k, format(gens, ","), format(toks, ","), "$" + format(int(cost), ",")))
print()
print("   DPO 的对照：一次过完数据集，每条偏好对做 2 次前向（chosen/ref）+ 1 次反传")
fwd = PROMPT_PAIRS * 2
train_cost = fwd * 1024 * TRAIN_TOKEN_COST
print("     前向 %s 次 x 1024 token = %s token -> 训练算力约 $%s"
      % (format(fwd, ","), format(int(fwd * 1024), ","), format(int(train_cost), ",")))
print()
print("三、两者在同一份偏好数据上的成本对比")
for k in (8, 64):
    gen_cost = PROMPT_PAIRS * k * GEN_TOKENS * GEN_TOKEN_COST
    total = gen_cost + train_cost
    print("   PPO(K=%2d)：生成 $%s + 训练 $%s = $%s" % (k, format(int(gen_cost), ","),
          format(int(train_cost), ","), format(int(total), ",")))
print("   DPO    ：$%s（无采样）" % format(int(train_cost), ","))
print()
print("四、什么时候在线 RL 仍值得（笔记：RLVR/GRPO、可验证 reward）")
print("   可验证 reward（单元测试通过率）不需要 RM 模型 -> 省掉 RM 与 value 的驻留与训练；")
print("   但仍要采样 K 个候选，且 K 越大越接近「用算力换探索」：K=64 时生成 $%s。" % format(
    int(PROMPT_PAIRS * 64 * GEN_TOKENS * GEN_TOKEN_COST), ","))
print()
print("判据：")
print("  - **DPO 省的是「采样算力 + 两个模型副本」**：PPO 要 4 个模型驻留（+%d GB）、每条 prompt 采 K 个回答；" % int(MODEL_PARAMS * FP16_BYTES * 2 / GB))
print("    DPO 只要 2 个模型、一次过完数据集。K=8 时 PPO 的生成成本就已达 $%s 量级。" % format(int(PROMPT_PAIRS * 8 * GEN_TOKENS * GEN_TOKEN_COST), ","))
print("  - **在线 RL 的优势不在「效果略好」，而在「能探索出离线数据里没有的解」**——")
print("    有可验证 reward（代码、数学）时这个价值才兑现；纯主观偏好上，DPO 的性价比通常更高。")
print("  - 判据：**「要不要在线 RL」是个 reward 可验证性问题，不是算法优劣问题**。")
```

输出：

```text
一、驻留模型的显存
   PPO（policy+ref+RM+value）   4 个模型 x 7B fp16 =  52.2 GB
   DPO（policy+ref）            2 个模型 x 7B fp16 =  26.1 GB
   => 差 26 GB：PPO 多出的 RM 与 value 是纯额外驻留（且要一起反传）

二、PPO 的在线采样开销
   偏好数据 50,000 条，每条 prompt 采 K 个回答算 reward：
K                        生成次数           生成 token          生成成本(估)
4                     200,000        102,400,000             $307
8                     400,000        204,800,000             $614
16                    800,000        409,600,000           $1,228
64                  3,200,000      1,638,400,000           $4,915

   DPO 的对照：一次过完数据集，每条偏好对做 2 次前向（chosen/ref）+ 1 次反传
     前向 100,000 次 x 1024 token = 102,400,000 token -> 训练算力约 $1,536

三、两者在同一份偏好数据上的成本对比
   PPO(K= 8)：生成 $614 + 训练 $1,536 = $2,150
   PPO(K=64)：生成 $4,915 + 训练 $1,536 = $6,451
   DPO    ：$1,536（无采样）

四、什么时候在线 RL 仍值得（笔记：RLVR/GRPO、可验证 reward）
   可验证 reward（单元测试通过率）不需要 RM 模型 -> 省掉 RM 与 value 的驻留与训练；
   但仍要采样 K 个候选，且 K 越大越接近「用算力换探索」：K=64 时生成 $4,915。

判据：
  - **DPO 省的是「采样算力 + 两个模型副本」**：PPO 要 4 个模型驻留（+26 GB）、每条 prompt 采 K 个回答；
    DPO 只要 2 个模型、一次过完数据集。K=8 时 PPO 的生成成本就已达 $614 量级。
  - **在线 RL 的优势不在「效果略好」，而在「能探索出离线数据里没有的解」**——
    有可验证 reward（代码、数学）时这个价值才兑现；纯主观偏好上，DPO 的性价比通常更高。
  - 判据：**「要不要在线 RL」是个 reward 可验证性问题，不是算法优劣问题**。
```

三处结论：

**第一，PPO 多出的 26 GB 是纯额外驻留。** 7B fp16 下 PPO 要 4 个模型（policy + ref + RM + value）= **52.2 GB**，DPO 只要 2 个（policy + ref）= **26.1 GB**。而 RM 与 value 还要一起参与反传——**它们不只是占显存，还要跟着 policy 一起更新**。

**第二，PPO 的采样开销随 K 线性涨，而 K 在 RLVR 里往往开到 8~64。** 5 万条偏好数据、每个回答 512 token：K=4 → 20 万次生成、$307；K=8 → **$614**；K=16 → $1,228；K=64 → **$4,915**。对照 DPO：一次过完数据集，10 万次前向（chosen + ref）≈ **$1,536**，**没有采样这一项**。所以同一份偏好数据上，PPO(K=8) 合计 $2,150、PPO(K=64) $6,451，而 DPO $1,536。

**第三，「要不要在线 RL」是 reward 可验证性问题，不是算法优劣问题。** DPO 省的是**采样算力 + 两个模型副本**；PPO 的优势是「能探索出离线数据里没有的解」——但这个优势只在 **reward 可自动验证**（代码的单元测试通过率、数学答案）时才兑现，那正是笔记说的 RLVR/GRPO 场景。**纯主观偏好上，DPO 的性价比通常更高**；而一旦 reward 可验证，K=64 的 $4,915 采样钱换来的是「模型能自己找到没见过的解」，那才值。

## 五、把三个模型套回本章（判据清单）

1. **全参微调是 16 bytes/param**：7B → 104.3 GB、13B → 193.7 GB、33B → 491.7 GB。「有 7B 权重」不等于「能微调 7B」。
2. **LoRA 省优化器状态与梯度**（只覆盖那 0.03%–0.48% 的参数），不省基座权重；7B LoRA(r=16) 只要 13.2 GB。
3. **QLoRA 省基座本身**：33B 基座 4-bit + 双量化 = 12.4 GB，加状态与激活共 **16.9 GB** → 24GB 单卡成立。
4. **r 对显存几乎不敏感**（13.1 → 13.5 GB）→ r 该按数据量与任务难度选，不按显存选。
5. **偏好数据单位成本最高**：$30/对 vs SFT $15/条，条数虽少一个量级；先用现成 RM 数据集。
6. **预训练是算力门槛而非人工门槛**：10 TB ≈ $1.5 亿；SFT 做到 100 万条也要 25 万人时（$1,500 万）。
7. **PPO 多出的 RM + value = +26 GB 驻留**，还要一起反传。
8. **PPO 的采样随 K 线性涨**：K=8 → $614、K=64 → $4,915；DPO 无采样、一次过完（$1,536）。
9. **在线 RL 的价值取决于 reward 能否自动验证**：能（代码/数学）就用 GRPO/RLVR，不能就 DPO。

## 六、这一章不重复已发的内容

- **推理引擎与显存/批处理**（KV Cache、PagedAttention、连续批处理）：见 `inference-engineering` 系列——本文只算**训练侧**的显存结构与对齐成本。
- **单层流式推理让消费级 GPU 跑千亿模型**（AirLLM）：见《[AirLLM 单层流式推理](/blog/airllm-single-layer-streaming-inference/)》——那篇是推理侧的省显存路线，本文是训练侧的参数高效路线。
- **成本与限流的运营面**：见《[限流算法实测](/blog/rate-limiter-algorithms-measured/)》与《[Agent 的 token 成本](/blog/agent-token-cost-per-task/)》——本文算的是**对齐训练**的一次性成本。

## 七、这三个模型判不了什么

- **16 bytes/param 是混合精度的经典口径**，实际实现差异很大（bf16 + 优化器状态 offload、8-bit Adam、梯度检查点策略都会改数）；LoRA 的状态量还受「作用在哪些矩阵上」影响很大（我只算了注意力投影）。**判据：这些模型给的是量级与结构，不是采购清单**。
- **没算数据质量的退化效应**：SFT 数据 1 万条里若 20% 是低质样本，实际收益远低于线性外推；**单位时间产出的假设（每条都有效）在这里最脆弱**。
- **没算 PPO 的训练稳定性成本**。笔记说 PPO「超参敏感、易崩溃」——崩训的代价是**跑掉的算力与人力**，而这在成本账里完全没体现；DPO 的稳定是它最大的隐性收益。
- **没算 RM 的质量天花板**。PPO 的上限由 RM 决定，而 RM 只见过它标注的那几万对；**RM 没见过的偏好，PPO 也学不到**——这是离线方法（DPO 也一样）的共同天花板，不是 PPO 独有。
- **三个模型都没碰 Prefix/Prompt Tuning 与 adapter**（笔记 Q6/Q7）：它们是同一「参数高效」谱系的其他位置，显存结构与 LoRA 类似但**注入位置不同**（前缀 vs 权重），这一层差异没展开。

## FAQ（八、常见问题）

**LoRA 到底省了什么？** 省的是**优化器状态与梯度**，不是基座权重：7B 全参微调要 **104.3 GB**（16 bytes/param：权重 2 + 梯度 2 + fp32 master 4 + Adam m/v 8），LoRA(r=16) 只要 **13.2 GB**，因为梯度与优化器状态只覆盖那 0.12% 的 LoRA 参数，基座仍以 fp16 全量驻留。

**那 QLoRA 省的是什么？** 省的是**基座权重本身**：33B 基座 4-bit 是 16.5 GB，双量化再省 3 GB → 12.4 GB；加上 LoRA 状态与激活共 **16.9 GB**，「33B 在 24GB 单卡上微调」就是这么成立的。**LoRA 与 QLoRA 是叠加的两件事。**

**r 该设多大？** 别拿显存当依据——r 从 4 到 64，LoRA 参数翻 16 倍，但总显存只从 13.1 GB 变到 13.5 GB。**r 该由数据量与任务难度决定**。

**三阶段里哪段最贵？** 单位成本上最贵的是**偏好数据**（$30/对 vs SFT $15/条，条数还少一个量级）；总量上最贵的是 SFT 上限（100 万条 = 25 万人时、$1,500 万）；而预训练根本不是人工问题，是集群与数据规模问题（10 TB ≈ $1.5 亿算力）。

**PPO 比 DPO 贵在哪？** 两处：PPO 驻留 4 个模型（policy + ref + RM + value）= **52.2 GB** vs DPO 的 2 个 = 26.1 GB；以及**每条 prompt 要采 K 个回答**——5 万条偏好、K=8 是 $614、K=64 是 **$4,915**，而 DPO 一次过完数据只要 $1,536。

**那什么时候还该用在线 RL？** 当 **reward 可自动验证**时：代码的单元测试通过率、数学答案——这正是 RLVR/GRPO 的场景，此时采样花的钱换来的是「模型能探索出离线数据里没有的解」。纯主观偏好上，DPO 的性价比通常更高。

## 出处

- 源笔记（我的）：`06-面试/答案/05-微调与适配-答案.md`（11 道题的完整答案，本文取 Q3 / Q4 / Q8 / Q11 四题）。
- 相关一手资料：[LoRA 论文（arXiv:2106.09685）](https://arxiv.org/abs/2106.09685)（低秩适配与 r 的选择）、[QLoRA 论文（arXiv:2305.14314）](https://arxiv.org/abs/2305.14314)（NF4、双量化、paged optimizers 与 33B/24GB）、[DPO 论文（arXiv:2305.18290）](https://arxiv.org/abs/2305.18290)（离线目标与相对策略优化）。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
