---
title: "SFT 数据流水线：从 Alpaca 到可训练的 batch"
date: 2026-11-11
update_date: 2026-11-11
description: "一条 SFT 流水线要串起五步数据准备、collate 打包和目标函数三件事。本文逐行走完 Alpaca 到 Trainer 的链路，并实测两处会在今天直接报错或静默少监督一位的细节。"
tldr: "预处理负责「每条样本长什么样」，collate 负责「这一批怎么对齐」。labels 的右移由框架内部完成，外部再右移一次就会静默丢掉一个监督位置。"
keywords: ["SFT 数据流水线", "collate 函数", "label shifting", "stratify_by_column", "ignore_index"]
taxonomies:
  tags: ["LLM", "SFT", "PyTorch", "工程实践"]
---

**SFT 数据流水线**的代码往往只有几十行，真正难的地方藏在数据从原始文本走到一个 batch 的那段路上：怎么切分验证集、怎么把不等长样本对齐、labels 到底要不要自己右移。这篇把南京大学《大语言模型基础》第 10 讲的 SFT 链路完整走一遍，途中实测出两处问题——一处会直接抛异常，一处不报错但会静默少监督一个位置。

本文整理自南京大学《大语言模型基础：从零到一实现之路》第 10 讲「模型训练二三事」（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture10.html)。课程给出的框架是**输入侧**（数据准备 + batch 策略）、**输出侧**（目标函数）、**执行侧**（训练框架 + 评估保存）三块，本文聚焦前两块的衔接。

## 一、五步数据准备，每步都在改变数据的形状

课程用 Alpaca 数据集演示完整链路，五步依次是：载入 → 规则过滤 → 统一字段 → 划分训练/验证 → Tokenizer 对齐。每一步产出的 `Dataset` 都比上一步多一列或少一些行，最终变成模型能吃的张量。

```python
from datasets import load_dataset

raw_ds = load_dataset("tatsu-lab/alpaca")
train_raw = raw_ds["train"]
print(raw_ds)
```

Alpaca 有 52,002 行，四列：`instruction` / `input` / `output`，外加一列把三者拼好的 `text`。原生是 `instruction` / `input` / `output` 三个字段，而对话格式用 `messages` 列表。两者并存会让后面的模板处理分叉，所以第三步把它们归一：

```python
from datasets import load_dataset

raw_ds = load_dataset("tatsu-lab/alpaca")
train_raw = raw_ds["train"]


def build_messages(example):
    user_prompt = example["instruction"].strip()
    if example["input"]:
        user_prompt += "\n" + example["input"].strip()
    return {
        "messages": [
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": example["output"].strip()},
        ]
    }


structured = train_raw.map(build_messages)
print("归一后列 =", structured.column_names)
print("第一条 messages =", structured[0]["messages"])
```

归一之后才能套用各种 chat template——这也是 LLaMA Factory 这类框架接受 `messages` 的原因。

第四步划分训练/验证集，课程给了一个「按长度分桶再分层」的进阶写法，动机是避免随机划分把长样本全塞进训练集、短样本全塞进验证集：

```python
from datasets import load_dataset

raw_ds = load_dataset("tatsu-lab/alpaca")
train_raw = raw_ds["train"]


def build_messages(example):
    user_prompt = example["instruction"].strip()
    if example["input"]:
        user_prompt += "\n" + example["input"].strip()
    return {
        "messages": [
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": example["output"].strip()},
        ]
    }


def add_length_bucket(example):
    length = len(example["messages"][0]["content"].split())
    bucket = min(length // 200, 4)  # 0-4 共5档
    example["len_bucket"] = bucket
    return example


structured = train_raw.map(build_messages)
bucketed = structured.map(add_length_bucket)

try:
    bucketed.train_test_split(
        test_size=0.02,
        seed=42,
        stratify_by_column="len_bucket",
    )
except ValueError as e:
    print("ValueError:", e)
```

**这段代码在今天的 `datasets` 上跑不通。** `stratify_by_column` 要求被分层列的特征类型是 `ClassLabel`，而 `map` 写进去的普通整数列是 `Value`。实测报错：

```text
ValueError: Stratifying by column is only supported for ClassLabel column, and column len_bucket is Value.
```

修法是在建表时就把该列声明成 `ClassLabel`：

```python
from collections import Counter

from datasets import ClassLabel, Dataset, Features, Value

# 造三档等量的数据（各 20 条）
rows = []
for i in range(60):
    n = 5 + (i % 3) * 50          # 三个长度档
    rows.append({"text": " ".join(["w"] * n), "len_bucket": min(n // 50, 2)})

feat = Features({
    "text": Value("string"),
    "len_bucket": ClassLabel(names=["short", "medium", "long"]),
})
ds = Dataset.from_list(rows, features=feat)

split = ds.train_test_split(test_size=0.25, seed=42, stratify_by_column="len_bucket")
tr, te = split["train"], split["test"]
print("分层   train 桶分布:", dict(sorted(Counter(tr["len_bucket"]).items())))
print("分层   val   桶分布:", dict(sorted(Counter(te["len_bucket"]).items())))

# 对照：同样 seed，但不分层
split2 = ds.train_test_split(test_size=0.25, seed=42)
print("不分层 val   桶分布:", dict(sorted(Counter(split2["test"]["len_bucket"]).items())))
print("不分层 train 桶分布:", dict(sorted(Counter(split2["train"]["len_bucket"]).items())))
```

分层的效果可以量化。同样 `seed=42`、同样 `test_size=0.25`：

```text
分层   train 桶分布: {0: 15, 1: 15, 2: 15}
分层   val   桶分布: {0: 5, 1: 5, 2: 5}
不分层 val   桶分布: {0: 5, 1: 4, 2: 6}
不分层 train 桶分布: {0: 15, 1: 16, 2: 14}
```

不分层时验证集里长样本占四成（40.0%），训练集里反而只有 31.7%——分布偏移直接来自一次随机抽样。分层之后两边比例严格一致（各 33.3%）。`train_test_split` 的签名里确实有 `stratify_by_column`（`datasets` 3.1.0 实测），只是列的类型有硬要求。

顺带一提，`train_test_split` 底层走的是 scikit-learn 的 `StratifiedShuffleSplit`，每个类别至少要有 2 个样本，否则报 `Minimum class count error`——用长度分桶时，档位切太细就会踩到这个限制。

## 二、collate：把不等长的样本对齐成一个 batch

预处理负责"每条样本长什么样"，collate 负责"这一批怎么对齐"。这一步只做三件事：补齐长度、生成 `attention_mask`、把补齐位置的 labels 设成忽略值。

```python
import torch
from torch.nn.utils.rnn import pad_sequence

PAD_ID, LABEL_PAD_ID = 0, -100

batch = [
    {"input_ids": [11, 25, 7, 42], "labels": [25, 7, 42, -100]},
    {"input_ids": [5, 6], "labels": [6, -100]},
    {"input_ids": [9, 8, 3, 1, 4], "labels": [8, 3, 1, 4, -100]},
]


def causal_lm_collate(batch, pad_id, label_pad_id=-100):
    input_ids = [torch.tensor(item["input_ids"]) for item in batch]
    labels = [torch.tensor(item["labels"]) for item in batch]
    attention = [torch.tensor([1] * len(item["input_ids"])) for item in batch]

    return {
        "input_ids": pad_sequence(input_ids, batch_first=True, padding_value=pad_id),
        "labels": pad_sequence(labels, batch_first=True, padding_value=label_pad_id),
        "attention_mask": pad_sequence(attention, batch_first=True, padding_value=0),
    }


out = causal_lm_collate(batch, pad_id=PAD_ID)
for k in ("input_ids", "labels", "attention_mask"):
    print("%s (shape=%s):" % (k, tuple(out[k].shape)))
    print(out[k])

am, lb = out["attention_mask"], out["labels"]
print("\nattention_mask 逐行:", am.tolist())
print("labels 中 -100 的总数:", int((lb == LABEL_PAD_ID).sum()))
print("其中 padding 位贡献:", int((lb == LABEL_PAD_ID).sum()) - len(batch))
print("padding 位数 = attention_mask==0 的个数:", int((am == 0).sum()))
print("真正被 ignore 的非 pad 位（序列末尾各 1 个）:",
      int((lb == LABEL_PAD_ID).sum()) - int((am == 0).sum()))
valid = (am == 1) & (lb != LABEL_PAD_ID)
print("\n参与 loss 的位置数 =", int(valid.sum()))
```

三个张量各有各的 padding 值，这不是随意选的：`input_ids` 补 `pad_id`（一个真实但无意义的 token id），`attention_mask` 补 `0`（把这个位置从注意力里屏蔽掉），`labels` 补 `-100`（让交叉熵跳过它）。

三条不等长样本过一遍 collate，输出是这样：

```text
input_ids (shape=(3, 5)):
tensor([[11, 25,  7, 42,  0],
        [ 5,  6,  0,  0,  0],
        [ 9,  8,  3,  1,  4]])
labels (shape=(3, 5)):
tensor([[  25,    7,   42, -100, -100],
        [   6, -100, -100, -100, -100],
        [   8,    3,    1,    4, -100]])
attention_mask (shape=(3, 5)):
tensor([[1, 1, 1, 1, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 1, 1, 1]])

attention_mask 逐行: [[1, 1, 1, 1, 0], [1, 1, 0, 0, 0], [1, 1, 1, 1, 1]]
labels 中 -100 的总数: 7
其中 padding 位贡献: 4
padding 位数 = attention_mask==0 的个数: 4
真正被 ignore 的非 pad 位（序列末尾各 1 个）: 3

参与 loss 的位置数 = 8
```

数一下 `-100` 的来源就清楚了：整个 batch 有 7 个 `-100`，其中 4 个来自 padding 位（`attention_mask == 0` 的个数正好是 4），另外 3 个是每条序列末尾各一个——序列末尾没有下一个 token，本来就无监督。真正参与 loss 的位置是 8 个（3 + 1 + 4）。

**三种 `-100` 来源要分清**：padding 位、序列末尾位、以及 SFT 时主动 mask 掉的 prompt 位。第三种是 SFT 的关键——只对 assistant 回复段计 loss，prompt 段置 `-100`，模型才只学"如何回答"而不是"如何提问"。

## 三、labels 的右移：由框架内部完成，外部不要重复

这是整条链路上最容易出错、也最不容易发现的一处。

课程给了一个"为什么 labels 要右移一位"的解释：位置 t 的 logits 预测的是 `input_ids[t+1]`，所以要令 `labels[t] == input_ids[t+1]`。这个语义没错，但紧接着给出的实现是：

```python
tokenized = {"input_ids": [11, 25, 7, 42, 3, 88, 19]}
labels = tokenized["input_ids"].copy()
labels[:-1] = labels[1:]      # 右移
labels[-1] = -100             # 最后一个位置无法预测下一个token
labels[0] = -100              # 忽略起始位置的loss
tokenized["labels"] = labels
print("讲义 in-place 版本 labels =", labels)
print("它监督的目标 = input_ids[2:] =", tokenized["input_ids"][2:])
```

```text
讲义 in-place 版本 labels = [-100, 7, 42, 3, 88, 19, -100]
它监督的目标 = input_ids[2:] = [7, 42, 3, 88, 19]
```

问题在于 HuggingFace 的 `CausalLM` **内部自己会做这次右移**。`transformers` 的 `loss_utils.py` 里，`ForCausalLMLoss` 的实现是先在 labels 末尾补一个 `ignore_index`，再取 `[1:]`。下面是这个 shift 逻辑的最小复刻：

```python
import torch
import torch.nn as nn


def hf_shift(labels, ignore_index=-100):
    """复刻 transformers ForCausalLMLoss 里的 shift：先在末尾补 ignore，再取 [1:]。"""
    labels = nn.functional.pad(labels, (0, 1), value=ignore_index)
    return labels[..., 1:].contiguous()


input_ids = torch.tensor([[11, 25, 7, 42, 3, 88, 19]])
shifted = hf_shift(input_ids)
print("原始 labels     =", input_ids.view(-1).tolist())
print("HF 内部右移后   =", shifted.view(-1).tolist())
print("监督目标        =", [x for x in shifted.view(-1).tolist() if x != -100])
```

输出：

```text
原始 labels     = [11, 25, 7, 42, 3, 88, 19]
HF 内部右移后   = [25, 7, 42, 3, 88, 19, -100]
监督目标        = [25, 7, 42, 3, 88, 19]
```

外部再右移一次，就会被右移两次。用 `transformers` 4.46.3 实测，把 logits 构造成"唯一正确答案就是 `input_ids[t+1]`"（正确标签处 logit 给 8、其余给 -8），两种写法对比：

```python
import torch
import torch.nn.functional as F
from transformers.loss.loss_utils import ForCausalLMLoss

input_ids = [11, 25, 7, 42, 3, 88, 19]
T, V = len(input_ids), 128

# 构造「唯一正确答案就是 input_ids[t+1]」的确定性 logits
logits = torch.full((1, T, V), -8.0)
for t in range(T - 1):
    logits[0, t, input_ids[t + 1]] = 8.0
logits[0, T - 1, 0] = 8.0

# 情形 A：不预右移
labels_A = torch.tensor([input_ids])
# 情形 B：讲义的 in-place 预右移
raw = list(input_ids)
raw[:-1] = raw[1:]
raw[-1] = -100
raw[0] = -100
labels_B = torch.tensor([raw])

for tag, labels in (("A 不预右移", labels_A), ("B 讲义预右移", labels_B)):
    shifted = F.pad(labels, (0, 1), value=-100)[..., 1:].contiguous().view(-1).tolist()
    tgt = [x for x in shifted if x != -100]
    loss = ForCausalLMLoss(logits, labels, vocab_size=V)
    print("[%s] 传入 labels = %s" % (tag, labels.view(-1).tolist()))
    print("      内部右移后监督 = %s" % tgt)
    print("      等于 input_ids[1:] ? %s   等于 input_ids[2:] ? %s"
          % (tgt == input_ids[1:], tgt == input_ids[2:]))
    print("      loss = %.8f" % loss.item())
```

输出：

```text
[A 不预右移] 传入 labels = [11, 25, 7, 42, 3, 88, 19]
      内部右移后监督 = [25, 7, 42, 3, 88, 19]
      等于 input_ids[1:] ? True   等于 input_ids[2:] ? False
      loss = 0.00001438
[B 讲义预右移] 传入 labels = [-100, 7, 42, 3, 88, 19, -100]
      内部右移后监督 = [7, 42, 3, 88, 19]
      等于 input_ids[1:] ? False   等于 input_ids[2:] ? True
      loss = 16.00001526
```

正确的那个 loss 接近 0，说明模型完全预测对了；错误的那个 loss 约等于 16（≈ log 128，即在 128 个候选里完全猜错），因为它实际在拿位置 t 的 logits 去对 `input_ids[t+2]`。**不报错、loss 曲线也"看起来正常"，只是每个位置的监督目标都错了一位。**

所以外部只写：

```python
tokenized = {"input_ids": [11, 25, 7, 42, 3, 88, 19]}
tokenized["labels"] = tokenized["input_ids"].copy()
print("labels =", tokenized["labels"])
```

```text
labels = [11, 25, 7, 42, 3, 88, 19]
```

想让某些位置不参与 loss，再把对应位置改成 `-100` 即可。

还有一层更细的问题：讲义那段 in-place 写法本身的结果就不对。`raw[:-1] = raw[1:]` 这种重叠切片赋值在 Python list 和 NumPy 上会得到 `[-100, 7, 42, 3, 88, 19, -100]`——开头那一格被 `labels[0] = -100` 覆盖掉，监督目标变成 `input_ids[2:]`，比标准写法**少一个位置**（丢掉了"11 → 25"这一位）。同一段代码放到 torch 张量上则直接抛异常：

```python
import torch

ids = torch.tensor([11, 25, 7, 42, 3, 88, 19])
try:
    ids[:-1] = ids[1:]
except RuntimeError as e:
    print("RuntimeError:", e)
```

```text
RuntimeError: unsupported operation: some elements of the input tensor and the written-to tensor refer to a single memory location. Please clone() the tensor before performing the operation.
```

需要复现这个行为，得先 `clone()`。这段代码对应的是**手写训练循环**（自己算 loss、不经过框架），而走 `Trainer` 时上面的规则才是准的——同一个"右移"语义，在两种写法下需要的代码不一样。

判断一份 labels 对不对，只需验一条不变式：对所有 t < n-1，`labels[t] == input_ids[t+1]`。

```python
input_ids = [11, 25, 7, 42, 3, 88, 19]
labels = input_ids[1:] + [-100]

n = len(input_ids)
print("有效 labels == input_ids[1:%d] :" % n, labels[:-1] == input_ids[1:n])
print("每个有效位满足 labels[t] == input_ids[t+1] :",
      all(labels[t] == input_ids[t + 1] for t in range(n - 1)))
```

```text
有效 labels == input_ids[1:7] : True
每个有效位满足 labels[t] == input_ids[t+1] : True
```

## 四、`-100` 不只是"跳过"，它还决定梯度

`-100` 是 PyTorch 交叉熵的 `ignore_index` 默认值。不配它，填充位会被当成 0 号类参与计算——模型于是去学"下一个 token 是 0"，也就是学 pad。

手写一遍带 `ignore_index` 的交叉熵和 `F.cross_entropy` 对拍，再看被屏蔽位置的梯度：

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)

B, T, V = 2, 6, 5
logits = torch.randn(B, T, V, requires_grad=True)
labels = torch.tensor([
    [3, 1, 4, 0, -100, -100],
    [2, 4, -100, -100, -100, -100],
])

flat_logits = logits.reshape(-1, V)
flat_labels = labels.reshape(-1)
keep = flat_labels != -100

print("展平后 logits: %s  labels: %s" % (tuple(flat_logits.shape), flat_labels.tolist()))
print("labels 中 -100 的个数: %d / %d" % (int((~keep).sum()), flat_labels.numel()))
print("真正参与 loss 的位置数: %d" % int(keep.sum()))

logp = F.log_softmax(flat_logits, dim=-1)
terms = -logp[keep].gather(1, flat_labels[keep].view(-1, 1)).squeeze(1)
manual_loss = terms.mean()
torch_loss = F.cross_entropy(flat_logits, flat_labels, ignore_index=-100)

print("\n手写 loss（先 log_softmax，再对有效位取负对数概率、求均值）= %.8f" % manual_loss.item())
print("F.cross_entropy(ignore_index=-100)                            = %.8f" % torch_loss.item())
print("torch.allclose(手写, 官方) =", torch.allclose(manual_loss, torch_loss))
print("绝对差 = %.3e" % abs(manual_loss.item() - torch_loss.item()))

wrong = F.cross_entropy(flat_logits, flat_labels.clamp(min=0))
print("\n若忘配 ignore_index（-100 被当成 0 号类，全部 12 位都算）= %.8f" % wrong.item())

g_ok = torch.autograd.grad(F.cross_entropy(flat_logits, flat_labels, ignore_index=-100),
                           flat_logits, retain_graph=True)[0]
g_bad = torch.autograd.grad(wrong, flat_logits)[0]
print("\n被 -100 屏蔽位置的梯度绝对值之和 = %.3e（严格为 0）" % g_ok[~keep].abs().sum().item())
print("忽略 ignore_index 时这些位置的梯度绝对值之和 = %.6f（非 0，模型在学 pad 位）"
      % g_bad[~keep].abs().sum().item())
```

输出：

```text
展平后 logits: (12, 5)  labels: [3, 1, 4, 0, -100, -100, 2, 4, -100, -100, -100, -100]
labels 中 -100 的个数: 6 / 12
真正参与 loss 的位置数: 6

手写 loss（先 log_softmax，再对有效位取负对数概率、求均值）= 1.78022969
F.cross_entropy(ignore_index=-100)                            = 1.78022957
torch.allclose(手写, 官方) = True
绝对差 = 1.192e-07

若忘配 ignore_index（-100 被当成 0 号类，全部 12 位都算）= 1.65313089

被 -100 屏蔽位置的梯度绝对值之和 = 0.000e+00（严格为 0）
忽略 ignore_index 时这些位置的梯度绝对值之和 = 0.700984（非 0，模型在学 pad 位）
```

最后两行是这个节的重点：**配了 `ignore_index`，被屏蔽位置的梯度严格为 0**；忘配，那 6 个位置的梯度绝对值之和是 0.700984——模型确实在学 pad 位。而 loss 数值本身（1.65 vs 1.78）看着差不多，训练早期很难从曲线上察觉这个错误。

## 五、梯度累积：模拟大 batch 的等价性

显存不够时用 `gradient_accumulation_steps` 把大 batch 拆成多个小 batch。这件事可以精确验证——累加 micro-batch 的梯度再除以步数，应当和真正的 batch 等价：

```python
import torch

torch.manual_seed(0)

model = torch.nn.Linear(4, 2, bias=False)
x = torch.randn(8, 4)
y = torch.randn(8, 2)

# 路线一：累积 4 个 micro-batch，每个 size=2
model.zero_grad()
micro = 2
for i in range(0, 8, micro):
    out = model(x[i:i + micro])
    loss = ((out - y[i:i + micro]) ** 2).mean() / (8 // micro)
    loss.backward()
accum = model.weight.grad.clone()

# 路线二：真正的 batch=8，一次算完
model.zero_grad()
out = model(x)
loss = ((out - y) ** 2).mean()
loss.backward()
full = model.weight.grad.clone()

print("累积路线 grad[:5] =", [round(v, 6) for v in accum.flatten()[:5].tolist()])
print("真正 batch=8 grad[:5] =", [round(v, 6) for v in full.flatten()[:5].tolist()])
print("\nallclose(累积平均, 真正 batch=8) =", torch.allclose(accum, full))
print("最大绝对误差 = %.3e" % (accum - full).abs().max().item())

# 对照：累积但不除以 micro-batch 数
model.zero_grad()
for i in range(0, 8, micro):
    out = model(x[i:i + micro])
    loss = ((out - y[i:i + micro]) ** 2).mean()
    loss.backward()
noavg = model.weight.grad.clone()
print("未除以 B 时最大绝对误差 = %.6f" % (noavg - full).abs().max().item())
print("梯度整体放大倍数 = %.3f" % (noavg.abs().max() / full.abs().max()).item())
```

结果：

```text
累积路线 grad[:5] = [0.256873, 0.232392, -0.747626, -0.922315, -0.344229]
真正 batch=8 grad[:5] = [0.256873, 0.232392, -0.747626, -0.922315, -0.344229]

allclose(累积平均, 真正 batch=8) = True
最大绝对误差 = 2.980e-08
未除以 B 时最大绝对误差 = 3.086513
梯度整体放大倍数 = 4.000
```

差一个 `/(B)`，梯度就整体放大 4 倍——等价关系完全依赖那个除法。这也是 `Trainer` 里 `gradient_accumulation_steps` 和 `per_device_train_batch_size` 必须一起看的原因：有效 batch = 单卡 batch × 卡数 × 累积步数。

## 六、这条链路上还有哪些坑

**数据泄漏。** 划分数据集时如果同一份样本的变体同时出现在训练集和验证集，验证指标会虚高。按长度分桶时尤其要注意：同一个模板生成的样本天然同桶，随机切分可能让近乎重复的样本跨到两侧。

**Tokenizer 不对齐。** 训练和推理必须用同一个 tokenizer 和同一份词表，否则 token 边界不一致，训练时模型学到的边界在推理时不存在。

**验证集太小。** `test_size=0.02` 在 Alpaca 这种量级下只有一千多条，指标波动会盖过微调带来的差异。做数据配方的对比实验时，验证集大小和划分种子要一起固定，否则不同实验之间的差异可能只是抽样噪声。

**PPL 不能替代任务指标。** 困惑度衡量的是模型对测试集的整体预测难度，SFT 之后它常常不降反升——模型学会了输出固定的回复格式，每一步的概率反而更集中。判断微调是否有效，得看任务指标和人工抽检。

## 七、这套流程不解决什么

上面五步解决的是"数据怎么变成一个能算 loss 的 batch"，但**不保证这个 batch 学出来的东西有用**。SFT 的成败更多取决于数据质量而非流水线正确性——把 prompt 段 mask 掉、保证 labels 没错位，是让训练结果"可解释"的前提，不是让它"变好"的前提。

具体说，有三件事这条链路管不了：基座模型的能力上限、训练数据的知识覆盖、以及生成时该采样什么。这三件事分别属于预训练、语料构建和推理阶段。数据流水线能做的是保证你**测出来的差异来自数据本身**，而不是来自一个 off-by-one 的监督目标。

如果想看损失函数本身的数学，以及梯度是怎么从输出回传到每一层参数的，[反向传播与 Autograd](/blog/backprop-and-autograd-explained/)那篇从链式法则讲起；SFT 相对 base model 的定位和数据质量评估，则在 [Post-Training 101 上篇](/blog/inference-engineering/inference-engineering-series-06-a-post-training/)里。

## 参考

- 课程：[《大语言模型基础：从零到一实现之路》第 10 讲](https://njudeepengine.github.io/llm-course-lecture/2025/lecture10.html) — 本文整理自「模型训练二三事」一讲
- `transformers` 源码：[`loss_utils.py` 的 `ForCausalLMLoss`](https://github.com/huggingface/transformers/blob/main/src/transformers/loss/loss_utils.py) — 内部右移的实现依据
- `datasets` 源码：[`arrow_dataset.py` 的 `train_test_split`](https://github.com/huggingface/datasets/blob/main/src/datasets/arrow_dataset.py) — `stratify_by_column` 的 `ClassLabel` 要求
- PyTorch 文档：[`torch.nn.functional.cross_entropy`](https://pytorch.org/docs/stable/generated/torch.nn.functional.cross_entropy.html) — `ignore_index` 默认值与语义
- 框架文档：[LLaMA Factory](https://github.com/hiyouga/LLaMA-Factory) — 数据格式与 yaml 配置的落地方式
