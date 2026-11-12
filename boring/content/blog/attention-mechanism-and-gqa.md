---
title: "Attention 机制：为什么 K/V 比 Q 窄"
date: 2026-11-12
update_date: 2026-11-12
description: "从 hidden states 到注意力输出，把 MHA 与 GQA 的张量路径逐行走一遍：加性 causal mask 为什么会改变 softmax 的分母、整行 -inf 如何变成 NaN、GQA 到底省了哪笔账，以及分块归一化为什么不能逐块做 softmax。"
tldr: "GQA 省的是 KV cache 和 K/V 投影，不是注意力计算量；因果掩码不是把上三角清零，而是改写 softmax 的分母——这两点搞错，实现就会静默地算错。"
keywords: ["Attention 机制", "GQA 分组查询注意力", "causal mask 因果掩码", "repeat_kv", "KV cache 显存", "online softmax 分块归一化"]
taxonomies:
  tags: ["LLM原理", "Attention", "推理优化", "PyTorch"]
---

Attention 是 Transformer 里最容易被当成黑箱的部分：公式只有一行，但从 hidden states 到输出之间夹着投影、掩码、归一化、聚合四步，每一步都可能悄悄改变结果。这篇把每一步的张量形状和实际数值都摆出来，重点在两个最常被误解的地方——**因果掩码到底做了什么**，以及 **GQA 到底省了什么**。

本文整理自南京大学《大语言模型基础：从零到一实现之路》第 6 讲「Attention 机制 I」（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2026/lecture6.html)。文中所有数值均在本地实跑验证，环境为 PyTorch 2.8.0 + CUDA 无需的纯 CPU 张量。

## 一、四步流水线与形状

Attention 模块接收归一化后的 hidden states，形状 `[B, S, H]`（batch、序列长度、隐层宽度），内部有四个投影：`q_proj`、`k_proj`、`v_proj`、`o_proj`。核心运算是：

```text
Attention(Q, K, V) = softmax( mask( Q K^T / sqrt(d_k) ) ) V
```

四步分别是：

1. **投影**：从 `[B, S, H]` 得到 Q、K、V；
2. **打分**：`Q K^T / sqrt(d_k)` 得到 `[B, S, S]` 的分数矩阵（行是 Query，列是 Key）；
3. **掩码 + 归一化**：沿 Key 维做 softmax；
4. **聚合**：权重乘 V 得到 `[B, S, H]` 的输出。

多头情况下，形状链是 `[B,S,H] → [B,S,h,d_h] → [B,h,S,S] → [B,S,H]`，其中 `H = h · d_h`。`view` 只是内存视角切换，`transpose` 才真正搬数据。

先用手写矩阵代替 `nn.Linear`（等价于把三个投影矩阵都设为单位阵），让 Q、K、V 就是输入本身，这样能第一次看清注意力矩阵长什么样：

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)
B, S, d_k = 1, 4, 4
x = torch.tensor([[1., 0., 0., 0.],
                  [0., 1., 0., 0.],
                  [0., 0., 1., 0.],
                  [1., 1., 0., 0.]])

# 投影：这里取单位阵，等价于 W_Q = W_K = W_V = I
q = F.linear(x, torch.eye(d_k))
k = F.linear(x, torch.eye(d_k))
v = F.linear(x, torch.eye(d_k))

scale = d_k ** -0.5                       # 1/sqrt(4) = 0.5
scores = q @ k.transpose(-2, -1) * scale   # [S, S]
attn   = torch.softmax(scores, dim=-1)     # [S, S]
out    = attn @ v                          # [S, d_k]

print("scores =")
print(scores)
print("attn =")
print(attn)
print("逐行权重和 =", attn.sum(-1))

# 对照 PyTorch SDPA
ref = F.scaled_dot_product_attention(q.unsqueeze(0), k.unsqueeze(0), v.unsqueeze(0)).squeeze(0)
torch.testing.assert_close(out, ref)
print("与 F.scaled_dot_product_attention 一致: True")
```

```text
scores =
tensor([[0.5000, 0.0000, 0.0000, 0.5000],
        [0.0000, 0.5000, 0.0000, 0.5000],
        [0.0000, 0.0000, 0.5000, 0.0000],
        [0.5000, 0.5000, 0.0000, 1.0000]])
attn =
tensor([[0.3112, 0.1888, 0.1888, 0.3112],
        [0.1888, 0.3112, 0.1888, 0.3112],
        [0.2151, 0.2151, 0.3547, 0.2151],
        [0.2350, 0.2350, 0.1425, 0.3875]])
逐行权重和 = tensor([1., 1., 1., 1.])
与 F.scaled_dot_product_attention 一致: True
```

三个值得停一下的点：**注意力矩阵的行是 Query、列是 Key**，第 0 行是 token0 作为 Query 去看的四个 Key 的权重；未归一化的 `scores` 可以大于 1（最后一行有 `1.0000`，因为 token3 与自身的点积是 2，再乘 `1/sqrt(4)=0.5`）；输出 `out` 的每一行都是 V 各行的**凸组合**，所以必然落在 V 张成的凸包内。

## 二、因果掩码改的是分母，不是上三角

自回归模型要求位置 `i` 只能访问位置 `j ≤ i`。实现上用的是**加性掩码**：允许的位置加 0，屏蔽的位置加 `-inf`。因为 `e^(-inf) = 0`，softmax 之后被屏蔽位置的权重恰好是 0。

但这里有个容易忽略的细节，也是整篇最值得记住的一点：**掩码不只影响被屏蔽的那几项，它同时改变了 softmax 的分母**。屏蔽掉未来的 Key 之后，剩下允许位置的相对权重会被**重新归一化**，而不是简单地"把上三角清零"。

把两种做法并排跑一遍，差别立刻显形：

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)
d_k = 4
x = torch.tensor([[1., 0., 0., 0.],
                  [0., 1., 0., 0.],
                  [0., 0., 1., 0.],
                  [1., 1., 0., 0.]])
q = k = v = F.linear(x, torch.eye(d_k))
scale = d_k ** -0.5
scores = q @ k.transpose(-2, -1) * scale

# 加性 causal mask：下三角（含对角线）为 0，上三角为 -inf
mask = torch.full((4, 4), float("-inf")).triu(1)

# 正确做法：先加 mask，再 softmax
attn_correct = torch.softmax(scores + mask, dim=-1)
# 错误做法：先把未来位置清零，再 softmax（分母里仍算着这些位置）
attn_wrong = torch.softmax(scores.masked_fill(mask == float("-inf"), 0.0), dim=-1)

print("正确（加 mask 后 softmax）第 1 行 =", [round(t, 4) for t in attn_correct[1].tolist()])
print("错误（先清零再 softmax）第 1 行 =", [round(t, 4) for t in attn_wrong[1].tolist()])
print("两种做法的第 1 行差异 =", [round(t, 4) for t in (attn_correct[1] - attn_wrong[1]).tolist()])

# 因果性：只改最后一个 token，前三个位置的输出必须逐位不变
x2 = x.clone()
x2[3] = torch.tensor([2., 0., 1., 0.])
q2 = k2 = v2 = F.linear(x2, torch.eye(d_k))
attn2 = torch.softmax(q2 @ k2.transpose(-2, -1) * scale + mask, dim=-1)
out1, out2 = attn_correct @ v, attn2 @ v2
print("改变末位后，前三行权重是否不变 =", torch.equal(attn_correct[:3], attn2[:3]))
print("改变末位后，前三行输出是否不变 =", torch.equal(out1[:3], out2[:3]))
```

```text
正确（加 mask 后 softmax）第 1 行 = [0.3775, 0.6225, 0.0, 0.0]
错误（先清零再 softmax）第 1 行 = [0.2151, 0.3547, 0.2151, 0.2151]
两种做法的第 1 行差异 = [0.1624, 0.2678, -0.2151, -0.2151]
改变末位后，前三行权重是否不变 = True
改变末位后，前三行输出是否不变 = True
```

正确做法的第 1 行是 `[0.3775, 0.6225, 0, 0]`，错误做法得到 `[0.2151, 0.3547, 0.2151, 0.2151]`——后者不但给未来位置分到了权重，连当前位置的权重都被稀释了。差异最大到 0.27，这不是舍入误差。

末尾的因果性验证返回 `True`：只改最后一个 token，前三行的权重和输出**逐位相同**（`torch.equal` 是严格相等，不是近似）。这正是自回归生成能增量解码的依据——历史 K/V 不会因为新 token 改变而改变。

### 整行 -inf 会产生 NaN

把 causal mask 和 padding mask 合并时（任一规则禁止访问就把分数设为 `-inf`），可能出现某一行的所有 Key 都被屏蔽的情况。此时普通 softmax 的分母是 `sum(exp(-inf - (-inf)))`，结果不是 0，而是 **NaN**：

```python
import torch

row = torch.tensor([[0., 0., 0., 0.]])
all_neg_inf = torch.full((1, 4), float("-inf"))
print("整行 -inf 的 softmax =", torch.softmax(all_neg_inf, dim=-1))

# 常见的「安全」替换：用 finfo.min 代替 -inf
finfo_min = torch.full((1, 4), torch.finfo(torch.float32).min)
print("用 finfo.min 代替 -inf =", torch.softmax(finfo_min, dim=-1))
```

```text
整行 -inf 的 softmax = tensor([[nan, nan, nan, nan]])
用 finfo.min 代替 -inf = tensor([[0.2500, 0.2500, 0.2500, 0.2500]])
```

注意第二行：用 `finfo.min` 确实避免了 NaN，但结果是**均匀分布**——它把「一个 Key 都不许访问」当成了「四个 Key 权重相同」，这在语义上同样是错的。正确做法是保证每个有效 Query 行至少留一个可访问的 Key（实践中就是不要让 padding 把整行吃掉），而不是靠替换数值来糊过去。NaN 反而是个好信号：它明确告诉你这一行没有有效输入。

## 三、GQA：省的是 KV，不是计算

Llama 系模型的 `k_proj` 和 `v_proj` 输出宽度只有 `q_proj` 的四分之一，这不是配置错误，而是 **Grouped Query Attention（GQA）**。以 LLaMA-3.1-8B 为例：

- `num_attention_heads = 32`，`num_key_value_heads = 8`，`head_dim = 128`
- `q_proj` 输出 `32 × 128 = 4096`，`k_proj` / `v_proj` 输出 `8 × 128 = 1024`
- 每 4 个 Query 头共享一组 K 头和 V 头

教学实现通常把 KV 头显式复制到 Query 头数（`repeat_kv`），让形状对齐。PyTorch 2.5 之后 `scaled_dot_product_attention` 提供了 `enable_gqa=True`，可以不做这个复制：

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)
B, S, num_heads, num_kv_heads, head_dim = 1, 16, 8, 2, 4
H = num_heads * head_dim

q = torch.randn(B, num_heads, S, head_dim)
k = torch.randn(B, num_kv_heads, S, head_dim)
v = torch.randn(B, num_kv_heads, S, head_dim)
n_rep = num_heads // num_kv_heads

# 路径 A：手工 repeat_kv，把每组 KV 复制 n_rep 次
k_rep = k[:, :, None, :, :].expand(B, num_kv_heads, n_rep, S, head_dim).reshape(B, num_heads, S, head_dim)
v_rep = v[:, :, None, :, :].expand(B, num_kv_heads, n_rep, S, head_dim).reshape(B, num_heads, S, head_dim)
out_rep = F.scaled_dot_product_attention(q, k_rep, v_rep, is_causal=True)

# 路径 B：不复制 KV，让内核自己处理分组
out_gqa = F.scaled_dot_product_attention(q, k, v, is_causal=True, enable_gqa=True)

print("两条路径输出形状相同 =", out_rep.shape == out_gqa.shape, out_rep.shape)
print("最大误差 =", (out_rep - out_gqa).abs().max().item())

# GQA 省了哪笔账？
score_shape = (q @ k_rep.transpose(-2, -1)).shape
print("score 矩阵形状 =", score_shape, "（与 MHA 完全相同）")
mha_kv = 2 * B * S * num_heads * head_dim
gqa_kv = 2 * B * S * num_kv_heads * head_dim
print("MHA KV cache 元素数 =", mha_kv, " GQA =", gqa_kv, " 比值 =", gqa_kv / mha_kv)
print("显式 repeat_kv 物化后的 K/V 字节 =",
      (k_rep.numel() + v_rep.numel()) * k.element_size(),
      " 不物化 =", (k.numel() + v.numel()) * k.element_size())
```

```text
两条路径输出形状相同 = True torch.Size([1, 8, 16, 4])
最大误差 = 4.76837158203125e-07
score 矩阵形状 = torch.Size([1, 8, 16, 16]) （与 MHA 完全相同）
MHA KV cache 元素数 = 1024  GQA = 256  比值 = 0.25
显式 repeat_kv 物化后的 K/V 字节 = 4096  不物化 = 1024
```

那个 `4.77e-07` 不是 bug，是浮点舍入：两条路径的归一化顺序不同，结果在 float32 下不可能逐位相等。换成 float64 再跑，误差掉到 `4.44e-16`。这个数字还随 PyTorch 版本变——同一段代码在 2.8.0 上是 `4.77e-07`，在 2.14.0 上是 `0.0`（逐位相等），因为 GQA 内核的融合实现换过。**要断言两条路径等价，该看的是相对误差和形状，不是某个具体浮点数。**

这张表把 GQA 的收益边界钉死了：

- **KV cache 变小**：元素数从 1024 降到 256，比值正好是 `g/h = 0.25`；
- **K/V 投影变窄**：`k_proj`、`v_proj` 的输出宽度跟着变小，投影本身的参数和计算也省；
- **score 计算量不变**：分数矩阵的形状是 `[B, h, S, S]`，与 MHA 一模一样。GQA 省的是**搬运和缓存**，不是算力；
- **输出 hidden size 不变**：仍是 `[B, S, H]`，模型下游感知不到 GQA 的存在。

还有一个实践细节：`expand` 出来的张量不是连续的（stride 里带着 0），`reshape` 会因此触发一次**真实拷贝**。所以在训练或推理里手工写 `repeat_kv`，等于把省下来的 KV 内存又还回去一部分——上面实测物化后是 4096 字节，不物化只要 1024 字节。新版 PyTorch 直接用 `enable_gqa=True` 就没有这个开销。

## 四、复杂度与分块的归一化约束

记 `H = h · d_h`，只看 `Q K^T` 和 `A V` 两次矩阵乘：各为 `O(B·h·S²·d_h) = O(B·S²·H)`。**固定 H 时，多头不会让这部分计算量直接增加 h 倍**——多头是把同样的计算切得更细。

真正的瓶颈是平方项：显式保存注意力权重需要 `O(B·h·S²)` 个元素，序列长度翻倍，计算量和权重存储都约变成 **4 倍**。于是有了分块计算的动机：取一块 Query，只跟各块 Key 算分���。

但分块有一个硬约束：**softmax 的分母必须包含该 Query 能访问的所有 Key**。用讲义里的反例看，一行 `[0,0,0,0]` 整行归一化得 `[1/4,1/4,1/4,1/4]`；切成两块各自归一化再拼起来是 `[1/2,1/2,1/2,1/2]`，总和是 2 而不是 1：

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)
S = 4
q = torch.randn(1, 1, S, 8)
k = torch.randn(1, 1, S, 8)
v = torch.randn(1, 1, S, 8)
mask = torch.full((S, S), float("-inf")).triu(1)

scores = q @ k.transpose(-2, -1) / 8 ** 0.5
full = torch.softmax(scores + mask, dim=-1)

# 错误做法：每行切两块，各自 softmax
s_block = scores + mask
wrong = torch.cat([torch.softmax(s_block[..., :2], dim=-1),
                   torch.softmax(s_block[..., 2:], dim=-1)], dim=-1)

print("整行正确 softmax 第 0 行 =", [round(t, 4) for t in full[0, 0, 0].tolist()])
print("分块各自 softmax 第 0 行 =", [round(t, 4) for t in wrong[0, 0, 0].tolist()])

# 正确做法：拼接完整行后再归一化（讲义教学实现）
right = torch.softmax(torch.cat([s_block[..., :2], s_block[..., 2:]], dim=-1), dim=-1)
print("拼接完整行再 softmax 与整行一致 =", torch.allclose(full, right))
```

```text
整行正确 softmax 第 0 行 = [1.0, 0.0, 0.0, 0.0]
分块各自 softmax 第 0 行 = [1.0, 0.0, nan, nan]
拼接完整行再 softmax 与整行一致 = True
```

这里暴露了比"权重不对"更严重的问题：加了 causal mask 之后，第 0 行能访问的 Key 只有 1 个，第二块整块都是 `-inf`，**逐块 softmax 直接产出 NaN**。所以分块不是"归一化方式选错了"，而是**在归一化之前必须先把整行的极值和分母维护起来**——这正是 online softmax 要解决的问题：维护一个运行中的最大值和分母，新块到来时把旧累积量按 `e^(m_old - m_new)` 缩放后再累加。

想明白这一层，再读 [FlashAttention：把注意力从显存搬回片上](/blog/flashattention-io-aware-tiling/) 就会顺畅很多——那篇拆的三个机关（分块、在线 softmax、一次遍历），解决的正是这里提出的"不保存整行 score、边读边更新归一化因子与加权和"的问题。

## 五、它不解决什么

- **GQA 不减少 score 计算量**。分数矩阵仍然是 `[B, h, S, S]`，长上下文下的平方瓶颈还在。想少算连接是稀疏注意力的活，参见 [Sparse Attention 方法谱系：三条路线](/blog/sparse-attention-methods-landscape/)。
- **分块的等价性不等于训练显存收益**。手写分块实现验证的是数值等价；训练时 autograd 仍可能保留各块中间量，FlashAttention 训练显存的节省靠的是反向重计算，不是分块本身。
- **掩码写错不会立刻报错**。上面那个"先清零再 softmax"的例子输出的是一个形状完全正常、数值看起来也不夸张的矩阵。注意力实现里最危险的 bug 往往不抛异常，只是安静地算错——所以每一步都值得跟一个参考实现对拍（本文的每段代码都与 `F.scaled_dot_product_attention` 做了逐位比对）。

## FAQ（六、常见问题）

**Q：Llama 的 `head_dim` 一定是 64 吗？**
A：不是。`head_dim` 是配置项，与 `hidden_size` 和 `num_attention_heads` 不一定满足 `H = h · d_h`。LLaMA-3.1-8B 是 `hidden_size=4096`、`num_attention_heads=32`、`head_dim=128`；而 Llama-3.2-1B 是 `hidden_size=2048`、32 头、`head_dim=64`，此时 `q_proj` 输出 2048、`k_proj` 输出 512。判断一个模型是不是 GQA，看 `k_proj` 的输出宽度是不是 `q_proj` 的 `g/h` 倍即可，参见 [RoPE 旋转位置编码：Attention 如何感知顺序](/blog/rope-and-input-embedding-explained/) 里的 config 对照表。

**Q：为什么不用 `is_causal=True` 就完事？**
A：因果场景下完全可以，它内部做的是同样的加性掩码。实测它与「把同一个掩码显式传给 `attn_mask`」的结果逐位相同（误差 `0.0`）；与「手写 softmax 再乘 V」相比则有 `2.4e-07` 的浮点差异——两条路径的归一化顺序不同，float32 下本就不该逐位相等。需要手写掩码的场景是 padding——批量推理时不同样本长度不同，需要额外屏蔽补齐位置，而 `is_causal` 只管因果不管 padding。

**Q：`repeat_kv` 复制出来的 KV 参与梯度计算吗？**
A：参与。`expand` + `reshape` 是普通算子，梯度会正常回传。这也意味着它会占显存、占带宽，不是零成本的"视图"。生产代码里能用 `enable_gqa=True` 就别手工复制。

## 相关阅读

- [FlashAttention：把注意力从显存搬回片上](/blog/flashattention-io-aware-tiling/) — 分块 + online softmax + 一次遍历，注意力访存的三个机关
- [RMSNorm 与 SwiGLU：Llama 的两块拼图](/blog/rmsnorm-and-swiglu-ffn-explained/) — Attention 之外的 Llama 组件
- [RoPE 旋转位置编码：Attention 如何感知顺序](/blog/rope-and-input-embedding-explained/) — Q、K 上的位置编码与 GQA 的关系
- [Sparse Attention 方法谱系：三条路线](/blog/sparse-attention-methods-landscape/) — 想真正减少平方项时该看什么
- 讲义来源：南京大学《大语言模型基础》第 6 讲，[幻灯片](https://njudeepengine.github.io/llm-course-lecture/2026/lecture6.html)
