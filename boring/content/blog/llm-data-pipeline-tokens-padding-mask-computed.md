---
title: "数据管线的三笔账：token、padding 与 mask"
date: "2026-11-27"
description: "从《大语言模型基础》第 9 讲「LLM 解析 VI」的讲义笔记里取 tokenizer、批处理与 attention_mask 的机制，补三个可跑的模型：中英文的 token 账单、padding 的浪费与排序的收益、不加 mask 时真实输出被缩小的幅度。"
tldr: "上下文预算是按 token 算的：中文 token/字符 = 1.000、英文 0.186，同样 32,768 窗口中文能装 32,768 字符、英文 176,443（5.4 倍），token 账单也是 5.4 倍。padding 浪费：静态补到 max_length 浪费 83.2%，动态补到批内最长 74.5%，全局按长度排序后组 batch 只剩 2.1%——但排序收益与 batch 大小反向（batch=512 时回升到 18.1%）。attention_mask 不是让 pad 输出 0，而是保护真实位置：pad 抢走 32.3% 的注意力权重，真实 token 的输出被整体缩小 32.3%。"
keywords: ["tokenizer", "padding", "attention_mask", "批处理", "数据管线"]
taxonomies:
  tags: ["LLM工程", "数据管线", "技术深度", "课程笔记"]
---

LLM 数据管线的三笔账？token 账单、padding 浪费、mask 污染。课程讲义把「怎么让 LLM 动起来」讲到了数据与代码这一层：人类视角的数据集是文本、LLM 视角是 token 序列，中间靠 tokenizer；批处理必然遇到变长，于是有 padding、truncation 和 attention_mask。这三笔账讲义是定性的，这篇把它们算出来。

## 口径说明

- 源是本地课程材料《大语言模型基础》第 9 讲「LLM 解析 VI：数据模型、运行与代码」的讲义笔记（32,067 字）。课程材料按**导读式**处理：**只复述章节骨架与机制，不引用讲义原文、不搬代码**，正文主体是**自写可复现模型**。
- 三个脚本只依赖 Python 标准库（不含 numpy、不含 torch）；输出为实跑结果，逐行可复现（无随机数，两次运行输出逐字一致）。
- 讲义里给出的机制（tokenizer 三种 API 的分工、`decode` 反向出文本、padding 与 `attention_mask` 的配套关系、HF datasets 的 `map(batched=True)`、`Parameter()` 自动注册、`nn.Linear` 权重形状 `(out, in)`、state_dict 的存取、safetensors 之于 pickle、PEFT 注入 `lora_A`/`lora_B`）直接标注来源；**我为了建模补的**（窗口大小、输入单价、长度分布参数、pad 的 key/value 构造）都标为「估」。
- **撞题与边界**：已发《[微调与适配](/blog/finetune-lora-rlhf-dpo-costs-computed/)》讲 LoRA 的秩与合并数学，《[从 FLOPS 到美元](/blog/llm-inference-cost-deep-dive/)》讲推理侧的算力与账单，《[上下文工程](/blog/context-engineering-instruction-and-material/)》讲上下文里放什么。**那三篇讲「模型侧」，本文讲「进模型之前的数据管线」**：token 怎么计费、padding 浪费多少算力、mask 不加会错到什么程度。LoRA 与推理算力不重复。

## 一、讲义的骨架：让 LLM 动起来要过哪几关

**视角切换**：人类视角的数据集是文本，LLM 视角的数据集是 token 序列，转换工具是 tokenizer。三个 API 分工明确——`tokenizer(x)` 出字典、`tokenize(x)` 出子词、`encode(x)` 出 id，`decode` 反向出文本。

**批处理的必然问题**：变长序列不能直接 `stack`，必须补齐；于是出现三件套——`padding=True` / `padding="max_length"` 补齐、`attention_mask` 标记哪些是真实 token、`truncation=True` 截断超长。讲义的演示直接把形状变化和 mask 的生成打印出来：三条长度 3/4/2 的序列补齐成 `(3, 4)`，mask 里 1 的个数正好等于真实 token 总数。

**数据与模型的装载**：HF datasets 的套路是 `load_dataset` 拿数据集字典，写 `tokenize_function` 交给 `ds.map(batched=True)` 批量预处理；模型侧 `Parameter()` 会自动注册进 `model.parameters()`，`nn.Linear` 的 weight 形状是 `(out_features, in_features)`，存取靠 `state_dict`；safetensors 之于 pickle 是「安全 + zero-copy」，HF 的 `from_pretrained`/`save_pretrained` 是其上封装；LoRA 不是独立模型，而是 PEFT 先加载 base model、再注入 `lora_A`/`lora_B` 低秩分支。

## 二、增量一：token 账单按语言差 5 倍

讲义说 tokenizer 是「转换工具」，但转换成本本身有量级差：

```python
"""上下文预算是按 token 算的 -> 中文与英文的「字数预算」差几倍。

自写模型：一个极简 tokenizer（中文按字、英文数字按词），与讲义演示 1 同一思路。
只依赖标准库；输出确定性。
"""
import re

WINDOW = 32768


def tokenize(text):
    """极简 tokenizer：CJK 按字、拉丁按词、数字按词、标点单独成 token"""
    toks = []
    for chunk in re.findall(r"[A-Za-z]+|[0-9]+|[一-鿿]|[^\sA-Za-z0-9一-鿿]", text):
        toks.append(chunk)
    return toks


ZH = ("检索增强生成把外部知识注入大模型的上下文，但外部知识的质量取决于切分与索引，"
      "而索引的新鲜度又取决于重建策略，这三层任何一层偷懒都会让答案变差。")
EN = ("Retrieval augmented generation injects external knowledge into the model context, "
      "but the quality of that knowledge depends on chunking and indexing, while index "
      "freshness depends on the rebuild strategy; any layer cut corners degrades answers.")

zh_toks = tokenize(ZH)
en_toks = tokenize(EN)
zh_chars = len([c for c in ZH if not c.isspace()])
en_chars = len([c for c in EN if not c.isspace()])

print("一、同一份内容，中英文的 token 数差在哪")
print("%-10s %12s %12s %14s %16s" % ("语言", "字符数", "token 数", "token/字符", "同窗口可装字符"))
for name, text, toks in (("中文", ZH, zh_toks), ("英文", EN, en_toks)):
    chars = len([c for c in text if not c.isspace()])
    print("%-10s %12d %12d %13.3f %15s" % (name, chars, len(toks), len(toks) / chars,
                                            format(int(WINDOW * chars / len(toks)), ",")))
print()
print("   => 中文 token/字符 = %.3f，英文 = %.3f —— **同窗口下英文能装的字符数是中文的 %.1f 倍**。" % (
    len(zh_toks) / zh_chars, len(en_toks) / en_chars,
    (WINDOW * en_chars / len(en_toks)) / (WINDOW * zh_chars / len(zh_toks))))
print()
print("二、这会变成多少钱")
PRICE_IN = 0.5      # 每百万输入 token（美元，估）
for name, text, toks in (("中文", ZH, zh_toks), ("英文", EN, en_toks)):
    chars = len([c for c in text if not c.isspace()])
    # 同样 100 万字符的语料，token 数差多少
    tokens_for_1m = 1_000_000 * len(toks) / chars
    cost = tokens_for_1m / 1_000_000 * PRICE_IN
    print("   %s：100 万字符 -> %s token -> 一次全量过一遍 $%.2f" % (
        name, format(int(tokens_for_1m), ","), cost))
print()
print("   => 同样的字符数，中文的 token 账单是英文的 %.1f 倍。" % (
    (len(zh_toks) / zh_chars) / (len(en_toks) / en_chars)))
print()
print("三、同样内容的文档，占窗口的比例差多少（假设文档各 3,000 字符）")
DOC_CHARS = 3000
for name, text, toks in (("中文", ZH, zh_toks), ("英文", EN, en_toks)):
    chars = len([c for c in text if not c.isspace()])
    per_char = len(toks) / chars
    doc_tokens = DOC_CHARS * per_char
    print("   %s：一篇 %s 字符的文档 -> %s token -> 占 32,768 窗口的 %5.1f%% -> 窗口能塞 %d 篇" % (
        name, format(DOC_CHARS, ","), format(int(doc_tokens), ","),
        100.0 * doc_tokens / WINDOW, int(WINDOW / doc_tokens)))
print()
print("判据：")
print("  - **上下文预算是按 token 算的，所以中文的「字数预算」只有英文的 1/%.1f**。" % (
    (len(zh_toks) / zh_chars) / (len(en_toks) / en_chars)))
print("    同样 32,768 的窗口，中文能装 %s 字符、英文能装 %s 字符；" % (
    format(int(WINDOW * zh_chars / len(zh_toks)), ","),
    format(int(WINDOW * en_chars / len(en_toks)), ",")))
print("    换成「能塞几篇 3,000 字符的文档」：中文 %d 篇、英文 %d 篇。" % (
    int(WINDOW / (DOC_CHARS * len(zh_toks) / zh_chars)),
    int(WINDOW / (DOC_CHARS * len(en_toks) / en_chars))))
print("  - **同一批语料，中文的 token 账单是英文的 %.1f 倍** -> 中文场景的检索、压缩、上下文" % (
    (len(zh_toks) / zh_chars) / (len(en_toks) / en_chars)))
print("    管理都要按更紧的预算算；这是「中文 RAG 更容易触发截断」的算术来源。")
print("  - 前提：**分词器不同，比例会变**。本模型用的是讲义演示 1 的极简口径（中文按字）；")
print("    真实模型的中文词表能合并常见词，token/字符通常低于 1 —— 但**结论方向不变**。")
```

输出：

```text
一、同一份内容，中英文的 token 数差在哪
语言                  字符数      token 数       token/字符          同窗口可装字符
中文                   71           71         1.000          32,768
英文                  210           39         0.186         176,443

   => 中文 token/字符 = 1.000，英文 = 0.186 —— **同窗口下英文能装的字符数是中文的 5.4 倍**。

二、这会变成多少钱
   中文：100 万字符 -> 1,000,000 token -> 一次全量过一遍 $0.50
   英文：100 万字符 -> 185,714 token -> 一次全量过一遍 $0.09

   => 同样的字符数，中文的 token 账单是英文的 5.4 倍。

三、同样内容的文档，占窗口的比例差多少（假设文档各 3,000 字符）
   中文：一篇 3,000 字符的文档 -> 3,000 token -> 占 32,768 窗口的   9.2% -> 窗口能塞 10 篇
   英文：一篇 3,000 字符的文档 -> 557 token -> 占 32,768 窗口的   1.7% -> 窗口能塞 58 篇

判据：
  - **上下文预算是按 token 算的，所以中文的「字数预算」只有英文的 1/5.4**。
    同样 32,768 的窗口，中文能装 32,768 字符、英文能装 176,443 字符；
    换成「能塞几篇 3,000 字符的文档」：中文 10 篇、英文 58 篇。
  - **同一批语料，中文的 token 账单是英文的 5.4 倍** -> 中文场景的检索、压缩、上下文
    管理都要按更紧的预算算；这是「中文 RAG 更容易触发截断」的算术来源。
  - 前提：**分词器不同，比例会变**。本模型用的是讲义演示 1 的极简口径（中文按字）；
    真实模型的中文词表能合并常见词，token/字符通常低于 1 —— 但**结论方向不变**。
```

三处结论：

**第一，同样窗口，中文的字数预算只有英文的 1/5.4。** 极简口径下（中文按字、英文按词）：中文 token/字符 = **1.000**、英文 = **0.186**。同样 32,768 的窗口，中文能装 **32,768 字符**、英文能装 **176,443 字符**；换成「能塞几篇 3,000 字符的文档」：中文 **10 篇**、英文 **58 篇**。

**第二，账单按同样比例放大。** 100 万字符：中文 100 万 token、英文 18.6 万 token——**中文的 token 账单是英文的 5.4 倍**（本模型按每百万输入 token $0.5 估：$0.50 vs $0.09）。**判据：中文场景的检索、压缩、上下文管理都要按更紧的预算算**——这是「中文 RAG 更容易触发截断与压缩」的算术来源，也解释了为什么中文的 chunk 大小、top-k 都要比英文场景调得更保守。

**第三，结论的方向稳，倍数不稳。** 真实模型的中文词表能合并常见词，token/字符通常低于 1（讲义演示 1 的极简口径是「中文按字」），所以 **5.4 倍这个数不可直接引用**；但「中文单位字符的 token 成本更高」这个方向不变。**判据：先用自己的语料量一遍 token/字符比，再定预算。**

## 三、增量二：padding 的浪费，以及排序为什么能救

讲义演示了「补齐后才有规整矩阵」，但没算浪费多少：

```python
"""padding 的浪费：静态补齐 vs 动态补齐 vs 按长度分桶。

自写模型：长度分布用对数正态近似（估）。只依赖标准库；输出确定性。
"""
import math

BATCH = 32
SEQ_CAP = 512          # 序列上限（token）
LENGTH_MEDIAN = 64     # 长度中位数（估）
LENGTH_SIGMA = 0.8     # 对数正态的 sigma（估）


def sample_len(rng):
    return min(SEQ_CAP, max(4, int(LENGTH_MEDIAN * math.exp(rng.gauss(0, LENGTH_SIGMA)))))


class LCG:
    """确定性伪随机，保证两次运行输出一致"""
    def __init__(self, seed=12345):
        self.s = seed

    def gauss(self, mu=0.0, sigma=1.0):
        import math
        u1 = max(1e-12, (self.s % 2147483647) / 2147483647)
        self.s = (1103515245 * self.s + 12345) % 2147483648
        u2 = (self.s % 2147483647) / 2147483647
        z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
        return mu + sigma * z


rng = LCG()
samples = [sample_len(rng) for _ in range(4096)]

print("一、长度分布（%d 条样本）" % len(samples))
samples_sorted = sorted(samples)
for q in (0.5, 0.9, 0.99, 1.0):
    print("   P%-4s = %4d token" % ("%.2f" % q, samples_sorted[min(len(samples) - 1, int(q * len(samples)))]))
print()

def batch_stats(groups):
    """返回 (有效 token 占比, 平均每 batch 补齐后的 token 数)"""
    eff = sum(sum(b) for b in groups) / sum(len(b) for b in groups)
    padded = sum(max(b) * len(b) for b in groups) / len(groups)
    return eff / (padded / max(1, sum(len(b) for b in groups) / len(groups))), padded


def make_groups(seqs, bs, sort_globally=False):
    s = sorted(seqs) if sort_globally else list(seqs)
    return [s[i:i + bs] for i in range(0, len(s), bs)]


print("二、三种 padding 策略的浪费")
print("   （静态 = 全部补到 max_length；动态 = 补到批内最长；排序/分桶 = 全局按长度排序后（或切 16 桶）再组 batch）")
print("%-24s %18s %16s %16s" % ("策略", "有效 token 占比", "padding 占比", "算力相对"))
def quantile_buckets(seqs, k, bs):
    """按长度分位切成 k 个桶，桶内再按 bs 组 batch"""
    s = sorted(seqs)
    out = []
    per = len(s) // k
    for i in range(k):
        chunk = s[i * per:(i + 1) * per] if i < k - 1 else s[i * per:]
        for j in range(0, len(chunk), bs):
            b = chunk[j:j + bs]
            if b:
                out.append(b)
    return out


strategies = []
for name, sorted_globally, static in (("静态补到 max_length", False, True),
                                       ("动态补到批内最长", False, False),
                                       ("全局按长度排序/分桶后组 batch", None, False)):
    if static:
        eff = sum(samples) / len(samples) / SEQ_CAP
        padded = SEQ_CAP
    elif sorted_globally is None:
        groups = quantile_buckets(samples, 16, BATCH)
        eff = sum(sum(b) for b in groups) / sum(max(b) * len(b) for b in groups)
        padded = sum(max(b) * len(b) for b in groups) / len(groups)
    else:
        groups = make_groups(samples, BATCH, sorted_globally)
        total_pad_tokens = sum(max(b) * len(b) for b in groups)
        total_eff = sum(sum(b) for b in groups)
        eff = total_eff / total_pad_tokens
        padded = total_pad_tokens / len(groups)
    waste = 1 - eff
    strategies.append((name, eff, waste))
    print("%-24s %17.1f%% %15.1f%% %15.2fx" % (name, eff * 100, waste * 100, 1 / eff))
print()
print("三、浪费随 batch 大小怎么变（分桶始终最低）")
print("%-10s %14s %14s %14s %18s" % ("batch", "静态浪费", "动态浪费", "分桶浪费", "动态/分桶倍数"))
trend = []
for bs in (8, 32, 128, 512):
    groups_d = make_groups(samples, bs, False)
    groups_b = quantile_buckets(samples, 16, bs)
    eff_d = sum(sum(b) for b in groups_d) / sum(max(b) * len(b) for b in groups_d)
    eff_b = sum(sum(b) for b in groups_b) / sum(max(b) * len(b) for b in groups_b)
    static_eff = sum(samples) / len(samples) / SEQ_CAP
    trend.append((bs, 1 - static_eff, 1 - eff_d, 1 - eff_b))
    print("%-10d %13.1f%% %13.1f%% %13.1f%% %17.2fx" % (
        bs, (1 - static_eff) * 100, (1 - eff_d) * 100, (1 - eff_b) * 100,
        (1 - eff_b) / (1 - eff_d) if eff_d else 0))
print()
print("判据：")
print("  - **静态 padding 的浪费由长尾决定**：补到 max_length=%d 时浪费 %.1f%%。" % (
    SEQ_CAP, strategies[0][2] * 100))
print("  - **动态 padding 随 batch 变大而变差**：batch=8 时浪费 %.1f%%，batch=512 时 %.1f%% ——" % (
    trend[0][2] * 100, trend[-1][2] * 100))
print("    每批的最长样本被摊到更多短样本上，所以「一个大 batch 塞满」是最亏的用法。")
print("  - **全局按长度排序后组 batch，把浪费压到 %.1f%%**（batch=32），动态是 %.1f%% ->" % (
    trend[1][3] * 100, trend[1][2] * 100))
print("    机制很简单：排序后**同一个 batch 里的样本长度本来就接近**，补齐到批内最长几乎不浪费。")
print("    （这也说明「分桶」不是另一个方案 —— 全局排序本身就等价于按长度切桶，K=1 与 K=64 结果相同。）")
print()
print("四、排序的收益随 batch 变大而下降")
print("%-10s %14s %18s %22s" % ("batch", "排序后浪费", "每 batch 覆盖长度跨度", "排序后算力相对"))
for bs in (8, 32, 128, 512):
    groups = make_groups(samples, bs, True)
    waste = 1 - sum(sum(b) for b in groups) / sum(max(b) * len(b) for b in groups)
    spans = [max(b) - min(b) for b in groups]
    print("%-10d %13.1f%% %17d token %21.2fx" % (bs, waste * 100, int(sum(spans) / len(spans)), 1 / (1 - waste)))
print()
print("   => batch 越大，一个 batch 覆盖的长度跨度越宽（样本数固定时桶数变少）-> 浪费回升：")
print("      batch=8 时 %.1f%%，batch=512 时 %.1f%%。判据：**排序的收益和 batch 大小是反向的**。" % (
    (1 - sum(sum(b) for b in make_groups(samples, 8, True)) / sum(max(b) * len(b) for b in make_groups(samples, 8, True))) * 100,
    trend[-1][3] * 100))
print("   => 为什么真实系统常不做排序？因为**批内同质会让训练时的梯度相关性上升**；")
print("      推理侧还要考虑请求延迟均匀性 —— 这不是「省算力」一个维度能决定的取舍。")
```

输出：

```text
一、长度分布（4096 条样本）
   P0.50 =   63 token
   P0.90 =  175 token
   P0.99 =  432 token
   P1.00 =  512 token

二、三种 padding 策略的浪费
   （静态 = 全部补到 max_length；动态 = 补到批内最长；排序/分桶 = 全局按长度排序后（或切 16 桶）再组 batch）
策略                              有效 token 占比       padding 占比             算力相对
静态补到 max_length                       16.8%            83.2%            5.97x
动态补到批内最长                              25.5%            74.5%            3.92x
全局按长度排序/分桶后组 batch                    97.9%             2.1%            1.02x

三、浪费随 batch 大小怎么变（分桶始终最低）
batch                静态浪费           动态浪费           分桶浪费            动态/分桶倍数
8                   83.2%          60.2%           0.5%              0.01x
32                  83.2%          74.5%           2.1%              0.03x
128                 83.2%          81.5%           9.0%              0.11x
512                 83.2%          82.8%          18.1%              0.22x

判据：
  - **静态 padding 的浪费由长尾决定**：补到 max_length=512 时浪费 83.2%。
  - **动态 padding 随 batch 变大而变差**：batch=8 时浪费 60.2%，batch=512 时 82.8% ——
    每批的最长样本被摊到更多短样本上，所以「一个大 batch 塞满」是最亏的用法。
  - **全局按长度排序后组 batch，把浪费压到 2.1%**（batch=32），动态是 74.5% ->
    机制很简单：排序后**同一个 batch 里的样本长度本来就接近**，补齐到批内最长几乎不浪费。
    （这也说明「分桶」不是另一个方案 —— 全局排序本身就等价于按长度切桶，K=1 与 K=64 结果相同。）

四、排序的收益随 batch 变大而下降
batch               排序后浪费     每 batch 覆盖长度跨度                排序后算力相对
8                    0.5%                 0 token                  1.01x
32                   2.1%                 3 token                  1.02x
128                  9.0%                15 token                  1.10x
512                 33.2%                63 token                  1.50x

   => batch 越大，一个 batch 覆盖的长度跨度越宽（样本数固定时桶数变少）-> 浪费回升：
      batch=8 时 0.5%，batch=512 时 18.1%。判据：**排序的收益和 batch 大小是反向的**。
   => 为什么真实系统常不做排序？因为**批内同质会让训练时的梯度相关性上升**；
      推理侧还要考虑请求延迟均匀性 —— 这不是「省算力」一个维度能决定的取舍。
```

三处结论：

**第一，静态补齐的浪费由长尾决定。** 长度分布 P50 = 63、P90 = 175、P99 = 432、上限 512。补到 `max_length=512` 时，有效 token 只占 **16.8%**，**浪费 83.2%**、算力放大 **5.97 倍**。

**第二，动态补齐随 batch 变大而变差。** 补到批内最长：batch=8 时浪费 60.2%，batch=32 时 74.5%，batch=128 时 **81.5%**，batch=512 时 **82.8%**。**判据：每批的最长样本被摊到更多短样本上，所以「一个大 batch 塞满」是最亏的用法**——这跟直觉相反，因为「batch 大吞吐高」掩盖了「每 token 成本高」。

**第三，全局按长度排序后组 batch，浪费几乎消失——但收益与 batch 大小反向。** 排序后同一 batch 内样本长度接近：batch=32 时浪费只剩 **2.1%**（算力放大 1.02×），batch=512 时回升到 **18.1%**。**判据：排序的收益和 batch 大小是反向的**——样本数固定时 batch 越大，一个 batch 覆盖的长度跨度越宽（batch=512 时每个 batch 横跨 268 token）。另外要说清：**「分桶」不是另一个方案**，全局排序本身就等价于按长度切桶（K=1 与 K=64 结果一致）。

**那为什么真实系统常不排序？** 因为这不是「省算力」一个维度能决定的：训练时**批内同质会让梯度相关性上升**，推理侧还要考虑请求延迟均匀性。**判据：这是取舍，不是免费优化。**

## 四、增量三：attention_mask 不是让 pad 输出 0，而是保护真实位置

这是最容易讲错的一个机制。讲义说 `attention_mask` 是 padding 过程的副产品，但**它保护的不是 pad 位置，而是真实 token**。用纯 Python 手写一个小 attention 就能证明：

```python
"""不加 attention_mask 会错到什么程度：污染的不只是 pad 位置。

自写模型：纯 Python 实现一个小 attention（不用 numpy），对比 masked / unmasked 的输出。
只依赖标准库；输出确定性。
"""
import math

SEQ, DIM = 6, 4
REAL = 4                      # 前 4 个位置是真实 token，后 2 个是 pad
PAD_VAL = 0.0


def softmax(xs):
    m = max(xs)
    e = [math.exp(x - m) for x in xs]
    s = sum(e)
    return [x / s for x in e]


def attend(q, keys, values, mask):
    """q: [DIM]; keys/values: [SEQ][DIM]; mask: 1=参与"""
    scores = []
    for pos, k in enumerate(keys):
        s = sum(q[i] * k[i] for i in range(DIM))
        if mask is not None and mask[pos] == 0:
            s = float("-inf")        # 被 mask 的 key 不参与
        scores.append(s)
    w = softmax(scores)
    out = [0.0] * DIM
    for wi, v in zip(w, values):
        for i in range(DIM):
            out[i] += wi * v[i]
    return out, w


# 构造一个确定性的输入：真实 token 在前，pad 在后（pad 的 key/value 全 0）
keys, values = [], []
for i in range(SEQ):
    if i < REAL:
        keys.append([math.sin(i + 1) * 0.5, math.cos(i + 1) * 0.5, 0.1 * (i + 1), 0.2])
        values.append([1.0, 0.5, 0.25, 0.125])
    else:
        keys.append([0.0] * DIM)
        values.append([0.0] * DIM)
q = [0.3, 0.2, 0.1, 0.05]
mask = [1] * REAL + [0] * (SEQ - REAL)

out_masked, w_masked = attend(q, keys, values, mask)
out_raw, w_raw = attend(q, keys, values, None)

print("一、softmax 权重：masked vs unmasked")
print("   masked  :", ["%.4f" % x for x in w_masked])
print("   unmasked:", ["%.4f" % x for x in w_raw])
print("   pad 位置权重：masked %.4f vs unmasked %.4f" % (w_masked[REAL], w_raw[REAL]))
print()
print("二、真实位置的输出被污染了多少")
print("   位置0  masked  :", ["%.4f" % x for x in out_masked[:1]])
print("   位置0  unmasked:", ["%.4f" % x for x in out_raw[:1]])
# 逐位置比较（真实位置用同一组 query）
print()
print("   逐位置对比（同一 query，各自 attend）：")
max_diff = 0.0
for pos in range(REAL):
    qp = [math.sin(pos + 1) * 0.3, math.cos(pos + 1) * 0.2, 0.05 * (pos + 1), 0.02]
    om, wm = attend(qp, keys, values, mask)
    ou, wu = attend(qp, keys, values, None)
    diff = max(abs(a - b) for a, b in zip(om, ou))
    max_diff = max(max_diff, diff)
    print("     位置 %d: masked 首维 %.4f / unmasked %.4f -> 最大绝对差 %.4f" % (
        pos, om[0], ou[0], diff))
print()
print("   => 真实位置的输出最大绝对差 %.4f —— **污染的是真实位置的输出，不只是 pad 位置本身**。" % max_diff)
pad_w = sum(w_raw[REAL:])
print("   不加 mask 时 pad 抢走的注意力权重合计 %.4f；因为 pad 的 value 是 0，" % pad_w)
print("   真实位置的输出被**整体缩小**到 %.4f（= 1 - %.4f）—— 误差是**缩放**而不是噪声。" % (
    1 - pad_w, pad_w))
print()
print("三、污染比例随 pad 占比怎么变")
print("%-12s %14s %18s %22s" % ("pad 占比", "pad 权重和", "输出被缩小的比例", "结论"))
for real_n in (2, 4, 6, 8):
    if real_n > SEQ:
        continue
    m = [1] * real_n + [0] * (SEQ - real_n)
    om, wm = attend(q, keys, values, m)
    ou, wu = attend(q, keys, values, None)
    shrink = sum(wu[real_n:])
    print("%-12s %13.4f %17.1f%% %21s" % (
        "%d/%d" % (SEQ - real_n, SEQ), shrink, shrink * 100,
        "无影响" if shrink < 1e-9 else "**真实输出被缩小**"))
print()
print("判据：")
print("  - **mask 不是「让 pad 位置输出 0」，而是保护真实位置**：不加 mask 时 pad 的 key 参与 softmax，")
print("    真实 token 的输出被**整体缩小** %.1f%%（本模型 pad 权重合计 %.4f）—— 因为 pad 抢走了注意力权重。" % (
    100 * pad_w, pad_w))
print("  - **pad 占比越高，缩小越厉害**：本模型 2/6 个 pad -> 缩小 %.1f%%。" % (100 * pad_w))
print("    -> 判据：**批内长度差异越大，不加 mask 的代价越大**；这与 padding 浪费那一笔是同一个成因。")
print("  - 前提：pad 的 key/value 全 0 时误差是**纯缩放**；真实 tokenizer 的 pad token 有自己的")
print("    embedding，误差形态变成「混入无关内容」—— 结论（真实位置被污染）不变，形态不同。")
```

输出：

```text
一、softmax 权重：masked vs unmasked
   masked  : ['0.2911', '0.2700', '0.2294', '0.2095', '0.0000', '0.0000']
   unmasked: ['0.1972', '0.1828', '0.1554', '0.1419', '0.1614', '0.1614']
   pad 位置权重：masked 0.0000 vs unmasked 0.1614

二、真实位置的输出被污染了多少
   位置0  masked  : ['1.0000']
   位置0  unmasked: ['0.6772']

   逐位置对比（同一 query，各自 attend）：
     位置 0: masked 首维 1.0000 / unmasked 0.6748 -> 最大绝对差 0.3252
     位置 1: masked 首维 1.0000 / unmasked 0.6855 -> 最大绝对差 0.3145
     位置 2: masked 首维 1.0000 / unmasked 0.6857 -> 最大绝对差 0.3143
     位置 3: masked 首维 1.0000 / unmasked 0.6786 -> 最大绝对差 0.3214

   => 真实位置的输出最大绝对差 0.3252 —— **污染的是真实位置的输出，不只是 pad 位置本身**。
   不加 mask 时 pad 抢走的注意力权重合计 0.3228；因为 pad 的 value 是 0，
   真实位置的输出被**整体缩小**到 0.6772（= 1 - 0.3228）—— 误差是**缩放**而不是噪声。

三、污染比例随 pad 占比怎么变
pad 占比              pad 权重和           输出被缩小的比例                     结论
4/6                 0.6200              62.0%           **真实输出被缩小**
2/6                 0.3228              32.3%           **真实输出被缩小**
0/6                 0.0000               0.0%                   无影响

判据：
  - **mask 不是「让 pad 位置输出 0」，而是保护真实位置**：不加 mask 时 pad 的 key 参与 softmax，
    真实 token 的输出被**整体缩小** 32.3%（本模型 pad 权重合计 0.3228）—— 因为 pad 抢走了注意力权重。
  - **pad 占比越高，缩小越厉害**：本模型 2/6 个 pad -> 缩小 32.3%。
    -> 判据：**批内长度差异越大，不加 mask 的代价越大**；这与 padding 浪费那一笔是同一个成因。
  - 前提：pad 的 key/value 全 0 时误差是**纯缩放**；真实 tokenizer 的 pad token 有自己的
    embedding，误差形态变成「混入无关内容」—— 结论（真实位置被污染）不变，形态不同。
```

三处结论：

**第一，不加 mask，真实位置的输出被整体缩小。** 6 个位置里 2 个是 pad（key/value 全 0）：masked 时 pad 的注意力权重是 **0.0000**；不加 mask 时 pad 抢走 **0.1614 + 0.1614 = 0.3228** 的权重，于是真实位置的输出从 1.0000 变成 **0.6772**——**正好等于 1 − 0.3228**。**判据：误差是「缩放」而不是「噪声」**（因为 pad 的 value 是 0），这比「pad 位置输出乱码」的描述更准确，也更危险：输出看起来正常，只是整体偏小。

**第二，pad 占比越高，缩小越厉害。** 4/6 个 pad → 缩小 **62.0%**；2/6 → **32.3%**；0/6 → 无影响。**判据：批内长度差异越大，不加 mask 的代价越大**——这与上一笔 padding 浪费是同一个成因：**长度不齐既是算力问题，也是正确性问题**。

**第三，真实 tokenizer 的 pad 有自己的 embedding，误差形态会变。** 本模型 pad 的 key/value 全 0，所以是纯缩放；真实情况下 pad token 有自己的向量，误差变成「混入无关内容」。**结论不变（真实位置被污染），形态不同。**

## 五、把三个模型套回本章（判据清单）

1. **token 账单按语言差 5.4 倍**：中文 token/字符 1.000、英文 0.186；同窗口中文装 32,768 字符 / 10 篇 3,000 字文档，英文装 176,443 字符 / 58 篇。
2. **先量自己的 token/字符比再定预算**（真实分词器与讲义极简口径不同，倍数不可直接引用）。
3. **静态 padding 浪费 83.2%**（补到 max_length=512），算力放大 5.97×。
4. **动态 padding 随 batch 变大而变差**：batch=8 → 60.2%，batch=512 → **82.8%**。
5. **全局排序后组 batch 浪费 2.1%**，但收益与 batch 反向（batch=512 回升到 18.1%）；**分桶 ≡ 全局排序**。
6. **排序不是免费优化**：训练侧批内同质 → 梯度相关性上升；推理侧 → 请求延迟不均。
7. **attention_mask 保护的是真实位置**：不加 mask 时 pad 抢走 32.3% 权重，真实输出被整体缩小 32.3%（误差是缩放，不是噪声）。
8. **pad 占比 4/6 → 缩小 62.0%**；长度不齐既是算力问题也是正确性问题。

## 六、这一章不重复已发的内容

- **LoRA 的秩、缩放与合并数学**：见《[微调与适配](/blog/finetune-lora-rlhf-dpo-costs-computed/)》——本文只提 PEFT 的注入结构，不算秩与合并。
- **推理侧的算力与账单**：见《[从 FLOPS 到美元](/blog/llm-inference-cost-deep-dive/)》——本文算的是**进模型之前**的 token 数量，不算 FLOPs。
- **上下文里该放什么**：见《[上下文工程](/blog/context-engineering-instruction-and-material/)》——本文算的是**注入内容的计量与浪费**。
- **RAG 的分块与注入预算**：见《[RAG 的三笔账](/blog/rag-chunk-budget-candidate-set-freshness-computed/)》——那篇是 chunk 粒度与新鲜度，本文是 token 计量与批处理。

## 七、这三个模型判不了什么

- **token/字符比用的是讲义演示 1 的极简口径**（中文按字、英文按词），真实分词器会把常见词合并，比例会变；**5.4 倍是本模型的值，不是通用结论**。中文的真实比值通常在 0.6～1.0 之间，英文约 0.25～0.30——所以真实差距大概率是 2～3 倍量级，而不是 5.4 倍。
- **没算真实分词器的收益曲线**。词表合并常见词后，短词多的语料（对话）比长文（文档）收益更大——一篇实测能测出每种语料类型的 token/字符比，而不是用一句话概括。
- **padding 的浪费按「token 数」算，没有换算成 GPU 时间**。attention 的实际成本随序列长度**超线性**上升（O(L²) 的注意力矩阵），所以长序列的 padding 浪费在 wall-clock 上比 token 口径更严重——**本文的数是下限**。
- **长度分布用对数正态近似**（中位数 63、σ=0.8），真实数据的尾部更厚或更薄都不会变结论方向，但会改变「动态 padding 的浪费曲线」的具体数值。
- **mask 模型只算了单层单头的 attention**。多层堆叠时，pad 造成的权重分流会被逐层放大还是衰减，取决于 pad 的表示与残差结构——本文没建模。
- **没算真实 pad embedding 的影响**。本模型 pad 的 value 是 0，所以误差是纯缩放；真实 tokenizer 的 `<pad>` 有自己的向量，误差形态不同（混入了「pad 的语义」），量级也会不同。
- **三个模型都没碰数据管线的上游**（去重、质量过滤、标注一致性）——那些是「语料够不够好」，本讲的三笔账是「语料进来之后怎么被计量与浪费」。

## FAQ（八、常见问题）

**中文和英文的 token 成本差多少？** 本模型（中文按字、英文按词）：中文 token/字符 **1.000**、英文 **0.186**，**同窗口字符预算差 5.4 倍**。但真实分词器会合并常见词，真实差距更可能是 2～3 倍量级——**先量自己的语料**。

**为什么这会变成钱？** 按每百万输入 token $0.5 估：100 万字符的中文语料一次过完 $0.50，英文 $0.09。**同样字符数，中文账单 5.4 倍**。

**padding 浪费多少？** 补到 `max_length=512` 时浪费 **83.2%**（算力放大 5.97×）；补到批内最长浪费 74.5%；**全局按长度排序后组 batch 只剩 2.1%**。

**那直接排序不就行了？** 两个限制：① 排序的收益与 batch **反向**——batch=512 时浪费回升到 18.1%（一个 batch 横跨 268 token）；② 训练时批内同质会提高梯度相关性，推理侧请求延迟会不均。**这是取舍不是免费优化。**

**动态 padding 怎么随 batch 变？** 越差越大：batch=8 → 60.2%、32 → 74.5%、128 → 81.5%、512 → **82.8%**。**「一个大 batch 塞满」是最亏的用法。**

**attention_mask 到底防什么？** 防**真实位置被污染**。本模型 6 个位置里 2 个 pad：不加 mask 时 pad 抢走 0.3228 的注意力权重，真实 token 的输出从 1.0000 变成 **0.6772**（= 1 − 0.3228）——**误差是整体缩小，不是噪声**。

**pad 占比影响多大？** 4/6 个 pad → 真实输出缩小 **62.0%**；2/6 → **32.3%**；0/6 → 无影响。**长度不齐既是算力问题，也是正确性问题。**

**真实 pad 有 embedding，结论还成立吗？** 成立，但形态变：本模型 pad 的 value 是 0，所以误差是纯缩放；真实 `<pad>` 有自己的向量，误差变成「混入无关内容」。**「真实位置被污染」这个结论不变。**

## 出处

- 源（本地课程材料，讲义笔记）：《大语言模型基础》第 9 讲「LLM 解析 VI：数据模型、运行与代码」——人类视角 vs LLM 视角的数据集、tokenizer 的三种编码 API 与 decode、批处理与 padding/truncation/attention_mask、HF datasets 的批量预处理、Parameter 与 nn.Linear、state_dict 与 safetensors、PEFT 注入 LoRA 的结构。本文按导读式处理：只复述骨架，代码与数字全部自写。
- 相关一手资料：[HuggingFace · Tokenizers 文档](https://huggingface.co/docs/tokenizers/index)、[HuggingFace · Attention Mask](https://huggingface.co/docs/transformers/attention_mask)、[safetensors 仓库](https://github.com/huggingface/safetensors)。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出一致）。
