---
title: "FlashAttention：把注意力从显存搬回片上"
date: 2026-11-10
update_date: 2026-11-10
description: "FlashAttention 不改注意力的数学，只改它搬运数据的方式。这篇拆开它的三个机关——分块、在线 softmax、一次遍历——说清每一步省下了哪一次 HBM 往返，并解释为什么三代内核（FA-1/2/3）改的全是访存调度而不是算术。"
tldr: "注意力慢在搬数据不在算公式。分块让中间矩阵不落盘，在线 softmax 消除了「必须先看完整行」的依赖，一次遍历把重算也省掉——FLOPs 一个没少，HBM 往返少了一个量级。"
keywords: ["FlashAttention 原理", "online softmax 在线softmax", "IO 感知 attention", "HBM SRAM 分块 tiling", "FlashAttention-2 加速", "FlashAttention-3 Hopper"]
taxonomies:
  tags: ["LLM原理", "Attention", "GPU", "推理优化"]
---

# FlashAttention：把注意力从显存搬回片上

FlashAttention 优化的是搬运，不是算术。这一点是理解它的全部前提：标准注意力的计算量是二次的，FlashAttention 的计算量也是二次的，一个 FLOP 都没省；它省下的是中间矩阵在 HBM（GPU 主存）和 SRAM（片上高速缓存）之间往返的次数。

本文整理自南京大学《大语言模型基础：从零到一实现之路》第 7 讲（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture7.html)。文中的三个数值实验在 CPU 版 PyTorch 2.8.0 下逐行跑过；加速比等硬件数字来自三篇原始论文，已在文末给出来源。

如果你想先看这类优化的经济学框架——为什么注意力是内存受限而不是算力受限——可以先读 [从 FLOPS 到美元：LLM 推理成本的数学推导](/blog/llm-inference-cost-deep-dive/)；想了解「不省算力、只砍连接」这条正交路线，看 [Sparse Attention 方法谱系](/blog/sparse-attention-methods-landscape/)。

## 一、标准注意力的访存账：8 次 HBM 往返

标准注意力分三行写成：

```text
S = Q K^T          # 读 Q、K，写 S
P = softmax(S)     # 读 S，写 P
O = P V            # 读 P、V，写 O
```

三行里有 8 次对 HBM 的访问：读 Q、读 K、写 S、读 S、写 P、读 P、读 V、写 O。其中最贵的是那张 `s × s` 的分数矩阵——它要在显存里完整地存在一次，写进去、再读出来、算完 softmax、再写一遍。

代价可以直接算出来。下面这段只做字节数统计，不碰 CUDA：

```python
import torch

def attn_MB(seq_len, elem_size=2):
    """单个注意力头的分数矩阵 S=QK^T(fp16) 占多少 MiB"""
    return seq_len * seq_len * elem_size / 1024 ** 2

seq_lens = [1024, 2048, 4096, 8192, 16384]
H, B, L = 8, 8, 16          # heads / batch_size / layers（LLaMA-7B 量级）
base = attn_MB(seq_lens[0])

print(f"{'seq_len':>8} | {'单头 attn(fp16)':>16} | {'8头×batch8(单层)':>18} | {'16层合计':>12} | {'相对 seq=1024':>14}")
print("-" * 86)
for s in seq_lens:
    mb = attn_MB(s)
    layer_mb = mb * H * B
    print(f"{s:>8} | {mb:>12.1f} MB | {layer_mb:>14.0f} MB | {layer_mb * L / 1024:>8.1f} GB | {mb / base:>13.0f}x")

print()
print("同一张矩阵的真实占用（torch 实测）:",
      f"{torch.zeros(4096, 4096, dtype=torch.float16).nbytes / 1024**2:.1f} MB",
      f"{torch.zeros(8192, 8192, dtype=torch.float16).nbytes / 1024**2:.1f} MB")
```

实测输出：

```text
 seq_len |    单头 attn(fp16) |      8头×batch8(单层) |        16层合计 |    相对 seq=1024
--------------------------------------------------------------------------------------
    1024 |          2.0 MB |            128 MB |      2.0 GB |             1x
    2048 |          8.0 MB |            512 MB |      8.0 GB |             4x
    4096 |         32.0 MB |           2048 MB |     32.0 GB |            16x
    8192 |        128.0 MB |           8192 MB |    128.0 GB |            64x
   16384 |        512.0 MB |          32768 MB |    512.0 GB |           256x

同一张矩阵的真实占用（torch 实测）: 32.0 MB 128.0 MB
```

序列长度每翻一倍，注意力矩阵的占用涨 4 倍——这就是 `O(s²)` 最直观的样子。这里还只算了一张矩阵；标准实现先写 `S` 再写 `P`，峰值和 IO 还要再乘一层。论文里的正式表述是：标准注意力需要 `Ω(Nd + N²)` 次 HBM 访问。

## 二、Tiling 为什么不能直接搬进注意力

GPU 上做矩阵乘的标准套路是分块（tiling）：把 `A` 的行块和 `B` 的列块同时搬进 SRAM，在片上算完一个 `C` 的子块再累加。以 `C` 为 32×32、block 为 16×16 为例，朴素实现里每个元素要访问 global memory 2×32 次，总共 2×32×32×32 = 65536 次；用 tiling 之后，每算完 `C` 的四分之一只访问 16×16×4 次，总共 4096 次，**访问次数降到原来的 1/16**，而计算量不变。

关键在于 SRAM 比 HBM 快一个量级，所以「少访问」直接换成「跑得更快」。

但注意力有个额外的麻烦：**softmax 是按行做的**。矩阵乘的每个输出元素只依赖输入的某一行某列，块与块之间互不相干；而 `softmax` 需要整行都看到了才能算分母。只算出 `C₀,₀` 是不够的，`softmax` 的结果还依赖 `C₀,₁`、`C₀,₂`……

于是 tiling 单独用在注意力上，只能减少矩阵乘那一段的访存，省不掉 `S` 和 `P` 两次落盘。要真正省掉，必须先解决 softmax 的行依赖。

## 三、Online Softmax：把「等整行」变成「边算边修正」

softmax 的数值风险大家都知道：`x = 100` 时 `e^x ≈ 2.7×10⁴³` 会溢出，`x = -100` 时 `e^x ≈ 3.7×10⁻⁴⁴` 会下溢。标准做法是减去最大值 `m`，让指数项都变成非正数——这就是 safe softmax：

```text
softmax(x_i) = exp(x_i - m) / Σ_j exp(x_j - m),   m = max_j x_j
```

问题在于 `m` 要等整行扫完才知道。于是有了 online softmax：维护两个量——在线最大值 `m_i` 和在线归一化分母 `d_i`，每来一个新块就更新一次：

```text
m_new = max(m_old, m_blk)
rescale = exp(m_old - m_new)          # 老分母的修正系数，恒 ≤ 1
d_new = d_old * rescale + Σ exp(x_blk - m_new)
```

`rescale` 这一行是全部机关：当新的最大值变大时，之前累积的分母是在旧基准下算的，乘上 `exp(m_old - m_new)` 就把它折算到了新基准上。

下面这段先手算 4 个数看清 rescale，再在 attention 真实规模上和完整 softmax 对拍：

```python
import torch

# ============================================================
# (a) 4 个数的小规模手算 trace：看清 online 的 rescale 机制
# ============================================================
x = torch.tensor([1.0, 3.0, 2.0, 5.0])
B = 2
print("x =", x.tolist(), " 块大小 B =", B)

m_i = torch.tensor(float("-inf"))   # 在线最大值
d_i = torch.tensor(0.0)             # 在线归一化分母
for j0 in range(0, len(x), B):
    x_j = x[j0:j0 + B]
    m_blk = x_j.max()
    m_new = torch.maximum(m_i, m_blk)
    rescale = (m_i - m_new).exp()                       # 老分母的修正系数，<= 1
    d_i = d_i * rescale + (x_j - m_new).exp().sum()
    print(f"  块 {x_j.tolist()}: m_blk={m_blk.item():.1f} -> m={m_new.item():.1f}, "
          f"rescale={rescale.item():.6f}, d={d_i.item():.6f}")
    m_i = m_new

print("  online softmax =", [round(v, 4) for v in ((x - m_i).exp() / d_i).tolist()],
      " 和 =", ((x - m_i).exp() / d_i).sum().item())

# ============================================================
# (b) 完整 attention 规模：online vs 完整 softmax 对拍
# ============================================================
torch.manual_seed(0)
n, s, Bc = 8, 2048, 128          # n 个 query 行，s=2048 个 key，块大小 128
X = torch.randn(n, s) * 2.0      # 模拟 QK^T / sqrt(d) 的分数矩阵

m_full = X.max(dim=1, keepdim=True).values
E = (X - m_full).exp()                       # (8, 2048) 未归一化的 P
P_ref = E / E.sum(dim=1, keepdim=True)       # (8, 2048)

m_i = torch.full((n, 1), float("-inf"))
d_i = torch.zeros(n, 1)
for j0 in range(0, s, Bc):
    X_j = X[:, j0:j0 + Bc]                   # (8, 128) 只有当前块驻留
    m_new = torch.maximum(m_i, X_j.max(dim=1, keepdim=True).values)
    rescale = (m_i - m_new).exp()
    d_i = d_i * rescale + (X_j - m_new).exp().sum(dim=1, keepdim=True)
    m_i = m_new
P_online = (X - m_i).exp() / d_i             # 第二遍：此时才拿到全局 m_i

print()
print("P_ref shape =", tuple(P_ref.shape), " P_online shape =", tuple(P_online.shape))
print("allclose =", torch.allclose(P_ref, P_online, atol=1e-6),
      " 最大绝对误差 =", f"{(P_ref - P_online).abs().max().item():.3e}")

# 内存对比（fp32，MiB）
online_bytes = n * Bc * 4 / 1024 ** 2
full_bytes = n * s * 4 / 1024 ** 2
print(f"online 单块驻留 {n}x{Bc} = {online_bytes * 1024:.0f} KB,  完整 P = {n}x{s} = {full_bytes:.2f} MB,  "
      f"省下 {full_bytes / online_bytes:.0f}x")

# 换成真正的 self-attention（s 行 query）：online 省掉的就是 s x s
print(f"真正的 self-attention: s={s} 时 s x s = {s * s * 4 / 1024**2:.1f} MB/头(fp32), "
      f"online 只需 Q_i K_j^T 的 {s}x{Bc} = {s * Bc * 4 / 1024:.0f} KB")
```

实测输出：

```text
x = [1.0, 3.0, 2.0, 5.0]  块大小 B = 2
  块 [1.0, 3.0]: m_blk=3.0 -> m=3.0, rescale=0.000000, d=1.135335
  块 [2.0, 5.0]: m_blk=5.0 -> m=5.0, rescale=0.135335, d=1.203438
  online softmax = [0.0152, 0.1125, 0.0414, 0.831]  和 = 1.0

P_ref shape = (8, 2048)  P_online shape = (8, 2048)
allclose = True  最大绝对误差 = 1.490e-08
online 单块驻留 8x128 = 4 KB,  完整 P = 8x2048 = 0.06 MB,  省下 16x
真正的 self-attention: s=2048 时 s x s = 16.0 MB/头(fp32), online 只需 Q_i K_j^T 的 2048x128 = 1024 KB
```

手算校验：`rescale = e^(3-5) = 0.135335`，把旧分母 `1.135335` 折算到新基准得 `0.153649`，再累加新块的 `e^(2-5) + e^(5-5) = 0.049787 + 1`，最终 `d = 1.203438`。四项 softmax 和恰好是 1.0，与完整 softmax 的最大绝对误差 `1.49×10⁻⁸` 是 fp32 重结合的正常噪声。

更重要的是：**online 版本全程不需要实例化完整的 `s × s` 矩阵**。驻留量从 `n × s` 降到 `n × B_c`，块越小省得越多。

## 四、一次遍历：连重算也省掉

online softmax 解决的是「等整行」的问题，但它自己还是两遍——第一遍统计 `m` 和 `d`，第二遍才算 softmax 结果。真正的技巧在于：注意力的目的不是得到 softmax 本身，而是得到 `O = P V`。

既然最终要的是 `O`，就可以在累加分母的同时直接累加 `o`：

```text
o_new = (d_old / d_new) * exp(m_old - m_new) * o_old + Σ exp(x_j - m_new) * V_j
```

这里 `d_new` 既是新的分母，也是旧累加器的缩放因子。整趟循环下来，`m` 和 `d` 都是标量级别的开销，`o` 始终留在寄存器里。配合 tiling——外层遍历 `K_j, V_j` 块、内层遍历 `Q_i, O_i` 块——`Q_i` 常驻 SRAM，`K_j`、`V_j` 流式加载进来，算完只把最终结果写回 HBM。

这就是 FlashAttention V1 的原型。把 tiling 拼进来，做成完整实现并与朴素版本对拍：

```python
import torch

torch.manual_seed(0)
s, d, B = 64, 16, 16          # seq_len=64, head_dim=16, tile 边长 16
scale = 1.0 / d ** 0.5
Q = torch.randn(s, d); K = torch.randn(s, d); V = torch.randn(s, d)

# ---------- 朴素：一次性构造 s x s ----------
def naive(Q, K, V):
    S = Q @ K.T * scale              # (s, s)  <- 全部写进 HBM
    P = torch.softmax(S, dim=-1)     # (s, s)  <- 再读一次、写一次
    return P @ V                     # (s, d)

# ---------- 分块 tiling：Q_i 常驻，K_j/V_j 流式加载 ----------
def tiled(Q, K, V, B):
    s, d = Q.shape[0], V.shape[1]
    O = torch.zeros(s, d)            # 最终唯一写回 HBM 的结果
    for i in range(0, s, B):
        Bi = min(B, s - i)
        Qi = Q[i:i + Bi]                      # (Bi, d) 常驻 SRAM
        m = torch.full((Bi, 1), float("-inf"))
        l = torch.zeros(Bi, 1)
        acc = torch.zeros(Bi, d)               # register
        for j in range(0, s, B):
            Bj = min(B, s - j)
            Sj = (Qi @ K[j:j + Bj].T) * scale  # (Bi, Bj) 本轮临时块
            m_new = torch.maximum(m, Sj.max(dim=-1, keepdim=True).values)
            rescale = (m - m_new).exp()                       # 老累加器的修正系数，<= 1
            p = (Sj - m_new).exp()
            l = l * rescale + p.sum(dim=-1, keepdim=True)
            acc = acc * rescale + p @ V[j:j + Bj]
            m = m_new
        O[i:i + Bi] = acc / l                  # V2：除法延后到内层循环结束
    return O

O_naive = naive(Q, K, V)
O_tiled = tiled(Q, K, V, B)

print("Q/K/V shape =", tuple(Q.shape))
print("S  shape =", (s, s), "  S 的一个 tile  shape =", (B, B))
print("O_naive shape =", tuple(O_naive.shape), " O_tiled shape =", tuple(O_tiled.shape))
print("allclose =", torch.allclose(O_naive, O_tiled, atol=1e-5),
      " 最大绝对误差 =", f"{(O_naive - O_tiled).abs().max().item():.3e}")
print("O[0, :5] naive =", [round(v, 4) for v in O_naive[0, :5].tolist()])
print("O[0, :5] tiled =", [round(v, 4) for v in O_tiled[0, :5].tolist()])
print("softmax 行和校验 =", f"{torch.softmax(Q @ K.T * scale, dim=-1).sum(dim=-1)[0].item():.6f}")

# 内存账：朴素 vs tiling（fp32, MiB）
naive_mb = s * s * 4 / 1024 ** 2
tile_kb = (B * d * 2 + B * B * 2) * 4 / 1024     # K_j,V_j,Q_i 的 SRAM 工作集 + S tile
print(f"朴素 S 矩阵 {s}x{s} = {naive_mb:.2f} MB ; tiling 单轮 SRAM 工作集 ≈ {tile_kb:.1f} KB "
      f"(压缩 {naive_mb * 1024 / tile_kb:.0f}x)")
```

实测输出：

```text
Q/K/V shape = (64, 16)
S  shape = (64, 64)   S 的一个 tile  shape = (16, 16)
O_naive shape = (64, 16)  O_tiled shape = (64, 16)
allclose = True  最大绝对误差 = 2.384e-07
O[0, :5] naive = [0.0893, 0.205, -0.1554, 0.1174, 0.2289]
O[0, :5] tiled = [0.0893, 0.205, -0.1554, 0.1174, 0.2289]
softmax 行和校验 = 1.000000
朴素 S 矩阵 64x64 = 0.02 MB ; tiling 单轮 SRAM 工作集 ≈ 4.0 KB (压缩 4x)
```

注意 `acc = acc * rescale + p @ V[j:j + Bj]` 这一行：累加器 `acc` 和分母 `l` 用的是同一个修正系数 `rescale`。而 `O[i:i + Bi] = acc / l` 把除法推迟到了内层循环结束之后——这正是 FlashAttention V2 的关键优化之一（下面第五节还会提到）。

至此三个机关都齐了：分块决定中间矩阵不落盘，online softmax 消除了「必须先看完整行」的依赖，一次遍历把累加和归一化合并进同一条循环。

## 五、三代内核：改的全是访存调度

论文给出了一个明确的 IO 复杂度结论：标准注意力需要 `Ω(Nd + N²)` 次 HBM 访问，FlashAttention 只需要 `O(N²d²M⁻¹)`（`M` 是 SRAM 大小），在典型 `d` 和 `M` 下少一个量级——论文报告在 GPT-2 上注意力计算本身有 7.6 倍加速，HBM 访问最多减少 9 倍。论文同时给出了一个下界：**在所有 SRAM 尺寸下，不存在精确注意力算法能在渐进意义上超越它的 HBM 访问次数**。也就是说，精确注意力这条路上，FlashAttention 已经贴着天花板了。

之后的迭代依然没有增加任何数学运算，改的全是「怎么安排访存」。

**FA-1（2022）** 确立了 tiling + online softmax + 反向重算的框架。重算是为了省显存：中间矩阵不存下来，反向传播时按同样顺序重新算一遍。

**FA-2（2023）** 做了三处改动：

1. **调整内外循环**。V1 是外层遍历 `K, V`、内层遍历 `Q, O`，导致 `O` 被反复加载。交换成外层 `Q, O`、内层 `K, V` 后，`Q` 一次加载就能用到底。
2. **减少非矩阵乘法的运算次数**。V1 每轮迭代都要除一次 `d'_i`，V2 改成循环结束后统一除一次 `d'_N`。这条能省下不少，因为 GPU 上矩阵乘法有专门的张量核心硬件，非矩阵乘法的吞吐只有它的几分之一。
3. **提高 warp 级并行度**。V1 按 `K, V` 的列切分给 4 个 warp，每个 warp 算出的 `B_r × B_c/4` 需要跨 warp 拼接才能得到真正的 `Q_i K_j^T`，存在 warp 间通信。V2 改成按 `Q` 的行切分，每个 warp 直接得到完整的 `B_r/4 × B_c`，全程不需要 warp 间通信。

论文实测：FA-2 相对 FA-1 约 2 倍加速，在 A100 上达到理论最大 FLOPs/s 的 73%（前向）和 63%（反向）；端到端训练 GPT 风格模型可达每卡 225 TFLOPs/s（72% 的模型 FLOPs 利用率）。相对 HuggingFace 的 Triton 实现快 1.3–2.5 倍，相对标准注意力实现快 3–10 倍。

**FA-3（2024）** 针对 Hopper 架构重写。论文指出 FA-2 在 H100 上只能跑到 35% 的利用率——它没有利用新硬件的能力。FA-3 的三个技术是：利用 Tensor Core 和 TMA 的异步性做 warp-specialization（计算与数据搬运重叠）、把块级矩阵乘和 softmax 交错执行、以及利用 FP8 硬件支持做块量化和非相干处理。

实测结果：H100 上加速 1.5–2.0 倍，FP16 达到最高 740 TFLOPs/s（75% 利用率），FP8 接近 1.2 PFLOPs/s；FP8 版本的数值误差比基线 FP8 注意力低 2.6 倍。

一句话概括三代演进：FA-1 确立了「不落盘」，FA-2 把它排得更顺，FA-3 让它用上新一代硬件的异步能力。

## 六、它不解决什么

FlashAttention 有明确的边界，混淆这些边界会让人高估它的作用。

**它不减计算量**。注意力的 FLOPs 仍然是 `O(N²d)`，一次不少。想压 `N²` 属于另一条路线——稀疏注意力砍的是「哪些 KV 参与计算」，FlashAttention 挪的是「计算时数据在哪」，两者正交。

**它不改数学**。输出是精确的（不是近似注意力），误差只来自浮点重结合。

**它不是万能加速**。收益来自「计算受限转成访存受限」的硬件条件。序列很短、或者模型很小的时候，中间矩阵本来就装得进 SRAM，FlashAttention 的优势有限。

**它有下限**。论文证明的那个下界意味着——想再快，只能离开精确注意力这条路（近似、稀疏、或者换架构）。

**它的实现有门槛**。官方库 `flash_attn` 可以直接 pip 安装，但如果要加 mask 之类的逻辑改动，学习和调试成本不低；Trio 语言的实现性能也不错。

## 七、FAQ

**Q：FlashAttention 和 FlashAttention-2 和 FlashAttention-3 该怎么选？**
A：按硬件选。FA-2 面向 Ampere 及之后的架构（官方仓库同时提供 FA-1 和 FA-2 两条路径）；FA-3 需要 Hopper 架构（H100/H800）以及 CUDA 12.3 以上，且仓库里单独放了 `flash_attn_3` 包，不会自动启用。

**Q：用了 FlashAttention 还需要考虑稀疏注意力吗？**
A：需要考虑，因为两者解决的不是同一个问题。FlashAttention 让你更快地把注意力算完；稀疏注意力让你少算一部分连接。长上下文场景里两者常常叠加。

**Q：为什么不用 PyTorch 的 `scaled_dot_product_attention`？**
A：它在新版本 PyTorch 里已经默认走 FlashAttention 后端了。理解 FlashAttention 的价值主要在两个场景：需要改内核逻辑时，知道该动哪一层；以及做架构决策时，知道瓶颈到底在访存还是在算力。

**Q：这套方法能迁移到别的算子吗？**
A：思路可以迁移，核心是「分块 + 在线维护聚合量 + 延迟归一化」。任何聚合量能写成可增量修正的形式（求和、求最大值、矩阵乘累加），都能套用这个套路。但 softmax 的特殊之处在于它的分母依赖于全局最大值——这正是它需要 `rescale` 的原因。

## 参考资料

- FlashAttention（FA-1）：[arXiv:2205.14135](https://arxiv.org/abs/2205.14135) —— IO 复杂度分析、HBM 访问下界证明
- FlashAttention-2（FA-2）：[arXiv:2307.08691](https://arxiv.org/abs/2307.08691) —— 内外循环调整、非矩阵乘法优化、warp 并行度、2 倍加速与 73%/63% 利用率
- FlashAttention-3（FA-3）：[arXiv:2407.08608](https://arxiv.org/abs/2407.08608) —— Hopper 上的 warp-specialization、异步执行、FP8、1.5–2.0 倍加速与 740 TFLOPs/s
- 官方实现（FA-1/FA-2）：[Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)
- 讲义来源：南京大学《大语言模型基础》第 7 讲，[幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture7.html)
