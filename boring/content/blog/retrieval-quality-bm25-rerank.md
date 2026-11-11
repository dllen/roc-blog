---
title: "检索质量工程：BM25、混合检索与两阶段重排"
date: 2026-11-10
update_date: 2026-11-10
description: "RAG 的效果瓶颈通常在检索而不在生成。这篇拆开 BM25 的打分函数（含逐位复现的示例）、稠密检索与交叉编码器的分工、多路结果合并的两种方式，以及两阶段重排里两个 top_k 各自管什么——并指出讲义里一个复现不出来的算式。"
tldr: "BM25 靠词面重叠、稠密检索靠语义、交叉编码器靠逐对细读。混合检索把前两者合并，重排再精读一遍。真正的成本旋钮是两个 top_k：初检决定召回上限，重排决定最终进上下文的长度。"
keywords: ["BM25 打分函数", "混合检索 hybrid search", "交叉编码器 cross-encoder", "RRF 倒数排名融合", "两阶段重排 rerank", "Haystack RAG"]
taxonomies:
  tags: ["RAG", "检索增强", "LLM原理", "工程实践"]
---

# 检索质量工程：BM25、混合检索与两阶段重排

RAG 系统最常见的失败模式是：检索回来的文档里根本没有答案，模型再强也只能编。这类问题排查到最后，往往发现不是生成模型的锅，而是检索这一步没有把正确的文档放进候选集。

所以 RAG 的工程重心其实是**检索质量**。这篇讲三件事：三类检索器各自靠什么打分、多路结果怎么合并、以及两阶段重排里那两个 `top_k` 旋钮。

本文整理自南京大学《大语言模型基础：从零到一实现之路》第 14 讲（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture14.html)。文中的数值复现脚本在 CPU 上逐位跑过；Haystack 的实现细节取自其仓库源码（版本标注见文末）。

如果你对 RAG 的整体流程还不熟，先看 [Agent 记忆系统：三层架构 + RAG 实战](/blog/ai-agent/ai-agent-series-03-memory-rag/)；想了解检索结果如何进入上下文并影响最终答案质量，看 [Prompt Engineering 从入门到精通](/blog/prompt-engineering-from-entry-to-master/)。

## 一、BM25：词面重叠的打分函数

BM25 是搜索引擎领域的经典排序函数，本质是一个基于词袋的统计打分器：

```text
score(D, Q) = Σ_i  IDF(q_i) · f(q_i,D)·(k1+1) / ( f(q_i,D) + k1·(1 - b + b·|D|/avgdl) )
```

各部分含义：

- `q_i` 是查询里的第 i 个词，`f(q_i, D)` 是它在文档 D 中的词频；
- `|D|` 是文档长度，`avgdl` 是语料的平均文档长度；
- `IDF(q_i)` 是该词的逆文档频率权重——越少见的词，权重越高；
- `k1`（默认 1.5）和 `b`（默认 0.75）是超参数。

`b` 控制长度归一化的强度：`b = 0` 表示完全不管文档长短，`b = 1` 表示完全按长度补偿。`k1` 控制词频饱和的速度——一个词在文档里出现 10 次和 100 次，权重不该差 10 倍。

**BM25 的长处和短处都很明确。** 它快：纯统计计算，不需要 GPU，不需要存向量，RAG 全程走 API 也能跑得动。但它只认词面重叠——查「怎么让模型别乱编」检索不到标题写着「抑制幻觉」的文档，因为一个词都没重合上。

### 讲义示例的逐位复现

讲义给了一个三文档的例子，`InMemoryBM25Retriever` 返回的分数是 `7.815769833242408` / `4.314753296196667` / `3.652595952218814`。这些数字值得追一下——因为它们能暴露检索实现里那些看不见的默认行为。

下面这段脚本按 Haystack v2.5.0 的口径重算，并同时给出当前 main 分支的算法：

```python
# -*- coding: utf-8 -*-
"""复现讲义第 14 讲的两个 BM25Retriever 示例，并对比 Haystack 两代实现的差异。"""
import math
import re
from collections import Counter

DOCS1 = {
    "languages": "There are over 7,000 languages spoken around the world today.",
    "bioluminescent": "In certain parts of the world, like the Maldives, Puerto Rico, "
                       "and San Diego, you can witness the phenomenon of bioluminescent waves.",
    "elephants": "Elephants have been observed to behave in a way that indicates a high level "
                 "of self-awareness, such as recognizing themselves in mirrors.",
}
QUERY1 = "How many languages are spoken around the world today?"
NOTE1 = {"languages": 7.815769833242408, "bioluminescent": 4.314753296196667,
         "elephants": 3.652595952218814}

_CJK = (
    r"\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff\u3130-\u318f"
    r"\uac00-\ud7af\u3040-\u30ff\u31f0-\u31ff"
    r"\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"
)
RX_OLD = re.compile(r"(?u)\b\w\w+\b")
RX_NEW = re.compile(rf"[^\W{_CJK}]+|[{_CJK}]")

K1, B, DELTA = 1.5, 0.75, 0.5


def bm25(docs, query, rx, avg_mode, floor_missing):
    """按 Haystack 的 BM25L 口径打分。

    avg_mode     : "v250" 用带 off-by-one 的增量平均，"main" 用正确平均
    floor_missing: True 时 query 词在文档中缺失也计入 delta 下限
    """
    toks = {k: rx.findall(v.lower()) for k, v in docs.items()}
    lens = {k: len(v) for k, v in toks.items()}
    keys = list(toks)
    if avg_mode == "v250":
        avg = 0.0
        for i, k in enumerate(keys, 1):
            avg = (lens[k] + avg * i) / (i + 1)
    else:
        avg = sum(lens.values()) / len(lens)
    fv = Counter()
    for t in toks.values():
        fv.update(set(t))
    N = len(toks)
    idf = {}
    for w in rx.findall(query.lower()):
        n = fv.get(w, 0)
        idf[w] = math.log((N + 1.0) / (n + 0.5)) * int(n != 0)
    out = {}
    for k, t in toks.items():
        freq = Counter(t)
        s = 0.0
        for w, iv in idf.items():
            f = freq.get(w, 0.0)
            if f == 0.0 and not floor_missing:
                continue
            ctd = f / (1 - B + B * lens[k] / avg)
            s += iv * (K1 + 1) * (ctd + DELTA) / (K1 + ctd + DELTA)
        out[k] = s
    return out, avg, lens


for tag, rx, mode, floor in [("Haystack v2.5.0", RX_OLD, "v250", True),
                              ("Haystack main ", RX_NEW, "main", False)]:
    sc, avg, lens = bm25(DOCS1, QUERY1, rx, mode, floor)
    print(f"\n--- {tag} 口径：avg_doc_len={avg!r}  doc_len={lens}")
    for k in DOCS1:
        mark = "✓ 与讲义逐位相等" if sc[k] == NOTE1[k] else "✗ 与讲义不一致"
        print(f"    {k:<16} 手算={sc[k]!r:>22}  讲义={NOTE1[k]!r:>22}  {mark}")
```

实测输出：

```text
--- Haystack v2.5.0 口径：avg_doc_len=13.25  doc_len={'languages': 10, 'bioluminescent': 22, 'elephants': 21}
    languages        手算=     7.815769833242408  讲义=     7.815769833242408  ✓ 与讲义逐位相等
    bioluminescent   手算=     4.314753296196667  讲义=     4.314753296196667  ✓ 与讲义逐位相等
    elephants        手算=     3.652595952218814  讲义=     3.652595952218814  ✓ 与讲义逐位相等

--- Haystack main  口径：avg_doc_len=18.666666666666668  doc_len={'languages': 11, 'bioluminescent': 22, 'elephants': 23}
    languages        手算=     8.249121195460468  讲义=     7.815769833242408  ✗ 与讲义不一致
    bioluminescent   手算=     1.3590470321347758  讲义=     4.314753296196667  ✗ 与讲义不一致
    elephants        手算=                   0.0  讲义=     3.652595952218814  ✗ 与讲义不一致
```

三个数字全部**逐位相等**（不是四舍五入后相等，是浮点表示完全一致）。这说明讲义里的例子对应的是 Haystack v2.5.0 的行为，而当前 main 分支的实现已经改了三处：

1. **分词**。v2.5.0 用 `(?u)\b\w\w+\b`；main 改成 CJK 感知的正则（非 CJK 连续词 + CJK 单字）。所以 `languages` 那篇的 doc_len 从 10 变成 11——"7,000" 这类数字的切法不同了。
2. **avg_doc_len 的计算**。v2.5.0 的增量更新有个 off-by-one（用 `len(self._bm25_attr)` 时新文档已经在字典里了），三篇文档的平均长度算成了 `53/4 = 13.25` 而不是 `53/3 = 17.67`；main 已修正为 `18.666…`。
3. **缺失 query 词怎么算**。v2.5.0 的 BM25L 对「query 词在文档中根本没出现」也计入 delta 下限；main 记 0。

第三点的影响最直观：`elephants` 那篇文档和 query 的词面重叠是**空集**（脚本最后会打印验证这一点）。在 v2.5.0 的口径下它照样拿到 3.65 分，因为缺失词也吃 delta 下限；在 main 的口径下它的分数是 **0.0**。换句话说，一个与查询毫无词面关联的文档排在第三名，是旧实现的产物。

这三条差异不改变检索的**排序**（本例中 languages 始终第一），但会改变**分数的绝对值**——而分数绝对值一旦要跨系统比较、要做阈值过滤、或者要喂给加权合并，就全是问题。

### 讲义里一处复现不出来的算式

讲义在讲 RRF 时给出三个分数，并写明算法是：

```text
RRFscore(d) = (k / |R|) · Σ_{r∈R} 1/(k + r(d))，其中 k = 61
```

然后逐个列出：`Studying...` 的 bm25 排序为 1、dense 排序为 3，所以 `61/2 × (1/(61+1) + 1/(61+3)) = 0.9841269841269842`。

这个等式**算不出它自己的右边**。按式子里的 1-based 排名代进去，`61/2 × (1/62 + 1/64)` 等于 `0.9684979838709677`，不是 `0.9841269841269842`。

讲义给的三个值实际对应的是 **0-based 排名**：`61/2 × (1/61 + 1/63) = 0.9841269841269841`（差在最后一位，是浮点表示误差），`Regular...` 则是 `61/2 × 2/62 = 0.9838709677419355`。

这与 Haystack 的源码一致——`_reciprocal_rank_fusion` 的注释写得很清楚：

> The constant k is set to 61 (60 was suggested by the original paper, plus 1 as python lists are 0-based and the paper used 1-based ranking).

实现里用的是 `for rank, doc in enumerate(documents)`，`rank` 从 0 开始，所以分母是 `k + rank`，等价于 1-based 排名下的 `1/(60 + r)`。原始论文（Cormack et al., 2009）建议的 `k` 是 60，Haystack 取 61 正是为了抵消这个 0-based 与 1-based 的差异。

所以这条不是讲义算错了，而是**公式写成 1-based、代码用 0-based**的不一致——引用时要注意按哪一种写。

## 二、三类检索器：词面、语义、逐对细读

| 检索器 | 依据 | 速度 | 擅长 | 不擅长 |
|--------|------|------|------|--------|
| BM25（稀疏） | 词面重叠 + IDF | 极快，无需 GPU | 专有名词、型号、罕见词、人名 | 同义改写、跨语言 |
| Dense（稠密） | 向量余弦相似度 | 中，需要 embedding 模型 | 语义相近、改写、跨语言 | 罕见词、精确 ID |
| Cross-Encoder（重排） | query 与 doc 拼成一对送进模型 | 慢，每个候选都要算一遍 | 判断「这篇是否真的回答了这个问题」 | 不能直接用于大规模召回 |

**Dense 检索的架构**是 BERT 式的三段：Tokenizer（词 → token）→ Embedding（token → 向量）→ Encoder 堆叠（向量 → 向量）。最终得到一个句子级向量，和 query 向量算余弦相似度。

**Cross-Encoder 与 bi-encoder 的根本区别**在输入形态：bi-encoder（也就是 dense 检索）把 query 和 doc **分别**编码成向量，两边互不知情；cross-encoder 把 query 和 doc **拼在一起**送进模型，让注意力直接看到两者的交互。后者因此更准，但也贵得多——一个候选文档就要跑一次前向。

这就是为什么生产系统几乎都是「先用便宜的召回一批，再用昂贵的重排精选」的两阶段结构。

## 三、多路结果合并：加权合并与 RRF

两路检索的分数量纲完全不同：BM25 的分数是无界的（可以是 5，也可以是 300），余弦相似度却被压在 `[-1, 1]`。直接加权求和，结果基本由 BM25 那一路决定。

**加权合并（weight merge）**的做法是先把各路分数放缩到可比区间，再加权和：

```text
综合分数 = α · scale(s₁) + (1 - α) · scale(s₂)
```

Haystack 里对应 `DocumentJoiner(join_mode="merge", weights=[0.3, 0.7])`。**关键前提：两路检索器都必须开 `scale_score=True`**，把 BM25 原始分数放缩到 `[0, 1]`。不放缩直接加权，权重就失真了——`weights` 只在这个模式下生效。

**RRF（Reciprocal Rank Fusion，倒排融合）**换了个思路：完全不看分数，只看排名。

```text
RRFscore(d) = Σ_{r∈R} 1/(k + r(d))
```

它的好处是鲁棒：不管两路的分数分布是长尾还是均匀，融合结果只取决于两路对同一篇文档的相对位置共识。想「略读整体 + 跳读重点」时，这个特性比加权合并更省心。代价是丢掉了排序内部的差距信息——两路都排第一的文档和一路第一一路第三的文档，差别只有 `1/(k+1) + 1/(k+3)` 与 `1/(k+1) + 1/(k+1)` 那么一点。

`DocumentJoiner` 在 `reciprocal_rank_fusion` 模式下不需要 `scale_score`，且换检索器时无需改动 joiner 本身——它只认「一组按相关性排好序的 Document 列表」。

## 四、两阶段重排：两个 top_k，两个完全不同的旋钮

这是整套检索里最容易被配错的地方。**重排有两个 `top_k`，它们管的不是同一件事。**

```text
初检 top_k  →  召回上限
重排 top_k  →  最终送进 LLM 的候选数
```

**初检 `top_k` 决定召回上限**，而且是硬上限：没进初检的文档，重排再强也救不回来——重排只能给已经召回的候选重新排序，它无法凭空找回没被召回的文档。所以初检要宁大勿小，代价只是多跑几次重排。

**重排 `top_k` 决定最终进上下文的候选数**，直接决定上下文长度和调用成本。这里就该紧了。

举例说明为什么需要两阶段。讲义里有这样一组文档（query 是 "What are effective strategies to improve English speaking skills?"）：

```text
Studying the history of the English language does not directly improve speaking skills.
Regular participation in debates and discussions refine public speaking skills in English.
Practicing with native speakers enhances English speaking proficiency.
Daily vocabulary expansion is crucial for improving oral communication skills.
Engaging in language exchange programs can significantly boost speaking abilities.
```

BM25 把 **「Studying the history...」排在第一**——因为它含 "speaking skills" 等字样，词面重叠最多，尽管它的语义恰恰是「学历史**不能**直接提升口语」。这是个典型的词面检索翻车。

稠密检索则把语义最相关的「Practicing with native speakers」排第一。两路排序明显不同，这正是混合检索的价值所在——而交叉编码器重排会进一步把「语义上真的在回答问题」的那篇顶上来。

这也解释了一个常见困惑：为什么 RAG 系统要串这么多层？因为每一层都在修上一层的失误——BM25 的词面偏差由 dense 补，dense 的语义漂移由 cross-encoder 补。

## 五、边界：检索质量工程的几个坑

**BM25 分数的绝对值不可跨实现比较。** 前面已经看到，同一份语料在两代 Haystack 下分数完全不同。依赖固定阈值的过滤逻辑，换个库版本就会失效。

**RRF 的公式要看清楚是 0-based 还是 1-based。** 引用时把 `k = 61` 和排名基准一起写清楚，否则复现不出来。

**重排不是免费的。** cross-encoder 每个候选一次前向，初检 `top_k` 设成 100、重排 `top_k` 设成 3，意味着你要为 100 篇文档付 100 次前向，只留 3 篇进上下文。初检 `top_k` 直接乘在重排成本上。

**切块大小是前置决策，不是后置优化。** 切块太大，一个块里混了好几个主题，任何一个主题的检索都会把它召回，但送进上下文的噪声也大；切块太小，句子被截断，检索到的片段读不懂。改切块策略等于重建索引，成本远高于调 `top_k`。

**检索质量的上限由语料决定。** 文档里压根没写的知识，再好的检索也召不出来。Anthropic 报告过一组数字：标准 RAG 基础上加 BM25，检索失败率降低 49%；再加 reranker，降低 67%——但这个基线是「文档本身相关」的前提下。

**别忘了 no_repeat_ngram 之类的硬约束在检索侧也有对应物**：`top_k` 设太大会让重复内容多次进入上下文，这类问题在生成侧的惩罚参数管不住，得在检索侧限制。

## 六、FAQ

**Q：只有 BM25 行不行？**
A：小语料、固定术语（产品型号、法条、错误码）、不打算跑 embedding 模型时，BM25 完全够用，而且比 dense 便宜几个数量级。多数「RAG 效果不好」的问题，出在切块和 query 改写上，不在检索器选型。

**Q：dense 和 BM25 该怎么加权？**
A：如果用 `join_mode="merge"`，权重得配合 `scale_score=True` 才靠谱。`weights` 的含义是「这一路的贡献占比」，不是「多信任这一路」——先想想你要的是「两路都召回的文档优先」还是「dense 优先」。

**Q：什么时候必须上 cross-encoder？**
A：当 BM25 和 dense 的分歧很大，且分歧的那几篇文档确实关键时。讲义里那个例子就是典型：词面第一名的语义是反的。判断方法是先看两路的排序差异有多大——差异小，重排收益也小。

**Q：初检 `top_k` 设多大？**
A：设成「召回上限」而不是「我打算用几篇」。它设小了会永久丢文档，重排救不回来。常见做法是先设大（比如 50–100），看重排后的分数分布再收紧。

**Q：怎么验证检索质量？**
A：拿一批「query → 应该召回哪几篇」的标注对，逐个看召回率（该召回的有没有进初检）和重排后的准确率。这两个指标要分开测——初检差是召回问题，重排差是排序问题，混在一起看只会得到一个笼统的「检索不行」。

## 参考资料

- Reciprocal Rank Fusion 原始论文（Cormack et al., 2009）：[PDF](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- Haystack `DocumentJoiner` 与 RRF 实现：[`haystack/components/joiners/document_joiner.py`](https://github.com/deepset-ai/haystack/blob/main/haystack/components/joiners/document_joiner.py)、[`haystack/utils/misc.py`](https://github.com/deepset-ai/haystack/blob/main/haystack/utils/misc.py) 的 `_reciprocal_rank_fusion`
- Haystack BM25 实现：[`haystack/document_stores/in_memory/document_store.py`](https://github.com/deepset-ai/haystack/blob/main/haystack/document_stores/in_memory/document_store.py)（`_score_bm25l` / `_compute_tf` / `_avg_doc_len`）
- Anthropic，*Introducing Contextual Retrieval*：[原文](https://www.anthropic.com/news/contextual-retrieval)
- 讲义来源：南京大学《大语言模型基础》第 14 讲，[幻灯片](https://njudeepengine.github.io/llm-course-lecture/2025/lecture14.html)
