---
title: "Sparse Attention 方法谱系：三条路线"
date: 2026-11-06T15:30:00+08:00
update_date: 2026-11-06T15:30:00+08:00
description: "长上下文推理的算力瓶颈在 O(s²)。把稀疏注意力的方法谱系摊开：静态模式、动态模式、训练时原生稀疏三类路线各自的机制、收益与代价，并说清「保留 1/4 计算量降到 1/16」为什么在 decode 阶段要打折。"
tldr: "稀疏注意力不是一种技术，是一条技术路线图。滑窗便宜但粗暴，动态选择准但有开销，训练时原生稀疏最彻底但最贵——三者都在回答同一个问题：哪些 KV 可以不算。"
keywords: ["Sparse Attention 稀疏注意力", "StreamingLLM attention sinks", "MInference", "Quest 稀疏注意力", "NSA 原生稀疏注意力", "DSA Lightning Indexer"]
taxonomies:
  tags: ["LLM原理", "Attention", "长上下文", "推理优化"]
---

Sparse Attention 的出发点是一个观察：**注意力矩阵里大部分权重接近 0**。既然如此，那就只算那些真正重要的连接。

具体要解决的问题是这样的。长上下文推理撞上的第一堵墙是 `O(s^2)`：序列长度翻一倍，注意力矩阵的元素数精确地乘四——这不是实现不够好，是注意力的定义本身决定的。而稀疏注意力的启发来自一个实测现象：注意力热力图上大片区域接近深紫（激活值≈0），只有少数几行亮起。

但「怎么选」这件事，学术界的答案分成三条路线。本文整理自南京大学《大语言模型基础：从零到一实现之路》第 12 讲（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture12.html)。演示代码与输出为整理时补充，已在 CPU 版 PyTorch 2.8.0 下逐行跑过；各方法的原始数据来自对应论文与官方技术报告。

## 一、先把账算清楚：瓶颈到底在哪

稠密注意力的中间矩阵形状是 `(b, n_h, s, s)`。只算显存账（fp16）：

```python
import torch

print(f"{'seq_len s':>10} {'A 元素数':>16} {'单头 fp16(MB)':>15} {'32层×32头(MB)':>15} {'相对 s=1024':>13}")
base = None
for s in (1024, 2048, 4096, 8192):
    A = torch.empty(s, s, dtype=torch.float16)          # 只分配 shape，不填数据
    n = A.numel()
    mb = n * A.element_size() / 1024 ** 2
    if base is None:
        base = mb
    all_layers = mb * 32 * 32                          # 若每层每头都缓存一份注意力矩阵
    print(f"{s:>10} {n:>16} {mb:>15.1f} {all_layers:>15.1f} {mb / base:>12.0f}x")
    del A
```

输出：

```text
 seq_len s            A 元素数     单头 fp16(MB)     32层×32头(MB)     相对 s=1024
      1024          1048576             2.0          2048.0            1x
      2048          4194304             8.0          8192.0            4x
      4096         16777216            32.0         32768.0           16x
      8192         67108864           128.0        131072.0           64x
```

`s` 每翻一倍，显存精确地 ×4。到 8k 时单头一张矩阵就是 128 MB。

但 KV-cache 是另一份账，而且是线性的：

```text
  s= 1024: KV-cache    512.0 MB  vs  单头注意力矩阵     2.0 MB  -> KV-cache 是它的 256 倍
  s= 8192: KV-cache   4096.0 MB  vs  单头注意力矩阵   128.0 MB  -> KV-cache 是它的 32 倍
```

**两者的比值随 `s` 下降（256 倍 → 32 倍）**：短序列时显存瓶颈全在 KV-cache，长序列时平方项才追上来。优化重点随上下文长度迁移，这是理解后面所有方法取舍的前提。

这张表也解释了两条正交的路线为什么都成立：FlashAttention 不改 `s^2` 的计算量，只把 `s^2` 的**中间矩阵**从显存挪走；稀疏注意力反过来——不改算法结构，只砍掉 `s^2` 里绝大多数接近 0 的格子。

## 二、核心口径：稀疏比 r 与计算量的平方关系

稀疏注意力的形式是把 `K, V` 换成筛选后的子集：

```text
Â = Softmax( Q·K_{s'}^T / √d ) · V_{s'}        s' ≪ s
```

关键在量级关系：**稀疏比例 `r = s'/s` 是一维的，而注意力矩阵是二维的，所以计算量 `∝ r^2`**。

```python
s = 8192
for r in (1.0, 0.5, 0.25, 0.125):
    sp = int(s * r)
    rel = (sp * sp) / (s * s)
    print(f"  r={r:<6} s'={sp:<6} 相对计算量={rel:.4f}  理论加速比={1/rel:.0f}x")
```

输出：

```text
  r=1.0    s'=8192   相对计算量=1.0000  理论加速比=1x
  r=0.5    s'=4096   相对计算量=0.2500  理论加速比=4x
  r=0.25   s'=2048   相对计算量=0.0625  理论加速比=16x
  r=0.125  s'=1024   相对计算量=0.0156  理论加速比=64x
```

这就是常被引用的「保留 1/4 的 KV，计算量降到 1/16」。

**但这个平方只在 prefill 成立。** decode 阶段只有 1 个 query，注意力矩阵退化成 `1 × s` 的向量，计算量 `∝ s'` 是线性的：

```python
gen = 512
for r in (1.0, 0.25):
    full = sum(s + t for t in range(gen))                       # 稠密：读全部 KV
    sparse = sum(r * (s + t) for t in range(gen))               # 稀疏：只读 r 比例
    print(f"  r={r:<5} 生成 {gen} token 累计 KV 访问 = {sparse:.0f}"
          f"  (dense = {full:.0f}, 比值 {sparse / full:.4f})")
```

输出：

```text
  r=1.0   生成 512 token 累计 KV 访问 = 4325120  (dense = 4325120, 比值 1.0000)
  r=0.25  生成 512 token 累计 KV 访问 = 1081280  (dense = 4325120, 比值 0.2500)
```

**prefill 拿平方收益，decode 拿线性收益，而长上下文推理的耗时大头恰恰在 decode。** 这是所有「理论加速 16 倍」宣传数字需要打折的根本原因。

`r` 也是所有方法的同一个调节旋钮——滑窗的窗口宽度 `w`、sink 的个数、Quest 选中的页数，最终都归结为「我留下 `s'` 个 token」。

## 三、路线一：静态模式（Static pattern）

### 滑动窗口

维护一个固定大小的窗口，只保留最近的 token：

```python
import torch, math

torch.manual_seed(0)
s, w, d = 8, 3, 8                       # 8 个 token，窗口大小 3，head_dim = 8
q = torch.randn(s, d)
k = torch.randn(s, d)
v = torch.randn(s, d)
scores = q @ k.T / math.sqrt(d)         # (s, s) 因果注意力分数

keep = torch.zeros(s, s, dtype=torch.bool)
for i in range(s):
    for j in range(max(0, i - w + 1), i + 1):
        keep[i, j] = True
attn = scores.masked_fill(~keep, float("-inf")).softmax(-1)

print("每个 query 实际保留的 token 索引:")
total = 0
for i in range(s):
    idx = keep[i].nonzero().flatten().tolist()
    total += len(idx)
    print(f"  query {i} -> {idx}")
print(f"\n非零元素 {total}/{s * s} = {total / (s * s):.1%}（稠密为 100%）")
```

输出：

```text
每个 query 实际保留的 token 索引:
  query 0 -> [0]
  query 1 -> [0, 1]
  query 2 -> [0, 1, 2]
  query 3 -> [1, 2, 3]
  query 4 -> [2, 3, 4]
  query 5 -> [3, 4, 5]
  query 6 -> [4, 5, 6]
  query 7 -> [5, 6, 7]

非零元素 21/64 = 32.8%（稠密为 100%）
```

mask 是一个沿对角线滑动的带状区域。非零位置密度随 `s` 增大从 `O(w^2/s^2)` 收敛到 `O(w/s)`——这就是滑窗把复杂度从 `O(s^2)` 降到 `O(k)` 的全部机制。

两个实现细节值得单独记：

**mask 之后必须重新 softmax。** `masked_fill(-inf)` 是在 softmax 内部完成的，窗口内的权重会被重新归一化。上面 `query 7` 的三个权重 `0.7592 / 0.0237 / 0.2171` 之和为 1，而不是它们在全量注意力下的原始值。

**行首的 query 天然没有选择余地。** `query 0` 只有一个可见位置，softmax 必然给 1.0000。滑窗在小 `i` 处的行为与长序列处**不一致**，这是精度损失的一个来源。

滑窗的硬伤也很直接：历史再久远的 token 对最终结果的影响被截断为 0，输出完全由窗口内的 `V` 加权而成（上面最后一个 query 的输出就是 `0.7592*V5 + 0.0237*V6 + 0.2171*V7`）。

### Attention sinks（StreamingLLM）

[StreamingLLM](https://arxiv.org/abs/2309.17453)（ICLR 2024）发现一个反直觉的现象：**注意力权重往往会集中在序列开头的几个 token 上**，即使它们在语义上并不重要。作者称之为 attention sink——softmax 必须把概率分完 somewhere，开头的 token 承担了这个「概率出口」的角色。

论文报告的量级是：StreamingLLM 让 Llama-2、MPT、Falcon、Pythia 在有限长度注意力窗口下稳定外推到 **400 万 token** 以上；在流式场景下，相比滑窗重计算基线最高有 **22.2 倍**加速。

工程上的做法非常轻：在滑窗之外，无条件保留序列开头 `n_sink` 个 token。

**为什么这有效**：滑窗把历史 token 全部丢掉，softmax 只能在小窗口内重新分配概率，注意力分布被迫剧变；而加上 sink 之后，模型保住了「开头那几个 token 承接注意力」这个已经学到的模式，精度损失大幅减小。

论文还提到一个额外发现：在预训练时就加入一个专门的 placeholder token 作为 sink，能进一步改善流式部署的效果。

**静态模式的共同局限**：固定的模式无法适应文本生成中变化的关键 token。真实注意力热力图上亮起的少数行往往不遵循任何固定窗口规则，静态规则注定会漏掉它们。

## 四、路线二：动态模式（Dynamic pattern）

动态模式的思路是：先想办法**估计**哪些 KV 重要，再只算那些。

### MInference：识别注意力矩阵的三种形状

[MInference](https://arxiv.org/abs/2407.02490)（NeurIPS 2024 Spotlight）通过观察长上下文注意力矩阵，总结出三种常见模式——**A-Like（因果三角形）、Vertical-Structured（垂直条状）、Block-Sparse（局部块状）**——然后用一个轻量分类器按输入为每个 head 选定最合适的模式，推理时动态构建稀疏索引。

论文报告的数据：8B 模型处理 100 万 token 的 prompt，在单张 A100 上 prefill 需要 **30 分钟**；MInference 把 prefill 延迟降低最多 **10 倍**，且**无需修改预训练设置或额外微调**，可直接套用到已有模型（包括 LLaMA-3-1M、GLM4-1M、Yi-200K、Phi-3-128K、Qwen2-128K）。

注意它明确针对的是 **prefill** 阶段——这也符合上一节的结论：prefill 才是平方项占主导的地方。

### Quest：query-aware 的分页选择

[Quest](https://arxiv.org/abs/2406.10774)（ICML 2024）针对 decode 阶段提出一个不同角度的观察：**某个 token 是否关键，高度依赖当前的 query**。所以不能事先固定一个窗口，而要按 query 动态挑。

具体做法利用了分页结构：Quest 在 KV cache 的每个 page 上维护 Key 的最小值和最大值，用 Query 向量估计每个 page 的关键度，只加载 top-K 个最关键的 page 做注意力。

论文报告：**self-attention 最高 7.03 倍加速**，折算到端到端推理延迟是 **2.23 倍**，精度损失可以忽略。

> ⚠️ 引用提醒：Quest 的 [arXiv 摘要](https://arxiv.org/abs/2406.10774) 把这两个数字写反了（写成「2.23 倍 self-attention、7.03 倍延迟」），[项目主页](https://hanlab.mit.edu/projects/quest) 与 [ICML 论文正文](https://proceedings.mlr.press/v235/tang24l.html) 的表述是 7.03× 算子在 self-attention、2.23× 在端到端。按物理含义取后者——端到端加速不可能大于它优化的那个算子本身。

Quest 的思路和 MInference 正好互补：一个管 prefill（模式识别），一个管 decode（page 级选择）。这也解释了为什么分页设计不只是在管碎片——**page 天然就是稀疏注意力的寻址单位**。

### 动态模式的代价

- **有额外开销**：计算「最合适的 token」本身要花钱，综合下来比简单静态模式慢（但仍快于稠密注意力）。
- **依赖经验与启发式**：选择算法的设计不是原理性的，很多是试出来的。

## 五、路线三：训练时原生稀疏（Training-based）

前两条路线都是「不改模型、只改推理时的计算路径」。第三条路线是**把稀疏性编进模型本身**。

### NSA（Native Sparse Attention）

[NSA](https://arxiv.org/abs/2502.11089)（DeepSeek，2025）用**门控机制**融合三个模块的输出：

1. **压缩分支**——粗粒度的 token 压缩，保留全局上下文；
2. **选择分支**——细粒度的 token 选择，保留局部精度；
3. **滑动窗口分支**——保证局部信息不丢。

三个分支各自产出一个注意力输出，再由门控加权融合。论文强调两点创新：一是算法设计与硬件对齐的**算术强度平衡**带来的实际加速；二是**端到端可训练**——用 NSA 预训练的模型在通用 benchmark、长上下文任务和指令推理上都不逊于 Full Attention，甚至更优。

论文在 64k 长度上给出的加速比（对照 Triton 实现的 FlashAttention-2，同一后端）：**decoding 11.6×、forward 9.0×、backward 6.0×**。三个数字都来自论文正文的实测，不是理论上限——这也说明「原生稀疏」的收益不只是推理，训练侧的 backward 同样受益。

### DSA（DeepSeek Sparse Attention）

[DSA](https://github.com/deepseek-ai/DeepSeek-V3.2-Exp) 是 DeepSeek 在 V3.1-Terminus 基础上通过继续训练加入的机制，架构上的唯一改动就是 DSA。它的原型由两部分组成：

**lightning indexer** 计算 query token `h_t` 与先前 token `h_s` 之间的索引分数：

```text
I_{t,s} = Σ_{j=1..H_I}  w_{t,j}^I · ReLU( q_{t,j}^I · k_s^I )
```

其中 `q_{t,j}^I`、`w_{t,j}^I` 由 query 导出，`k_s^I` 由先前的 token 导出。选 ReLU 是**为了吞吐**——因为 indexer 头数少且可以用 FP8 实现，计算效率很高。

**fine-grained token selection** 机制只取回 top-k 索引分数对应的 KV 条目：

```text
u_t = Attn( h_t, { c_s | I_{t,s} ∈ Top-k(I_{t,:}) } )
```

DSA 建立在 MLA 之上，具体用 MLA 的 **MQA 模式**——每个 latent 向量被该 token 的所有 query head 共享，这是为了 kernel 层面的效率（每个 KV 条目需要被多个 query 共享才划算）。

### 训练路线的总体判断

成本高，所以目前大模型厂商投入不多。但从 DeepSeek 公布的效果看，**训练后的原生稀疏注意力精度几乎无损甚至能反超稠密注意力，推理速度也更快**。

## 六、怎么选：一张对照表

| 方法 | 选择方式 | 是否训练 | 目标阶段 | 论文报告的收益 |
|---|---|---|---|---|
| Sliding window | 静态规则 | 否 | 两者 | 复杂度降到 `O(w)`，精度损失大 |
| StreamingLLM | 静态规则 + sink | 否 | 流式 | 外推至 400 万 token；最高 22.2 倍加速 |
| MInference | 动态（三种模式） | 否 | prefill | prefill 延迟最多降 10 倍 |
| Quest | 动态（query-aware page） | 否 | decode | self-attention 7.03 倍；端到端延迟 2.23 倍 |
| NSA | 训练时原生 | 是 | 全生命周期 | 64k 下三个阶段均有加速，精度不逊于稠密 |
| DSA | 训练时原生 | 是 | 长上下文训练与推理 | lightning indexer 用 FP8 做轻量打分 |

选型上的实用顺序大致是：

- **只是想省点显存 / 支持更长的流式对话** → StreamingLLM，改动最小。
- **prefill 是瓶颈**（超长 prompt 一次性塞进去） → MInference。
- **decode 是瓶颈**（长上下文的持续生成） → Quest 类的 page 级选择。
- **能改训练流程、要的是彻底的确定性收益** → NSA / DSA 这类原生稀疏。

还有一个更省事的选项：**什么都不改，先把 prompt 砍短**。稀疏注意力的所有复杂机制，本质上都是在弥补「输入比需要的长」这个问题。

## FAQ

**Q：稀疏注意力会把质量损失在什么位置？**
A：主要损失在「窗口外的历史 token 恰好是当前 query 真正需要的」这种情况。静态模式按规则裁剪，规则命中不了这种位置；动态模式用启发式估计来弥补，引入了额外开销和估计误差；训练时原生稀疏让模型自己学会怎么裁，精度最好但要付训练成本。

**Q：稀疏比例选多少合适？**
A：没有通用答案，取决于任务。prefill 主导的场景可以激进一些，decode 主导的场景收益本来就是线性的，别指望平方加速。

**Q：attention sink 为什么真的有用，而不只是巧合？**
A：因为 softmax 的概率必须分完。当窗口把所有历史 token 都排除时，注意力分布被迫在小窗口里重新分配，而模型已经学到了「开头 token 承接注意力」这个模式。保留 sink 等于保留了这个出口，分布变化小得多。

**Q：这些方法和 PagedAttention 是什么关系？**
A：正交。PagedAttention 解决的是 KV-cache 的**存储**问题（碎片、淘汰、冷热页管理），稀疏注意力解决的是**计算**问题（哪些 KV 参与 attention）。但分页结构让 page 天然成为稀疏选择的寻址单位，Quest 这类方法正是直接建立在分页之上的。

## 相关阅读

- StreamingLLM（attention sinks）：[arXiv:2309.17453](https://arxiv.org/abs/2309.17453)
- Quest（query-aware 稀疏）：[arXiv:2406.10774](https://arxiv.org/abs/2406.10774)
- MInference（三种注意力模式）：[arXiv:2407.02490](https://arxiv.org/abs/2407.02490)
- NSA（原生可训练稀疏）：[arXiv:2502.11089](https://arxiv.org/abs/2502.11089)
- DeepSeek Sparse Attention 官方技术报告：[DeepSeek_V3_2.pdf](https://github.com/deepseek-ai/DeepSeek-V3.2-Exp/blob/main/DeepSeek_V3_2.pdf)
- MLA 原始论文（DSA 的基础）：[arXiv:2412.19437](https://arxiv.org/abs/2412.19437)
- 同系列的 KV-Cache 第一性原理：[为什么 ChatGPT 第一个字永远慢](/blog/inference-engineering/inference-engineering-series-02-a-kvcache/)
- PagedAttention 与 KV 分页：[PagedAttention 第三章](/blog/inference-engineering/inference-engineering-series-03-c-paged-attention/)
- 一个具体的稀疏注意力工程实践：[HySparse2 详解：让长上下文 Agent 的 Prefill 便宜 5 倍](/blog/paper-reading/hysparse2-prefill-optimization/)
