---
title: "RoPE 旋转位置编码：Attention 如何感知顺序"
date: 2026-11-06T15:30:00+08:00
update_date: 2026-11-06T15:30:00+08:00
description: "从查表得到 embedding 到 RoPE 注入位置信息，把 LLM 输入侧的两步拆开：tokenizer 决定 token 数，embedding 是纯索引，RoPE 用旋转替代叠加，让注意力分数只依赖相对位置。"
tldr: "位置编码不是给词加一个编号，而是让 Q、K 的点积只跟两者的距离有关。RoPE 的做法是转方向、不转长度——这正是它比绝对位置编码更好用的原因。"
keywords: ["RoPE 旋转位置编码", "位置编码", "input embedding", "tokenizer 分词", "相对位置", "Llama 注意力"]
taxonomies:
  tags: ["LLM原理", "Attention", "位置编码", "工程实践"]
---

RoPE 旋转位置编码（Rotary Position Embedding）是现在几乎所有主流开源模型处理位置信息的方式。它的核心是一次视角切换：**位置信息不再用「加」的方式叠到向量上，而是用「转」的方式改变向量方向。**

具体要解决的问题是这样的。LLM 的输入侧只有两步：tokenizer 把文本变成 token ID，embedding 查表把 ID 变成稠密向量。但只做这两步是不够的——Attention 算的是 Q 和 K 的点积，而点积天然对顺序不敏感：把一句话的词打乱，Attention 算出来的分数结构几乎不变，因为点积只看方向和长度，看不出「谁在谁前面」。

本文整理自南京大学《大语言模型基础：从零到一实现之路》第 4 讲（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2026/lecture4.html)。下面的演示代码与输出为整理时补充，已在 CPU 版 PyTorch 2.8.0 下逐行跑过；模型配置数据抓取于 2026-11-06。

## 一、第一步：tokenizer 决定 token 数，语言差异全部收敛在这里

自然语言是离散的，LLM 的词表也是离散的。把文本切成 token 的方式有三种量级：按词切（`hello` / `,` / `world`）、按字符切（`h|e|l|l|o`）、按子词切（常用词整体保留，生词拆成有意义的子词）。现在用的是第三种。

用 Qwen3 的真实 tokenizer 看一下中英文的差异（token ID 与 `[Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B)` 一致）：

```python
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-0.6B")

for text in ["Nanjing University", "南京大学", "LLM中的embedding"]:
    ids = tok.encode(text, add_special_tokens=False)
    print(repr(text), "->", ids, f"({len(ids)} tokens)")
```

实际输出：

```text
'Nanjing University' -> [45, 52091, 287, 3822]  (4 tokens)
'南京大学' -> [102034, 99562]  (2 tokens)
'LLM中的embedding' -> [4086, 44, 101047, 94611]  (4 tokens)
```

英文靠空格分界，4 个 token；中文没有空格边界，4 个汉字被合成 2 个 token；中英混排时字母、汉字、数字、标点各按自己的规则切。

**这一步的工程后果比看起来大：token 数直接决定上下文长度占用、显存和推理账单。** 语言差异全部发生在 tokenizer 阶段，后面的 embedding 只处理统一的 token ID，不再关心原文长什么样。

批量输入时还有个细节：短句要补齐。补齐位置用 attention mask 标出来，`1` 是有效位置，`0` 是补齐位置：

```text
                  input_ids          attention_mask
你好              [108386, 151643]    [1, 0]
南京大学          [102034,  99562]    [1, 1]
```

两个张量形状都是 `[b, s]`。注意这个 0/1 mask **不能直接加到 attention 分数上**——它要先转成 additive mask（比如把补齐位置填成 `-∞`）才能真正屏蔽掉那些位置。

## 二、第二步：embedding 是纯查表，不是矩阵乘法

`nn.Embedding` 这一层做的事看起来简单，但有一个值得说清楚的事实：**它在数学上等价于 one-hot 乘矩阵，工程上却是纯索引操作。**

用一个 6 词的手写迷你词表看清楚：

```python
import torch
import torch.nn.functional as F

vocab = {"<pad>": 0, "<unk>": 1, "Hello": 2,
         "Nanjing": 3, "University": 4, "LLM": 5}
vocab_size, d_model = len(vocab), 4

tokens = [["Hello", "University", "LLM"],     # 一条真实序列
          ["<unk>", "<pad>", "<pad>"]]        # 一条补齐序列
input_ids = torch.tensor([[vocab[t] for t in row] for row in tokens])

emb = torch.nn.Embedding(vocab_size, d_model)
with torch.no_grad():
    emb.weight.copy_(torch.tensor([
        [0.00,  0.00,  0.00,  0.00],   # 0 <pad>
        [0.10,  0.20,  0.30,  0.40],   # 1 <unk>
        [1.00,  0.50, -0.50,  0.25],   # 2 Hello
        [0.30, -0.20,  0.80, -0.60],   # 3 Nanjing（本批次没用到）
        [-0.40, 0.70,  0.10, -0.90],   # 4 University
        [0.60, -0.30,  0.20,  0.50],   # 5 LLM
    ]))

out = emb(input_ids)
print("emb(input_ids) shape =", tuple(out.shape))
print("Hello   的向量 =", out[0, 0].tolist())

# 查表 == one-hot 乘矩阵
one_hot = F.one_hot(input_ids, vocab_size).float()      # [2,3,6]
print("查表 == one-hot @ W :", torch.allclose(out, one_hot @ emb.weight))

# 梯度只落在被用到的行上
out.sum().backward()
print("每行梯度绝对值之和 =", emb.weight.grad.abs().sum(1).tolist())
```

输出：

```text
emb(input_ids) shape = (2, 3, 4)
Hello   的向量 = [1.0, 0.5, -0.5, 0.25]
查表 == one-hot @ W : True
每行梯度绝对值之和 = [8.0, 4.0, 4.0, 0.0, 4.0, 4.0]
```

三件事值得记下来：

**形状只加了一维。** `[b, s]` 的整数 ID 查表后变成 `[b, s, d_model]`。整张表只有 `vocab_size × d_model` 个数，与序列长度无关——这就是 15 万级词表能跑的根本原因。如果用 one-hot 矩阵实现，形状会是 `[b, s, vocab_size]`，完全不可接受。

**向量里的数没有可解释的结构。** `Hello` 的第一维恰好是 `1.0` 只是我手填的结果；真实模型里这些数全是训练学出来的，初始化时是随机的。

**梯度只回传到本批次出现过的 token 行。** 最后一行的 `8.0 / 4.0 / 0.0` 说明：`<pad>` 出现两次所以梯度是 8.0（loss 用了 `sum`，出现几次计几次），未出现的 `Nanjing` 是 0.0。这也解释了为什么大批量训练里 padding 位置必须靠 `attention_mask` 屏蔽。

## 三、位置编码：从「叠加」到「旋转」

Transformer 原论文用的是**绝对位置编码**：直接在线性叠加位置向量 `x_i + p_i`，其中 `p_i` 是可训练的向量（后来的 Sinusoidal PE 用不同周期的正弦余弦函数生成 `p_i`，不需要训练）。

它的直觉来自序数编码：十进制的个位每 10 个位置循环一次，十位每 100 个循环一次；每一维用不同周期的函数刻画位置。

RoFormer 论文（[arXiv:2104.09864](https://arxiv.org/abs/2104.09864)）提出换一个思路。目标等式是：

```text
⟨ f_q(x_m, m), f_k(x_n, n) ⟩ = g(x_m, x_n, m-n)
```

即 Q、K 旋转后的内积**只依赖相对位置 `m-n`**。

### 2D 直觉：把向量看成一支箭头

先只看二维向量 `x=(x_0,x_1)`，把它画成平面上的一支箭头。位置 `n` 不再通过加一个新向量表示，而是让箭头**旋转**：

```text
        ⎡ cos(nθ)  -sin(nθ) ⎤
R(nθ) = ⎢                   ⎥      R(nθ)x = 把 x 逆时针转 nθ
        ⎣ sin(nθ)   cos(nθ) ⎦
```

```python
import torch, math

theta = math.pi / 6                 # 每前进一个位置旋转 30°
q = torch.tensor([1.0, 0.0])        # 固定在位置 0 的 query
k = torch.tensor([0.6, 0.8])        # 一个长度为 1 的 key

def rope2d(v, pos):
    """把二维向量 v 旋转 pos * theta 度"""
    c, s = math.cos(pos * theta), math.sin(pos * theta)
    R = torch.tensor([[c, -s],
                      [s,  c]])
    return R @ v

print("原始 ||k|| =", k.norm().item())
for n in range(4):
    kn = rope2d(k, n)
    dot = (q @ kn).item()            # q 固定在位置 0，与位置 n 的 k 比较
    print(f"位置 {n}: R({n}*30°)k = ({kn[0].item():.4f}, {kn[1].item():.4f})"
          f"  ||·|| = {kn.norm().item():.4f}  q·R(n)k = {dot:.4f}")
```

输出：

```text
原始 ||k|| = 1.0000
位置 0: R(0*30°)k = (0.6000, 0.8000)  ||·|| = 1.0000  q·R(n)k = 0.6000
位置 1: R(1*30°)k = (0.1196, 0.9928)  ||·|| = 1.0000  q·R(n)k = 0.1196
位置 2: R(2*30°)k = (-0.3928, 0.9196)  ||·|| = 1.0000  q·R(n)k = -0.3928
位置 3: R(3*30°)k = (-0.8000, 0.6000)  ||·|| = 1.0000  q·R(n)k = -0.8000
```

三件事：

**旋转严格保长度。** `||·||` 每一行都是 `1.0000`——旋转是正交变换。位置编码不会偷偷改变向量的尺度，也就不会破坏 embedding 已经学到的模长语义。

**方向变了，点积就变了。** 点积从 `0.6000` 一路降到 `-0.8000` 并变号。位置编码之所以必要，正因为 attention 的分数只由「方向 + 长度」决定，不给位置信息它就分不清谁在前谁在后。

**注意 q 始终在位置 0。** 它旋转 0 度、原封不动。位置差才是 attention 真正需要的量。

### 杀手级性质：内积只依赖位置差

枚举多组 `(m,n)` 验证：

```python
def score(m, n):
    return (rope2d(q, m) @ rope2d(k, n)).item()

pairs = [(0, 0), (1, 1), (2, 2), (3, 3), (4, 4),    # n-m = 0
         (0, 1), (1, 2), (2, 3), (3, 4),             # n-m = +1
         (0, 2), (2, 4), (4, 2), (3, 1),             # n-m = ±2
         (0, 4)]                                     # n-m = +4

for m, n in pairs:
    print(f"m={m} n={n}  n-m={n - m:+d}  q_m·R(n)k = {score(m, n):.4f}")

same_d = [(0, 1), (1, 2), (2, 3), (3, 4)]           # 位置差都是 +1
vals = [score(m, n) for m, n in same_d]
print("位置差都是 +1 的点积 =", [round(v, 6) for v in vals])
print("是否完全一致 =", max(vals) - min(vals) < 1e-6)
```

输出：

```text
m=0 n=0  n-m=+0  q_m·R(n)k = 0.6000
m=1 n=1  n-m=+0  q_m·R(n)k = 0.6000
m=2 n=2  n-m=+0  q_m·R(n)k = 0.6000
m=3 n=3  n-m=+0  q_m·R(n)k = 0.6000
m=4 n=4  n-m=+0  q_m·R(n)k = 0.6000
m=0 n=1  n-m=+1  q_m·R(n)k = 0.1196
m=1 n=2  n-m=+1  q_m·R(n)k = 0.1196
m=2 n=3  n-m=+1  q_m·R(n)k = 0.1196
m=3 n=4  n-m=+1  q_m·R(n)k = 0.1196
m=0 n=2  n-m=+2  q_m·R(n)k = -0.3928
m=2 n=4  n-m=+2  q_m·R(n)k = -0.3928
m=4 n=2  n-m=-2  q_m·R(n)k = 0.9928
m=3 n=1  n-m=-2  q_m·R(n)k = 0.9928
m=0 n=4  n-m=+4  q_m·R(n)k = -0.9928
位置差都是 +1 的点积 = [0.119615, 0.119615, 0.119615, 0.119615]
是否完全一致 = True
```

表格分成明显的「行」：`n-m=+0` 的五组全是 `0.6000`，`n-m=+1` 的四组全是 `0.1196`，`n-m=±2` 的两组分别一致——**位置本身完全不出现在结果里，只剩相对距离**。

数学上这就是旋转矩阵的乘法性质：`R(mθ)^T R(nθ) = R((n-m)θ)`，所以

```text
(R(mθ)q)^T R(nθ)k = q^T R((n-m)θ)k
```

两个位置编码是在做**乘法（旋转的复合）**，而不是把两个位置向量加起来——这正是 RoPE 能天然表达相对位置的原因。

> 符号约定提醒：本篇写的是 `q^T R((n-m)θ)k`，有的资料写成 `R((m-n)θ)`，差一个转置——符号约定不同，物理含义（只依赖相对位置）完全一样。

### 高维 RoPE：两两分组，不同角速度

二维情形推广到高维时，hidden vector 的维度两两分组：`(x_0,x_1)`、`(x_2,x_3)`、……，每一对维度在自己的二维平面中旋转，**不同维度使用不同的角速度**——低维转得快（表达短距离），高维转得慢（表达长距离），因此同时覆盖两个尺度。

实际模型在 attention 的每一层对 **Q 和 K** 应用 RoPE。

## 四、落地细节：Llama 与 Qwen3 的差别藏在维度里

读开源模型结构时，先看维度能直接暴露架构选择。以两个真实的 config 为例（抓取于 2026-11-06）：

| | Llama-3.2-1B | Qwen3-0.6B |
|---|---|---|
| hidden_size | 2048 | 1024 |
| num_attention_heads | 32 | 16 |
| num_key_value_heads | 8 | 8 |
| head_dim | 64 | 128 |
| rope_theta | 500000.0 | 1000000.0 |
| max_position_embeddings | 131072 | 40960 |
| vocab_size | 128256 | 151936 |

**Llama 的 GQA 从投影维度就能看出来。** 在 [transformers 的 Llama 实现](https://github.com/huggingface/transformers/blob/main/src/transformers/models/llama/modeling_llama.py) 里：

```python
self.q_proj = nn.Linear(config.hidden_size, config.num_attention_heads * self.head_dim, ...)
self.k_proj = nn.Linear(config.hidden_size, config.num_key_value_heads * self.head_dim, ...)
self.v_proj = nn.Linear(config.hidden_size, config.num_key_value_heads * self.head_dim, ...)
```

Llama-3.2-1B 的 `q_proj` 输出 `32 × 64 = 2048` 维，`k_proj` / `v_proj` 输出 `8 × 64 = 512` 维。**看到 `k_proj` 的输出维度只有 `q_proj` 的四分之一，就知道这是 GQA**（分组查询注意力），而不是标准的多头注意力。

**Qwen3 多了一步 RMSNorm。** 在 [transformers 的 Qwen3 实现](https://github.com/huggingface/transformers/blob/main/src/transformers/models/qwen3/modeling_qwen3.py) 里：

```python
self.q_norm = Qwen3RMSNorm(self.head_dim, eps=config.rms_norm_eps)  # only on the head dim
self.k_norm = Qwen3RMSNorm(self.head_dim, eps=config.rms_norm_eps)
...
query_states = self.q_norm(self.q_proj(hidden_states).view(hidden_shape)).transpose(1, 2)
key_states = self.k_norm(self.k_proj(hidden_states).view(hidden_shape)).transpose(1, 2)
```

Q、K 在**投影之后、RoPE 之前**各过一次 RMSNorm，且只在 head_dim 维度上做。这是 2024 年后稳定训练（LLaMA 3 之后）的常见 trick，值得注意它与 RoPE「旋转保长度」性质的相互作用：RMSNorm 先把 Q、K 的模长归一化，RoPE 再旋转方向——两者分工明确，一个管尺度，一个管方向。

**最后一点：RoPE 在每一层都施加，不是在输入端加一次。** 经典 Transformer 结构只对输入 token 做一次位置编码叠加；Llama 是在 Transformer 的**每一层** attention 的 Q、K 上施加 RoPE。

## 五、边界与常见坑

**长度外推不是免费的。** RoPE 的训练长度有限（Llama-3.2-1B 是 131072，Qwen3-0.6B 是 40960）。要外推就得改 `rope_theta`（拉大基数等于降低高频维度的角速度）或用 NTK-aware / YaRN 之类的插值方法，这会引入额外误差。

**`rope_theta` 的量级差异是刻意的。** Llama-3.2-1B 用 500000，Qwen3-0.6B 用 1000000，经典实现是 10000。基数越大，低频维度转得越慢，理论上能覆盖更长的上下文——代价是高频维度（短距离信息）的分辨率被稀释。

**别把 mask 当成位置编码。** `attention_mask` 是「这个位置存不存在」，`positional embedding` 是「这个位置是第几个」。前者是布尔的有效位，后者是连续的角度，两者混用会让模型分不清「补齐」和「靠后」。

**tensor 操作基本功。** 真正读模型源码时会反复用到 `view` / `reshape`（`view` 要求内存连续并共享存储，不能 view 时 `reshape` 返回副本）、`transpose` / `permute`（维度交换 vs 维度重排）、broadcasting（从右向左对齐，维度相等或其一为 1 时自动扩展）、`einsum`（用下标约定统一表达 matmul / bmm / 注意力分数）。这四样不熟，读 attention 的计算路径会很吃力。

## FAQ

**Q：RoPE 和 Sinusoidal PE 到底差在哪？**
A：Sinusoidal PE 是绝对位置编码，把一个位置向量**加**到 embedding 上；RoPE 不加任何东西，而是按位置**旋转** Q、K。直接后果是 RoPE 的注意力分数天然只依赖相对位置，而绝对位置编码需要额外机制才能表达相对关系。

**Q：为什么 RoPE 要作用在 Q 和 K 上，而不是 embedding 上？**
A：因为 attention 分数是 `q^T k`。只有 Q 和 K 都带上同一个位置变换，内积才会坍缩成只跟位置差相关的形式；只旋转一边不起作用。

**Q：为什么旋转不会破坏 embedding 的模长语义？**
A：旋转矩阵是正交变换，`‖R(nθ)x‖ = ‖x‖` 严格成立。方向变了，长度不变——这正是它比「加一个位置向量」更温和的地方。

**Q：GQA 会不会影响 RoPE 的实现？**
A：不会。RoPE 作用在每个 head 的 Q、K 上，与 KV 头数无关。GQA 影响的是 K、V 的**头数**和投影维度，不影响位置编码的数学形式。

## 相关阅读

- RoFormer 论文（RoPE 原始出处）：[arXiv:2104.09864](https://arxiv.org/abs/2104.09864)
- 苏剑林《Transformer 升级之路：10、RoPE 是一种 β 进制编码》：[kexue.fm/archives/9675](https://kexue.fm/archives/9675) — 把 RoPE 与「序数/进制编码」直觉打通的中文解读
- Hugging Face Llama 文档：[huggingface.co/transformers/model_doc/llama](https://huggingface.co/transformers/model_doc/llama.html)
- 同系列的 [MoE、LoRA 与数值精度：从零实现一遍](/blog/moe-lora-numeric-precision-explained/) — 讲义第 8 讲，同样是「原理 + 可复现代码 + 实跑校验」的路子
- Transformer 基础：[Transformer 详解：注意力就是一切](/blog/paper-reading/transformer-explained-in-detail/)
- 推理侧的位置编码实践：[PagedAttention 第三章](/blog/inference-engineering/inference-engineering-series-03-c-paged-attention/) — MLA 场景下 RoPE 与 KV 压缩的交互
