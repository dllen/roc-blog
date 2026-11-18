---
title: "从数数到采样：手写一个语言模型"
date: 2026-11-18
update_date: 2026-11-18
description: "不用任何框架，从二元组计数写出一个能自回归生成的「语言模型」，再把它的骨架逐层加厚成 Embedding → Linear → ReLU → 采样。这篇把 LLM 前向链路的每一层都落到能手算复核的数字上，顺带核对了讲义里一处已经过时的词表规模说法。"
tldr: "语言模型的起点只是数一数每个字后面跟了哪些字；把计数换成 Embedding、把查表换成 Linear、把贪心换成采样，骨架始终是同一条——输入 token，输出下一个 token 的概率。"
keywords: ["二元组语言模型", "n-gram 计数", "自回归生成", "tokenizer 词表", "pad unk 掩码", "LLM 前向链路"]
taxonomies:
  tags: ["LLM原理", "NLP", "AI Agent"]
---

「从数数到采样」这条链路走完，你会看到一个语言模型从统计字典长成神经网络的完整过程：起点只是数一数每个字后面跟了哪些字，终点是一串手算可核的 logits 和采样结果。

从零实现一门课的开门讲，最容易写成课程简介。这篇换个角度：把讲义里三个演示程序当作主线，把每一步的中间数字都摊开手算复核，最后回到一个具体问题——讲义里那句「真实中文模型的词表在 10 万～15 万量级」，今天还成立吗？三个演示整理自南京大学《大语言模型基础：从零到一实现之路》第 1 讲（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2026/lecture1.html)。文中所有代码都在本地实跑过，正文印的输出是真实结果。

## 一、语言模型的起点是数数

第一个演示不用任何框架，只用 Python 字典统计二元组，再预测下一个字：

```python
from collections import defaultdict

corpus = "我来到逸夫馆我来到教室我来到食堂"

# ① 统计二元组 (前一个字, 后一个字) 的出现次数
bigram = defaultdict(lambda: defaultdict(int))
for a, b in zip(corpus, corpus[1:]):
    bigram[a][b] += 1

# ② 把计数转成条件概率 p(后一个字 | 前一个字)，并取 argmax 做贪心预测
def predict_next(prefix):
    row = bigram[prefix[-1]]
    total = sum(row.values())
    probs = {c: n / total for c, n in row.items()}
    return probs, max(row, key=row.get)


for prefix in ["我", "我来到", "我来到逸夫馆"]:
    probs, best = predict_next(prefix)
    print(f"P(· | {prefix!r}) =", {k: round(v, 2) for k, v in probs.items()},
          "-> 贪心预测:", best)

# ③ 用同一个模型自回归生成 8 个字
out = "我"
for _ in range(8):
    _, best = predict_next(out)
    out += best
print("生成结果:", out)
```

实跑输出：

```text
P(· | '我') = {'来': 1.0} -> 贪心预测: 来
P(· | '我来到') = {'逸': 0.33, '教': 0.33, '食': 0.33} -> 贪心预测: 逸
P(· | '我来到逸夫馆') = {'我': 1.0} -> 贪心预测: 我
生成结果: 我来到逸夫馆我来到
```

这里有两件事值得停下来看。

**第一，`P(· | '我来到')` 是一个均匀分布。** 语料里「到」后面三个字各出现一次，模型完全无法分辨，于是 `max(row, key=row.get)` 只能取到最先插入的「逸」。语料一换，模型就「错」了——这不是模型不行，是它只有 16 个字的训练数据。

**第二，生成结果是「我来到逸夫馆我来到」。** 这是模型记住的**训练语料片段**，不是它「理解」了句子。整个模型就是两张字典，没有一个浮点数。

而这已经是链式法则 + N-gram model 的完整实现了：`bigram[a][b] / Σ_b'` 就是 p(b|a)，`predict_next` 输出的字典正是「下一个字的候选分布」。把 `bigram[a][b]` 换成 `softmax(W[a] · h)`，这个文件就从统计模型变成了神经网络——区别只在表达方式，不在做什么。

## 二、换掉查表：Embedding → Linear → ReLU → 采样

第二个演示把真实 LLM 的前向链路压缩到一个 3 词表、2 维隐藏层的玩具模型上。所有权重手工指定，所以每个输出数字都能心算复核：

```python
import torch
import torch.nn as nn

vocab = ['a', 'b', 'c']
V, H = len(vocab), 2                 # 词表 3 个 token，隐藏维度只有 2

# 权重全部手写：保证每一个输出数字都能用纸笔复现
emb = nn.Embedding(V, H)
emb.weight.data = torch.tensor([[0.0, 1.0],
                                [1.0, 0.0],
                                [0.5, 0.5]])
fc1 = nn.Linear(H, H)
fc1.weight.data = torch.tensor([[1.0, -1.0],
                                [0.0,  1.0]])
fc1.bias.data.zero_()
fc2 = nn.Linear(H, V)
fc2.weight.data = torch.tensor([[1.0,  0.0],
                                [0.0,  1.0],
                                [1.0, -1.0]])
fc2.bias.data.zero_()
model = nn.Sequential(emb, fc1, nn.ReLU(), fc2)

# 单步前向：逐层打印 shape 与数值
ids = [0]                            # 上文只有 1 个 token：'a'
x = emb(torch.tensor([ids]))
print("① embedding :", tuple(x.shape), x.tolist())
h1 = fc1(x)
print("② Linear H→H:", tuple(h1.shape), h1.tolist())
h2 = torch.relu(h1)
print("③ ReLU       :", tuple(h2.shape), h2.tolist())
out = fc2(h2)
print("④ Linear H→V:", tuple(out.shape), [round(v, 4) for v in out[0, -1].tolist()])
logits = out[0, -1]

# 采样：固定随机数 u，便于复现；u 在累积分布上落在哪一格就选哪个 token
def sample(logits, T, u):
    p = torch.softmax(logits / T, dim=-1)
    return p, int((p.cumsum(0) < u).sum())

# 温度只改变概率分布的形状，不改变 argmax
for T in [1.0, 0.5]:
    p, nxt = sample(logits, T, u=0.95)
    print(f"T={T} -> 概率 {[round(v, 4) for v in p.tolist()]} 求和 {round(p.sum().item(), 4)}, 采样到 '{vocab[nxt]}'")

# 自回归生成 4 步，每步用不同的随机数 u
ids = [0]
for u in [0.30, 0.90, 0.10, 0.60]:
    h = torch.relu(fc1(emb(torch.tensor([ids]))))
    p, nxt = sample(fc2(h)[0, -1], 1.0, u)
    ctx = "".join(vocab[i] for i in ids)
    ids.append(nxt)
    print(f"上文 {ctx} -> 概率 {[round(v, 4) for v in p.tolist()]} 求和 {round(p.sum().item(), 4)}, 采到 '{vocab[nxt]}'")
print("生成:", "".join(vocab[i] for i in ids))
```

实跑输出：

```text
① embedding : (1, 1, 2) [[[0.0, 1.0]]]
② Linear H→H: (1, 1, 2) [[[-1.0, 1.0]]]
③ ReLU       : (1, 1, 2) [[[0.0, 1.0]]]
④ Linear H→V: (1, 1, 3) [0.0, 1.0, -1.0]
T=1.0 -> 概率 [0.2447, 0.6652, 0.09] 求和 1.0, 采样到 'c'
T=0.5 -> 概率 [0.1173, 0.8668, 0.0159] 求和 1.0, 采样到 'b'
上文 a -> 概率 [0.2447, 0.6652, 0.09] 求和 1.0, 采到 'b'
上文 ab -> 概率 [0.4223, 0.1554, 0.4223] 求和 1.0, 采到 'c'
上文 abc -> 概率 [0.3072, 0.5065, 0.1863] 求和 1.0, 采到 'a'
上文 abca -> 概率 [0.2447, 0.6652, 0.09] 求和 1.0, 采到 'b'
生成: abcab
```

**这四行就是全部的 LLM 前向传播。** `Embedding` 把 token id 变成向量，若干 `Linear` 做形状变换，`ReLU` 提供非线性，最后一次 `Linear` 把隐藏维投影回词表得到 logits。真实模型不过是在这个骨架上逐层加厚——残差、Attention、RMSNorm、RoPE 加的是厚度，不是换掉骨架。

shape 的规律也值得记一下：`(batch, seq_len, hidden)` 里只有最后一维在变，`2 → 2 → 2 → 3`，序列长度 1 全程不变。模型的每一步都是「特征空间的变换」。

**温度那一行是整段里最容易被误解的地方。** 把 `[0, 1, -1]` 除以 0.5 变成 `[0, 2, -2]`，概率从 `[0.2447, 0.6652, 0.0900]` 收敛到 `[0.1173, 0.8668, 0.0159]`：分布变尖了，但 **argmax 仍然是 `'b'`**。同一个随机数 u=0.95 在两个分布里落在了不同 token 上——T=1.0 采到 `'c'`，T=0.5 采到 `'b'`。

所以温度不是「选最强的那个」，而是「把概率拉得更开或更平」。这一点在[解码参数手册](/blog/decoding-parameters-temperature-top-p/)里有更完整的拆解。

最后 4 行是自回归：每一步把刚采出来的 token 接到上文末尾，再跑一遍前向。GPT、ChatGPT、DeepSeek 的「文字接龙」就是这个循环，区别只在于 V 从 3 变成 15 万、H 从 2 变成几千。

而生成的 `"abcab"` 是**毫无意义的乱码**——权重是随手指定的、从未训练过。这正是「从零到一」的意义：先把「输入 Tensor → forward → logits → 采样」这条链路跑通，后面讲反向传播时才是在优化这些权重，让乱码慢慢变成人话。

## 三、换掉字符：词表与 Tokenization

第三个演示不引入任何 tokenizer 库，用 `Counter` 手工建一个 12 项的中文字表：

```python
from collections import Counter

corpus = ["我喜欢苹果", "我爱吃香蕉", "他喜欢香蕉"]

# ① 按频次降序建词表，<pad> / <unk> 是两个保留符号
counter = Counter("".join(corpus))
vocab = ["<pad>", "<unk>"] + [c for c, _ in counter.most_common()]
stoi = {s: i for i, s in enumerate(vocab)}
print("词表大小:", len(vocab))
print("词表:", vocab)

# ② 编码：文本 -> token id 序列（本例字符级，故 1 字 = 1 token）
text = "我喜欢香蕉"
ids = [stoi.get(c, stoi["<unk>"]) for c in text]
print(f"{text}  ({len(text)} 字) -> {ids}  ({len(ids)} token)")

# ③ 成 batch：长度不同的句子右补 <pad>，补齐到 batch 内最长
sentences = ["我喜欢", "他爱吃香蕉和苹果"]
rows = [[stoi.get(c, stoi["<unk>"]) for c in s] for s in sentences]
T = max(len(r) for r in rows)
batch = [r + [stoi["<pad>"]] * (T - len(r)) for r in rows]
sym = {"<pad>": "_", "<unk>": "?"}
for s, r in zip(sentences, batch):
    print(r, "->", "".join(sym.get(vocab[i], vocab[i]) for i in r))

# ④ 解码回文本
print("解码:", "".join(vocab[i] for i in ids))

# ⑤ 子词切分：高频词整块保留，生僻词才拆得更细
for w, p in {"香蕉": ["香蕉"], "香蕉味苏打饼干": list("香蕉味苏打饼干")}.items():
    print(f"{w}: {len(w)} 字 -> {len(p)} token {p}")
```

实跑输出：

```text
词表大小: 12
词表: ['<pad>', '<unk>', '我', '喜', '欢', '香', '蕉', '苹', '果', '爱', '吃', '他']
我喜欢香蕉  (5 字) -> [2, 3, 4, 5, 6]  (5 token)
[2, 3, 4, 0, 0, 0, 0, 0] -> 我喜欢_____
[11, 9, 10, 5, 6, 1, 7, 8] -> 他爱吃香蕉?苹果
解码: 我喜欢香蕉
香蕉: 2 字 -> 1 token ['香蕉']
香蕉味苏打饼干: 7 字 -> 7 token ['香', '蕉', '味', '苏', '打', '饼', '干']
```

第三行输出里「和」不在词表中，被映射成 `<unk>`(id=1)，显示成 `?`。真实 tokenizer 不会这样粗暴，而是用子词兜底——这正是第 ⑤ 步要说明的：高频词「香蕉」整块保留成一个 token，生僻的「香蕉味苏打饼干」才拆成 7 个。

而 `<pad>` 用 id=0 右补齐成矩形张量 `(2, 8)`，是能做**批量矩阵乘法**的前提。没有 padding 就没有 batch，训练吞吐会塌掉。

## 四、讲义里一处需要更新的数字

讲义给出一个数字：「真实中文模型的词表在 10 万～15 万量级」。这个说法在写下时是对的，但不是恒真事实——Qwen3.8-27B 的 `config.json` 里 `text_config.vocab_size` 是 **248320**，已经接近 25 万。

这件事本身就是这门课想教的东西：**讲义印的是某个时刻的观察，不是恒真事实**。读讲义时正确的姿势是把数字当作「某个版本的记录」，需要用到就回一手核对，而不是照抄。

同理，讲义里 `model.from_pretrained("Qwen/Qwen3.8-27B")` 这个模型名——笔记的评注曾怀疑它是示意性占位（因为当时查不到这个规格），但实际核对下来 `Qwen/Qwen3.8-27B` 在 HuggingFace 上真实存在：模型卡 `lastModified` 为 2026-11-07，下载量超过 690 万次，`text_config.vocab_size` 正是 248320。

顺带说，词表大小直接决定最后一层 `Linear` 的输出维度，也是模型参数量的重要来源——这是「中文比英文贵」的技术根源之一：中文一个字往往对应多个 token，序列更长，送进模型的计算量更大。

## 五、它不解决什么

- 这三个演示是**教学用的最小例子**，不是可用的语言模型。二元组模型连句子都说不完整，玩具神经网络的权重是手填的、生成纯乱码。它们的价值是让链路可核对，不是产出可用结果。
- 真实 tokenizer 不做「未登录字符 → `<unk>`」这种粗暴处理，而是用子词兜底。演示里「和」被映射成 `<unk>`(id=1)，只是为了让读者看清 `<unk>` 这一格存在。
- 词表规模的数字会随模型版本变。本文引的 248320 是 Qwen3.8-27B 在 2026-11-18 的 `config.json` 值，换个模型或换个时间就不同——用的时候回 `config.json` 看一眼，别引用本文的。
- 讲义第一讲的另一半是课程大纲、考核方式、团队介绍，那些内容对读者的价值有限，这篇没有展开。

## FAQ（六、常见问题）

**问：二元组模型和 LLM 的区别到底在哪？**

在表达方式，不在目标。两者都是「给定上文，输出下一个 token 的分布」。二元组模型把分布记在字典里，LLM 把它算成一个函数。演示里那句 `bigram[a][b]` 换成 `softmax(W[a] · h)` 就是全部差别——但换过去之后，「统计谁跟着谁」变成了「学习一个函数」，训练、泛化、表示能力的可能性才真正打开。

**问：为什么 padding 要放在右边？**

因为 batch 里要能做统一的矩阵乘法，右补齐能让每行长度一致，同时保留序列的先后顺序（左边补会打乱位置）。补上的 `<pad>` 在算注意力时要被 mask 掉，否则模型会把「填充」当成真实内容。这个演示没有做 mask（它只演示到编码这一步），真实训练里 mask 是必需的一环。

**问：采样里那个固定随机数 u 是什么意思？**

它是「累积概率分布上的位置」。把概率按 token 顺序累加成一个从 0 到 1 的刻度，u 落在哪一格就选哪个 token。固定 u 是为了让输出可复现——同样的 logits 和同样的 u，永远采到同一个 token。换 u 就换一次采样，温度改变的正是「同一个 u 落在哪一格」。

**问：词表多大算合理？**

没有普适答案，取决于任务和语言。经验上词表越大，同一段文本的 token 数越少（序列更短），但最后一层的参数和 embedding 表会变大，两头都要付代价。中文场景通常比英文需要更大的词表，因为常用字的组合空间大。真正的判据是业务上的权衡，不是某个数字。

## 延伸阅读

- [解码参数手册：温度、Top-k、Top-p 与惩罚项](/blog/decoding-parameters-temperature-top-p/) —— 把本文采样那一行展开成完整的手册。
- [RoPE 旋转位置编码：Attention 如何感知顺序](/blog/rope-and-input-embedding-explained/) —— 承接本文「Embedding → Linear」的骨架，看位置信息是怎么注入的。
- [Attention 机制：为什么 K/V 比 Q 窄](/blog/attention-mechanism-and-gqa/) —— 本文骨架加厚的第一个关键部件。
- **原始幻灯片**：<https://njudeepengine.github.io/llm-course-lecture/2026/lecture1.html>
- **Qwen3.8-27B 模型卡**：<https://huggingface.co/Qwen/Qwen3.8-27B>
