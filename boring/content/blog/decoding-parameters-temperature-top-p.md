---
title: "解码参数手册：温度、Top-k、Top-p 与惩罚项"
date: 2026-11-10
update_date: 2026-11-10
description: "temperature、top-k、top-p、penalty 这几个参数到底各自改了什么、彼此怎么耦合、HF 源码里按什么顺序执行。这篇用可复跑的代码说明：温度是连续旋钮，top-k 按个数截断、top-p 按累积概率截断，惩罚项分软硬两类，顺序错了结论就错。"
tldr: "temperature 改分布的「尖锐度」，top-k 和 top-p 改候选集的「大小」，penalty 改已经出现过的词的「待遇」。三组参数各管一件事，先固定一组再调下一组，否则你分不清是哪一步起了作用。"
keywords: ["temperature 温度参数", "top-p 核采样", "top-k 采样", "repetition penalty 重复惩罚", "解码策略 decoding strategy", "Hugging Face logits processor"]
taxonomies:
  tags: ["LLM原理", "推理优化", "解码策略"]
---

# 解码参数手册：温度、Top-k、Top-p 与惩罚项

LLM 一次前向输出的不是文本，是一组 logits——每个词表 token 一个未归一化的分数。从 logits 到最终 token，中间还有一步「解码策略」，而 `temperature`、`top_p`、`top_k`、`repetition_penalty` 这些参数全都作用在这一步上。

问题在于，它们的名字看起来像同一类东西（都是「调随机性」），实际管的是三件不同的事。混着调，就永远说不清输出变化是哪个参数造成的。

本文整理自南京大学《大语言模型基础：从零到一实现之路》第 11 讲（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture11.html)。文中的代码在 CPU 版 PyTorch 2.8.0 下逐行跑过；Hugging Face 的实现细节取自当前 `transformers` 源码，已在文末标注文件与类名。

如果你还没建立「一次推理要分 prefill 和 decode 两个阶段」的直觉，先看 [为什么 ChatGPT 第一个字永远慢（中）：KV Cache 修复方案 + TTFT 的真相](/blog/inference-engineering/inference-engineering-series-02-b-kvcache/)；想了解提示词侧怎么和这些参数配合，看 [Prompt Engineering 从入门到精通](/blog/prompt-engineering-from-entry-to-master/)。

## 一、三种解码策略：贪心、采样、Beam Search

**贪婪解码（greedy decoding）**每步直接选概率最高的 token。简单、快、可复现，但只看当前步——不保证整体序列概率最高。开头选错一个词，后面就没有回头的机会。

**采样（sampling）**按概率分布随机抽一个 token。多样性来自这里，但也可能因此不连贯。

**Beam Search** 维护 `k` 条候选序列，每步从每条候选各扩展出 top-k 个 token，按累计序列概率保留最高的 `k` 条。它比贪心更接近全局最优，但代价是要同时维护 `k` 条路径——在 LLM 生成这种长序列场景里，`k` 的取值直接乘上了计算量和显存。

有个容易忽略的点：**贪婪解码本质上是 top-k 采样在 `k = 1` 时的特例**。理解了这一点，top-k 就不是一个独立的「算法」，而是采样策略家族里的一个参数。

## 二、Temperature：连续旋钮，只改尖锐度

temperature 的数学形式很简单：

```text
p̃_i = softmax(z_i / T),   T > 0
```

`z` 是 logits，`T` 是温度。`T < 1` 放大 logits 之间的差异，分布更尖锐；`T > 1` 压平差异，分布更均匀。

关键性质是：**temperature 不改变 token 的排序，只改变间距**。同一个 `u`（采样随机数）在不同 `T` 下可能落到不同 token，正是因为累积概率曲线被压平了。

下面这段用固定随机数做可复核的采样：

```python
import torch

torch.manual_seed(0)
logits = torch.tensor([2.0, 1.0, 0.5, 0.0, -0.5])   # 同一组 logits，只改 temperature


def softmax(z):
    e = torch.exp(z - z.max())
    return e / e.sum()


def sample(p, u):
    """固定随机数 u 的逆 CDF 采样：结果确定可复核，且能稳定展示「同一 u 落在不同 token」"""
    return int((p.cumsum(0) < u).sum())


print("logits =", logits.tolist(), " vocab0..vocab4")
u = 0.45
print(f"固定采样随机数 u = {u}\n")
print(f"{'T':>5} " + " ".join(f"p(v{i})".rjust(8) for i in range(5)) + f"{'采样 token':>12}")
for T in (0.5, 1.0, 2.0):
    p = softmax(logits / T)
    row = " ".join(f"{v:>8.4f}" for v in p.tolist())
    print(f"{T:>5} {row}{sample(p, u):>12}")

print()
for T in (0.5, 1.0, 2.0):
    p = softmax(logits / T)
    print(f"T={T}: 最大概率 {p.max():.4f}，最小概率 {p.min():.4f}，分布熵 {( -(p * p.log()).sum()):.4f} nats")
print("熵的上限 ln(5) =", round(float(torch.tensor(5.0).log()), 4))
```

实测输出：

```text
logits = [2.0, 1.0, 0.5, 0.0, -0.5]  vocab0..vocab4
固定采样随机数 u = 0.45

    T    p(v0)    p(v1)    p(v2)    p(v3)    p(v4)    采样 token
  0.5   0.8263   0.1118   0.0411   0.0151   0.0056           0
  1.0   0.5530   0.2034   0.1234   0.0748   0.0454           0
  2.0   0.3659   0.2219   0.1728   0.1346   0.1048           1

T=0.5: 最大概率 0.8263，最小概率 0.0056，分布熵 0.6262 nats
T=1.0: 最大概率 0.5530，最小概率 0.0454，分布熵 1.2441 nats
T=2.0: 最大概率 0.3659，最小概率 0.1048，分布熵 1.5117 nats
熵的上限 ln(5) = 1.6094
```

最低概率从 `0.0056` 一路抬到 `0.1048`，熵从 0.63 单调升到 1.51 nats（均匀分布的上限是 `ln 5 = 1.609`）。同一个 `u = 0.45`，`T = 0.5` 和 `T = 1.0` 都落在 token 0，`T = 2.0` 落到 token 1——这就是高温更「跳脱」的直观来源。

两个极限：`T → 0` 时 `p(v₀) → 1`，分布退化成 one-hot，与贪婪解码等价；`T → ∞` 时趋于均匀分布，输出退化为噪声。

实践区间：0.1–0.5 用于摘要、抽取、代码这类需要确定性的任务；0.7–1.3 用于创作和头脑风暴。

**但 temperature 不是孤立的**。它压平分布会让 top-p 的 nucleus 变短，也会让 top-k 相对变得「无效」（因为尾部概率被抬高了）。所以 temperature 和 top-k/top-p 必须先固定一个再调另一个。

## 三、Top-k 与 Top-p：截断位置的两条路

**top-k** 从概率最高的 `k` 个 token 里采样——按**个数**截断。

**top-p（nucleus sampling）**来自论文 *The Curious Case of Neural Text Degeneration*：选一个集合 `V^(p)`，使集合内的累积概率 `≥ p`，只在这个集合里采样——按**累积概率**截断。

这就是两者的全部区别，也带来了实际差异：top-k 是固定数量的候选，分布尖锐时可能留下大量垃圾候选，分布平坦时又可能把不该要的词排除在外；top-p 的候选集大小随分布自适应，尖锐时自动变短，平坦时自动变长。

同一份分布，两种截断方式的差别：

```python
import torch

# 讲义里的例子：输入「南京大学计算机学院的课程有」
names = ["算法", "操作系统", "计算机", "数据", "网络", "数学"]
p = torch.tensor([0.40, 0.30, 0.20, 0.06, 0.03, 0.01])


def show(tag, q, idx):
    print(f"  {tag}")
    print(f"    候选集合  = {[names[i] for i in idx.tolist()]}"
          f"  (保留 {len(idx)}/{len(p)} = {len(idx) / len(p):.0%})")
    kept = " ".join(f"{names[i]}:{q[i]:.4f}" for i in idx.tolist())
    print(f"    归一化后  = {kept}")
    print(f"    被丢弃的  = {[names[i] for i in range(len(p)) if i not in idx.tolist()]}")


def top_k_filter(p, k):
    idx = torch.topk(p, k).indices.sort().values      # 按个数截断，再恢复原始顺序
    q = torch.zeros_like(p)
    q[idx] = p[idx]
    return q / q.sum(), idx


def top_p_filter(p, thresh):
    order = p.argsort(descending=True)               # 按概率降序
    n = int((p[order].cumsum(0) < thresh).sum()) + 1 # 累积概率首次 >= thresh 的长度，至少 1
    idx = order[:n].sort().values
    q = torch.zeros_like(p)
    q[idx] = p[idx]
    return q / q.sum(), idx


print(f"原始分布: " + "  ".join(f"{n}:{v:.2f}" for n, v in zip(names, p.tolist())))
print(f"贪心解码 (top-k, k=1) -> {names[int(p.argmax())]}\n")

print("top-k 采样, k=3:")
show("按个数截断", *top_k_filter(p, 3))
print()
print("top-p 采样 (nucleus), p=0.65:")
show("按累积概率截断", *top_p_filter(p, 0.65))
print()
print("HF 的顺序：先 top-k 再 top-p")
q1, i1 = top_k_filter(p, 4)
q2, i2 = top_p_filter(q1, 0.65)
show("top-k=4 -> top-p=0.65", q2, i2)

# 固定随机数采样，保证可复核
print()
for tag, q, idx in [("top-k=3", *top_k_filter(p, 3)), ("top-p=0.65", *top_p_filter(p, 0.65))]:
    u = 0.5
    tok = idx[int((q[idx].cumsum(0) < u).sum())]
    print(f"固定 u={u}：{tag} -> {names[tok]}")
```

实测输出：

```text
原始分布: 算法:0.40  操作系统:0.30  计算机:0.20  数据:0.06  网络:0.03  数学:0.01
贪心解码 (top-k, k=1) -> 算法

top-k 采样, k=3:
  按个数截断
    候选集合  = ['算法', '操作系统', '计算机']  (保留 3/6 = 50%)
    归一化后  = 算法:0.4444 操作系统:0.3333 计算机:0.2222
    被丢弃的  = ['数据', '网络', '数学']

top-p 采样 (nucleus), p=0.65:
  按累积概率截断
    候选集合  = ['算法', '操作系统']  (保留 2/6 = 33%)
    归一化后  = 算法:0.5714 操作系统:0.4286
    被丢弃的  = ['计算机', '数据', '网络', '数学']

HF 的顺序：先 top-k 再 top-p
  top-k=4 -> top-p=0.65
    候选集合  = ['算法', '操作系统']  (保留 2/6 = 33%)
    归一化后  = 算法:0.5714 操作系统:0.4286
    被丢弃的  = ['计算机', '数据', '网络', '数学']

固定 u=0.5：top-k=3 -> 操作系统
固定 u=0.5：top-p=0.65 -> 算法
```

三个要点：

**top-p 是自适应的**。同一份分布，top-k=3 保留 50% 候选，top-p=0.65 只保留 33%。分布尖锐时 nucleus 自动变短，平坦时自动变长——这是 top-p 更鲁棒的原因。

**截断后必须重新归一化**。top-k=3 下 `0.40 → 0.4444`，top-p=0.65 下 `0.40 → 0.5714`。不归一化的话采样总概率不足 1，生成会「卡住」或需要多次重采样。

**截断直接改变采样结果**。固定 `u = 0.5` 落到不同 token（`操作系统` vs `算法`）——截断策略是语义质量的第一道闸门。

## 四、Penalty：给「已经出现过」的 token 单独定价

只靠 temperature/top-k/top-p 仍然会出现短循环、口头禅、提示词泄露这类模式崩溃。Penalty 机制通过修改 logits 或打分，给「已经出现过」的 token 加一道额外约束。

按约束强度分两类：

**软惩罚**——改分数，不禁止。

`repetition_penalty`（Hugging Face 风格）是个乘法因子。当前 `transformers` 的 `RepetitionPenaltyLogitsProcessor` 核心就一行：

```python
import torch

PENALTY = 1.2
scores = torch.tensor([3.0, -2.0, 0.5, -0.5])
penalty_scores = torch.where(scores < 0, scores * PENALTY, scores / PENALTY)

print("原始 logits      =", [round(v, 4) for v in scores.tolist()])
print("惩罚后 logits    =", [round(v, 4) for v in penalty_scores.tolist()])
print("正分数被除，负分数被乘 —— 两者都往 0 的方向拉")
```

实测输出：

```text
原始 logits      = [3.0, -2.0, 0.5, -0.5]
惩罚后 logits    = [2.5, -2.4, 0.4167, -0.6]
正分数被除，负分数被乘 —— 两者都往 0 的方向拉
```

注意它对正负 logits 做了区分：正分数除以 penalty，负分数乘以 penalty——两种情况都是「往 0 的方向拉」，所以相对排序不会被整体翻转。`penalty = 1.0` 表示不惩罚，大于 1 抑制重复，小于 1 反而鼓励重复。原始论文建议用 1.2 左右取得「真实性」与「不重复」的平衡。

`presence_penalty` / `frequency_penalty`（OpenAI 风格）是加法惩罚，两者的区别在于计分依据：

- **presence**：只看「这个 token 出现过没有」，出现过就扣一次固定值；
- **frequency**：看「这个 token 出现了多少次」，出现越多扣得越多。

vLLM 的 `sampling_params.py` 里对这两个参数的描述是：`presence_penalty` 按 token「是否出现在已生成文本中」惩罚，`frequency_penalty` 按「出现频次」惩罚，**两者取值大于 0 都是鼓励模型使用新 token，小于 0 则鼓励重复**。

**硬约束**——直接禁止。

`no_repeat_ngram_size = n` 表示不允许重复出现长度为 n 的 n-gram。这类约束不依赖概率高低，是二值禁止。

还有 beam search 专用的 `length_penalty`，用 `(5+|y|)^α / (5+1)^α` 这个归一化项调整对长序列的偏好——注意它只影响 beam search 的候选排序，采样路径里没有对应物。

## 五、执行顺序：源码里是怎么排的

顺序错了，结论就错。当前 `transformers` 的 `generation/utils.py` 里，`_get_logits_processor` 按下面的顺序追加处理器（去重后的相对次序）：

```text
 1. UnbatchedClassifierFreeGuidanceLogitsProcessor
 2. SequenceBiasLogitsProcessor
 3. EncoderRepetitionPenaltyLogitsProcessor
 4. RepetitionPenaltyLogitsProcessor
 5. NoRepeatNGramLogitsProcessor
 6. EncoderNoRepeatNGramLogitsProcessor
 7. NoBadWordsLogitsProcessor
 8. MinLengthLogitsProcessor
 9. MinNewTokensLengthLogitsProcessor
10. PrefixConstrainedLogitsProcessor
11. ForcedBOSTokenLogitsProcessor
12. ForcedEOSTokenLogitsProcessor
13. InfNanRemoveLogitsProcessor
14. ExponentialDecayLengthPenalty
15. SuppressTokensLogitsProcessor
16. SuppressTokensAtBeginLogitsProcessor
17. TemperatureLogitsWarper          <- 温度
18. TopHLogitsWarper
19. TopKLogitsWarper                 <- top-k
20. TopPLogitsWarper                 <- top-p
21. MinPLogitsWarper
22. TypicalLogitsWarper
23. EpsilonLogitsWarper
24. EtaLogitsWarper
```

三点值得注意：

**惩罚在前，截断在后。** repetition penalty 在第 4 位，top-k/top-p 在第 19、20 位。也就是说惩罚先改 logits，截断再看改完之后的分布。

**temperature 在所有截断之前。** 温度先作用，top-k/top-p 才按温度调整后的分布去截断。源码里 `MinPLogitsWarper` 上面那行注释写得很直白：`# Applied after temperature scaling`。

**top-k 在 top-p 之前。** 也就是「先砍个数保证候选集不会爆炸，再按概率收口」。上面那个例子里，top-k=4 先砍掉两个 0.0x 的尾巴，top-p 再收口到两个——这个组合等价于直接跑 top-p，但多了一层「候选数上限」的保险。

顺带一提，`transformers` 当前还提供 `min_p`（`MinPLogitsWarper`）和 `typical_p`、`epsilon_cutoff` 等更细的截断方式。`min_p` 的逻辑是按 top token 概率的比例动态定阈值：`scaled_min_p = min_p * top_probs`，然后删掉概率低于这个值的 token——它比 top-p 更强调「相对于最优 token 有多大概率才算候选」。

## 六、调参顺序与各场景起点

推荐顺序：**temperature → top-k/p → penalty → 其他限制（stop words、max_tokens）**。理由是前一组决定分布的基本形状，后一组是在这个形状上做修正；如果先调惩罚，再改温度，前面调好的惩罚强度很可能就不合适了。

各场景的常见起点：

| 场景 | 建议起点 |
|------|----------|
| 问答 / 代码 | `temperature` 0.1–0.3；`repetition_penalty` 1.05 或 `frequency_penalty` 0.5 |
| 创作 / 诗歌 | `temperature` 0.7–1.3；降低重复惩罚，用 `presence_penalty` 0.3 保主题多样 |
| 长对话 | `no_repeat_ngram` 设 3–4，再酌增 `repetition_penalty` |
| Beam search 翻译 | `length_penalty` 在 0.6–1.0 之间调句长 |

## 七、边界：这些参数管不了什么

**参数改不了模型知道什么。** temperature 和 top-p 只重新分配概率，不注入任何新知识。一个模型幻觉的事实，把 temperature 调到 0 也还是幻觉。

**temperature 不是「创造力开关」那么简单。** 它同时影响多样性和一致性——诗歌需要前者，代码需要后者，没有一个温度能同时满足。

**penalty 有副作用。** 抑制重复的同时会抑制必要的复述：要求模型重复某段原文时，惩罚会主动跟它作对。

**不同框架的参数语义并不完全一致。** HF 的 repetition penalty 是乘 logits，OpenAI 风格的 frequency penalty 是加 logits，两者对同一段文本的效果不同，数值不能直接换算。

**温度也不是唯一的「随机性来源」。** 采样本身有随机性（固定 seed 才可复现），beam search 有搜索带来的变数，batch 内不同请求的浮点累加顺序也可能带来微小差异。

## 八、FAQ

**Q：temperature = 0 和 top-k = 1 是一回事吗？**
A：接近但不完全等价。`top-k = 1` 是截断后只剩概率最高的 token，等价于贪婪解码；`temperature = 0` 在数学上会让 `z/T` 发散，实现上通常被当作「温度趋近 0」，各框架的处理方式不同（有的直接短路到贪心）。要确定性输出，用 `do_sample=False` 更明确。

**Q：top-k 和 top-p 该选哪个？**
A：一般优先 top-p，它对分布形状自适应。top-k 仍有价值——它给候选数设了硬上限，在需要严格控制计算量或者想保留固定宽度的候选池时用。

**Q：为什么 temperature 和 top-p 会互相干扰？**
A：因为 top-p 是按累积概率切 nucleus 的。temperature 压平分布后，累积概率增长变慢，nucleus 自然变短——你以为自己调的是温度，实际同时改小了候选集。所以调参时一次只动一个。

**Q：presence_penalty 和 frequency_penalty 该用哪个？**
A：想「这个话题别再提了」用 presence（出现过就扣）；想「这个词别刷屏」用 frequency（出现越多扣越多）。要抑制整体重复，HF 的 repetition_penalty 更通用，因为它对 prompt 里出现过的词也生效（可用 `prompt_ignore_length` 排除）。

**Q：这些参数在服务端和本地跑有区别吗？**
A：参数语义一样，但服务端通常还会叠加别的东西——批处理导致的浮点累加顺序差异、系统提示词的注入位置、以及 `seed` 是否被支持。同一组参数在服务端跑出不同结果，不一定是参数问题。

## 参考资料

- *The Curious Case of Neural Text Degeneration*（Holtzman et al., [arXiv:1904.09751](https://arxiv.org/abs/1904.09751)）——top-p（nucleus）采样原始论文
- Hugging Face `transformers` 源码：[`generation/logits_process.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/generation/logits_process.py)（`TemperatureLogitsWarper` / `TopKLogitsWarper` / `TopPLogitsWarper` / `MinPLogitsWarper` / `RepetitionPenaltyLogitsProcessor`）与 [`generation/utils.py`](https://github.com/huggingface/transformers/blob/main/src/transformers/generation/utils.py)（`_get_logits_processor` 的追加顺序）
- vLLM [`sampling_params.py`](https://github.com/vllm-project/vllm/blob/main/vllm/sampling_params.py)——`presence_penalty` / `frequency_penalty` / `repetition_penalty` 的语义说明
- 讲义来源：南京大学《大语言模型基础》第 11 讲，[幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture11.html)
