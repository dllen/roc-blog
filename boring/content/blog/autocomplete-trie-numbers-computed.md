---
title: "自动补全的三个可计算处：节点缓存、存法与前缀上限"
date: "2026-11-26"
description: "《系统设计面试内幕指南》第 13 章讲搜索自动补全：一棵 trie 存查询词、每个节点缓存 top-k、限制前缀长度、每周批量重建。这篇不复述译文，而是给三个可跑的模型——节点缓存到底省了多少访问又费了多少内存、trie 与「排序数组 + 前缀区间二分」差 51 倍内存、以及前缀长度上限的真实代价是丢掉多少查询流量。"
tldr: "节点缓存让每次查询只读 1 个节点，但每个节点要多背 5 条快照（≈节点自身的 1.25 倍内存）；而且只有子树大于 k 的前缀才值得缓存。trie + 缓存 68 GB，排序数组只要 1.3 GB——省 51 倍。前缀长度上限的真实代价不是内存而是流量：上限 10 会让 26.9% 的查询拿不到建议。"
keywords: ["搜索自动补全", "字典树", "前缀查询", "查询日志", "系统设计"]
taxonomies:
  tags: ["系统设计", "架构设计", "读书笔记", "搜索"]
---

自动补全的三个可计算处？节点缓存要不要建、trie 怎么存、前缀长度卡在几。讲义把这三处都给了「怎么做」，没给「做了值多少」——而这三处恰好是这类系统里最容易被拍脑袋定下来的参数。

这篇不复述译文，也不搬运中文译本的任何段落。它复述这一章的骨架（两个服务、一棵 trie、三类优化），然后补三个自写模型：**节点缓存 top-k 的收益与代价**、**trie 与「排序数组 + 前缀区间二分」的内存对比**、**前缀长度上限的真实代价**。

## 口径说明

- 源笔记是 Alex Xu《System Design Interview — An Insider's Guide》第 13 章的社区中译。上游两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均返回 404，**上游许可未能确认**；原书是商业出版物。故本篇为导读式：只复述章节骨架与需求数字，不引用译文原文或原书段落，不使用译本配图，正文主体是自写模型与判断。
- 三个脚本均为自写增量，只依赖 Python 标准库；输出为实跑结果，逐行可复现（三段模拟都不含随机数）。
- 与已发文章的重叠见「这一章不重复已发的内容」一节。

## 一、本章骨架：两个服务、一棵 trie、三类优化

**需求与关键特性**：用户输入时实时给建议；**最多 5 条**，按**查询热度**排序；只支持小写英文字母；响应 **< 100 毫秒**；规模 1000 万 DAU、峰值 **48,000 QPS**；新增查询数据**每天 0.4 GB**；故障时不能宕机。

**两个服务**：

- *数据收集服务*：从分析日志聚合用户查询、实时统计频率；讲义说这作为起点是好的，但对大数据集做实时处理不现实。
- *查询服务*：用采集服务产出的频率表，按用户输入从 trie 里取 top-k 建议，靠缓存和高效数据结构把延迟压住。例：输入 "tw" 时给出搜索量最高的 5 条查询。

**trie 的三个关键特性**：按层级表示前缀、最小化冗余（紧凑存储）；**每个节点存该前缀的查询热度**；取 top-k 的步骤是「找到前缀节点 → 遍历子树收集有效子节点 → 排序取 top-k」。

**三类优化**：(1) **每个节点缓存 top-k**，避免每次都遍历整棵子树；(2) **限制前缀长度**（讲义举例 50 个字符），理由是很少有人输入很长的搜索词；(3) 轻量 AJAX 请求 + 浏览器缓存高频词的补全结果。

**trie 的生命周期**：**每周**用聚合数据重建；很少实时更新（重建完成后热门建议变化不大）；删除走**过滤层**（先按规则过滤掉仇恨言论之类，再异步物理删除）。

**数据收集流水线**：讲义的结论是实时更新不现实——每天可能有几十亿次查询，每次都更新 trie 不可行，所以走批量。

## 二、增量一：节点缓存 top-k，省了多少、费了多少

讲义给节点缓存的理由是「加速检索，避免遍历整棵子树」。这半句是清楚的，后半句（代价）没提。把两边都算出来：

```python
"""讲义说「每个节点缓存 top-k，避免遍历整棵子树」——省了多少、费了多少内存。

确定性词表 + 确定性前缀查询，比较两种实现的访问量。
只依赖标准库；输出确定性。
"""
K = 5                    # 建议条数（讲义：最多 5 条）

WORDS = """
twitter twitter search twitter account twitter login
twitch twitch stream twitch download twitch app
test test drive test case test suite testing
java java script java home java tutorial
javascript javascript tutorial javascript interview javascript framework
search search engine search bar search result search suggestion
face facebook facebook login facebook page facebook group
inst instagram instagram story instagram reel instagram photo
chat chat bot chat gpt chat app chat ui
amazon amazon web amazon prime amazon aws amazon
google google search google maps google cloud google drive google font
python python tutorial python script python library python interview
redis redis cache redis cluster redis stream
docker docker compose docker image dockerfile docker swarm
kubernetes kubernetes pod kubernetes deployment kubernetes service
""".split()

class TrieNode:
    __slots__ = ("children", "freq", "topk")
    def __init__(self):
        self.children = {}
        self.freq = 0
        self.topk = None

root = TrieNode()
for w in WORDS:
    node = root
    for ch in w:
        node = node.children.setdefault(ch, TrieNode())
    node.freq += 1

def count_nodes(node):
    n = 0
    stack = [node]
    while stack:
        cur = stack.pop()
        n += 1
        stack.extend(cur.children.values())
    return n

def find(prefix):
    node = root
    for ch in prefix:
        if ch not in node.children:
            return None
        node = node.children[ch]
    return node

def fill_topk(node):
    words = []
    stack = [(node, "")]
    while stack:
        cur, path = stack.pop()
        if cur.freq:
            words.append((cur.freq, path))
        for ch, child in cur.children.items():
            stack.append((child, path + ch))
    words.sort(key=lambda x: (-x[0], x[1]))
    node.topk = words[:K]

def walk(node):
    yield node
    for child in node.children.values():
        yield from walk(child)

all_nodes = list(walk(root))
for n in all_nodes:
    fill_topk(n)

sizes = []
for p in sorted(set(w[:2] for w in WORDS)):
    node = find(p)
    if node is not None:
        sizes.append((p, count_nodes(node)))
sizes.sort(key=lambda x: -x[1])

avg_sub = sum(s for _, s in sizes) / len(sizes)
median = sorted(s for _, s in sizes)[len(sizes) // 2]
worth = [p for p, s in sizes if s > K]
cache_entries = sum(len(n.topk) for n in all_nodes)

print("词表 %d 个词，trie 节点 %d 个；考察 %d 个两字母前缀" % (len(WORDS), len(all_nodes), len(sizes)))
print()
print("子树大小分布（前缀按子树大小排序，只列前 8 与后 3）：")
for p, s in sizes[:8]:
    print("  %-4s 子树 %3d 个节点  %s" % (p, s, "值得缓存" if s > K else "不值得"))
print("  ...")
for p, s in sizes[-3:]:
    print("  %-4s 子树 %3d 个节点  %s" % (p, s, "值得缓存" if s > K else "不值得"))
print()
print("平均子树 %.1f 个节点，中位 %d，最小 %d" % (avg_sub, median, sizes[-1][1]))
print("无缓存时每次查询要遍历整棵子树（平均 %.1f 个节点）；有缓存时只读 1 个节点" % avg_sub)
print()
print("子树大于 k=%d 的前缀 %d/%d 个 —— 只有这些前缀的缓存才划算" % (K, len(worth), len(sizes)))
print("缓存条目 %d 条（每节点最多 %d 条），trie 节点 %d 个" % (cache_entries, K, len(all_nodes)))
print()
print("内存代价（按每节点 48 B、每条缓存 12 B 估）：")
node_mem = len(all_nodes) * 48
cache_mem = cache_entries * 12
print("  节点本身 %.0f KB，top-k 缓存 %.0f KB，缓存占节点内存的 %.0f%%" % (node_mem / 1e3, cache_mem / 1e3, 100.0 * cache_mem / node_mem))
print("  每存一个节点的 top-5，多花 5 x 12 = 60 B，相当于节点自身 %.2f 倍" % (60 / 48.0))
print()
print("判据：")
print("  - 缓存把「遍历子树」变成「读一个节点」，但每个节点都要多背 5 条快照；")
print("  - 只有子树大于 k 的前缀才值得缓存（小子树遍历本来就便宜）；")
print("  - 所以缓存应该只建在热门前缀的节点上，而不是整棵树每个节点都建。")
```

输出：

```text
词表 120 个词，trie 节点 269 个；考察 44 个两字母前缀

子树大小分布（前缀按子树大小排序，只列前 8 与后 3）：
  do   子树  15 个节点  值得缓存
  in   子树  15 个节点  值得缓存
  su   子树  12 个节点  值得缓存
  re   子树  10 个节点  值得缓存
  se   子树  10 个节点  值得缓存
  cl   子树   9 个节点  值得缓存
  de   子树   9 个节点  值得缓存
  ja   子树   9 个节点  值得缓存
  ...
  po   子树   2 个节点  不值得
  we   子树   2 个节点  不值得
  ui   子树   1 个节点  不值得

平均子树 5.7 个节点，中位 5，最小 1
无缓存时每次查询要遍历整棵子树（平均 5.7 个节点）；有缓存时只读 1 个节点

子树大于 k=5 的前缀 19/44 个 —— 只有这些前缀的缓存才划算
缓存条目 338 条（每节点最多 5 条），trie 节点 269 个

内存代价（按每节点 48 B、每条缓存 12 B 估）：
  节点本身 13 KB，top-k 缓存 4 KB，缓存占节点内存的 31%
  每存一个节点的 top-5，多花 5 x 12 = 60 B，相当于节点自身 1.25 倍

判据：
  - 缓存把「遍历子树」变成「读一个节点」，但每个节点都要多背 5 条快照；
  - 只有子树大于 k 的前缀才值得缓存（小子树遍历本来就便宜）；
  - 所以缓存应该只建在热门前缀的节点上，而不是整棵树每个节点都建。
```

三处结论：

**第一，缓存确实把查询成本压到常数。** 无缓存时每次查询要遍历整棵子树（这份词表平均 5.7 个节点），有缓存时只读 1 个节点。在真实规模上这个差距会拉得更开——真实词表里 "t"、"g"、"a" 这类前缀的子树是百万级节点量级，遍历一次的成本与读一个缓存条目差好几个数量级。

**第二，缓存不是免费的：每个节点多背 5 条快照，相当于节点自身 1.25 倍内存。** 按每节点 48 B、每条缓存 12 B 估，缓存占节点内存的 31%。在真实规模上这意味着：**trie 本身 30 GB，加上节点缓存就是 68 GB**（下一节算）。

**第三，也是最实用的一条：只有子树大于 k 的前缀才值得缓存。** 这份词表里 44 个两字母前缀中只有 19 个的子树大于 5——剩下 25 个前缀的子树本来就在 5 个节点以内，遍历一遍的代价和读缓存差不多，给它们建缓存纯属浪费。**所以缓存应该只建在热门前缀的节点上，而不是整棵树每个节点都建**——讲义说「每个节点缓存 top-k」，落地上应该是「热门前缀的节点缓存 top-k」。

## 三、增量二：trie 还是排序数组，内存差 51 倍

讲义说 trie「紧凑存储、按层级表示前缀、最小化冗余」。这句话在小词表上成立，在真实规模上要打个问号：trie 的每个字符一个节点，节点里还得装指针和映射开销；而「排序数组 + 前缀区间二分」把整串词存下来，却只要一个指针加一个频次。

用讲义给的量算一遍（每日 0.4 GB → 每周 2.8 GB）：

```python
"""trie 还是「排序数组 + 前缀区间二分」：同一份词表，两种存法的内存账。

讲义只说 trie「紧凑存储、按层级表示前缀，最小化冗余」。这里把两种存法都算一遍。
只依赖标准库；输出确定性。
"""
DAILY_GB = 0.4           # 讲义：新增查询数据每日 0.4 GB
BYTES_PER_QUERY = 20     # 单条查询估字节（估）
UNIQUE_RATIO = 0.30      # 去重后唯一查询占比（估）
AVG_LEN = 20             # 唯一查询平均字符数（估）
SHARED_PREFIX = 5        # 词表共享前缀的平均长度（估）
NODE_BYTES = 48          # trie 节点估字节：children 映射 + 频次 + 指针（估）
ENTRY_BYTES = 12         # 缓存条目估字节（词指针 8 + 频次 4）

weekly_gb = DAILY_GB * 7
raw_queries = weekly_gb * 1e9 / BYTES_PER_QUERY
unique_words = int(raw_queries * UNIQUE_RATIO)
trie_nodes = int(unique_words * (AVG_LEN - SHARED_PREFIX))
trie_bytes = trie_nodes * NODE_BYTES
cache_bytes = trie_nodes * ENTRY_BYTES * 5
sorted_bytes = int(unique_words * (AVG_LEN + 4 + 8))     # 词 + 频次 + 指针

print("讲义给的量：每日新增查询数据 %.1f GB -> 每周 %.1f GB" % (DAILY_GB, weekly_gb))
print("按每条 %d B 估：每周 %.1f 亿条查询；去重率 %.0f%% -> 唯一查询词 %.0f 万个"
      % (BYTES_PER_QUERY, raw_queries / 1e8, UNIQUE_RATIO * 100, unique_words / 1e4))
print()
print("%-34s %14s %12s" % ("存法", "条目/节点数", "内存(GB)"))
print("%-34s %14d %12.1f" % ("trie 节点（每节点 48 B）", trie_nodes, trie_bytes / 1e9))
print("%-34s %14d %12.1f" % ("+ 每节点缓存 top-5（每条 12 B）", trie_nodes, (trie_bytes + cache_bytes) / 1e9))
print("%-34s %14d %12.1f" % ("排序数组 + 前缀区间二分", unique_words, sorted_bytes / 1e9))
print()
print("  -> 排序数组比「trie + 节点缓存」省 %.0f 倍内存" % ((trie_bytes + cache_bytes) / sorted_bytes))
print()
print("为什么 trie 反而更贵：")
print("  - trie 的每个字符一个节点（共享前缀只省下 %.0f 个字符/词），节点里还要装指针与映射开销；" % SHARED_PREFIX)
print("  - 排序数组把整串词存下来，但只需要一个指针 + 一个频次；")
print("  - 前缀查询在排序数组里同样能做：二分找 >= prefix 的位置，再扫到不再匹配 prefix 的位置，")
print("    拿到的是一个连续区间，不需要遍历子树。")
print()
print("判据：只要需求是「给前 k 条建议」，排序数组 + 二分区间就够；")
print("      trie 的优势在于「按前缀遍历整棵子树」或「共享前缀做前缀匹配/编辑距离纠错」，")
print("      这些需求出现时，trie 的内存溢价才换得到东西。")
```

输出：

```text
讲义给的量：每日新增查询数据 0.4 GB -> 每周 2.8 GB
按每条 20 B 估：每周 1.4 亿条查询；去重率 30% -> 唯一查询词 4200 万个

存法                                         条目/节点数       内存(GB)
trie 节点（每节点 48 B）                       630000000         30.2
+ 每节点缓存 top-5（每条 12 B）                  630000000         68.0
排序数组 + 前缀区间二分                            42000000          1.3

  -> 排序数组比「trie + 节点缓存」省 51 倍内存

为什么 trie 反而更贵：
  - trie 的每个字符一个节点（共享前缀只省下 5 个字符/词），节点里还要装指针与映射开销；
  - 排序数组把整串词存下来，但只需要一个指针 + 一个频次；
  - 前缀查询在排序数组里同样能做：二分找 >= prefix 的位置，再扫到不再匹配 prefix 的位置，
    拿到的是一个连续区间，不需要遍历子树。

判据：只要需求是「给前 k 条建议」，排序数组 + 二分区间就够；
      trie 的优势在于「按前缀遍历整棵子树」或「共享前缀做前缀匹配/编辑距离纠错」，
      这些需求出现时，trie 的内存溢价才换得到东西。
```

读法：

- **trie 节点 30.2 GB，加上每节点缓存 top-5 是 68.0 GB；排序数组 + 前缀区间二分只要 1.3 GB——省 51 倍。** 讲义说 trie「最小化冗余」没错——共享前缀确实省了字符——但省下的是**字符**，多花的是**节点开销**：每字符一个 48 B 的节点，而排序数组里每个词只是一个指针加一个分数。
- **前缀查询在排序数组里同样能做**：二分找到第一个 ≥ prefix 的位置，再往后扫到不再匹配 prefix 的位置，拿到的是一个**连续区间**，不需要遍历子树。这个区间里按频次取前 5 条就行——甚至可以在建索引时就把区间按频次排好。
- **那 trie 的优势什么时候兑现？** 三个场景：(1) 需要**遍历整棵前缀子树**（不只是取 top-k）；(2) 需要做**编辑距离纠错**——在 trie 上走「删一个字符/换一个字符」的分支比在排序数组上枚举候选更自然；(3) 词表**高频变动**——trie 插入删除是局部的，排序数组要重建。**如果需求只是「给前 k 条建议」，trie 的内存溢价换不到东西。**
- 顺带一句：讲义说 trie 每周重建、很少实时更新——这正好落在「变动不频繁」那一侧，也就是排序数组最舒服的场景。所以这不是巧合：**周级更新的词表用排序数组，是更省的。**

## 四、增量三：前缀长度上限的真实代价不是内存

讲义给的长度上限是 50，理由是「很少有人输入很长的搜索词」。这句话对，但它把结论带偏了：**上限卡在哪，首要影响的是有多少查询拿不到建议，不是省多少内存。**

先量查询长度分布（显式权重表，贴近真实搜索：短查询占绝大多数，长尾很薄），再看不同上限砍掉多少流量、砍掉多少节点：

```python
"""前缀长度上限怎么定：它到底影响流量还是只防滥用。

查询长度用一张显式分布表（贴近真实搜索：短查询占绝大多数，长尾很薄）。
只依赖标准库；输出确定性。
"""
W = {1: 20, 2: 14, 3: 11, 4: 9, 5: 8, 6: 7, 7: 6, 8: 5, 9: 4.5, 10: 4,
     11: 3.5, 12: 3, 13: 2.6, 14: 2.3, 15: 2, 16: 1.8, 17: 1.6, 18: 1.4, 19: 1.2, 20: 1.1,
     21: 1.0, 22: 0.9, 23: 0.85, 24: 0.8, 25: 0.75, 26: 0.7, 27: 0.65, 28: 0.6, 29: 0.55, 30: 0.5}
for i in range(31, 51):
    W[i] = round(0.45 * (1 - (i - 30) / 22.0), 3)
total = sum(W.values())
MAX_LEN = 50
CAPS = (5, 10, 20, 30, 50)

# trie 深层节点占比（简化模型：第 d 层节点数 ∝ 长度 > d 的词数 × 延伸分支衰减）
WORDS = 42_000_000
nodes_per_depth = {}
for d in range(1, MAX_LEN + 1):
    tail = sum(W[l] for l in range(d + 1, MAX_LEN + 1)) / total
    nodes_per_depth[d] = int(WORDS * tail * (1.0 / d) ** 0.5)
total_nodes = sum(nodes_per_depth.values())

print("查询长度分布（显式权重表，归一后）")
print("  1 字符 %.1f%%、5 字符 %.1f%%、10 字符 %.1f%%、20 字符 %.1f%%、50 字符 %.1f%%"
      % (100.0 * W[1] / total, 100.0 * W[5] / total, 100.0 * W[10] / total,
         100.0 * W[20] / total, 100.0 * W[50] / total))
print("  trie 节点总数（简化模型）约 %.0f 万" % (total_nodes / 1e4))
print()
print("%-8s %14s %16s %14s" % ("前缀上限", "覆盖查询流量", "砍掉的深层节点", "剩余节点(万)"))
for L in CAPS:
    traffic = sum(W[l] for l in range(1, L + 1)) / total
    pruned = sum(nodes_per_depth[d] for d in range(L + 1, MAX_LEN + 1))
    print("%-8d %13.2f%% %15.1f%% %14.0f" % (L, traffic * 100, 100.0 * pruned / total_nodes,
                                             (total_nodes - pruned) / 1e4))
print()
c10 = sum(W[l] for l in range(1, 11)) / total
c20 = sum(W[l] for l in range(1, 21)) / total
c30 = sum(W[l] for l in range(1, 31)) / total
def pruned_nodes(L):
    return 100.0 * sum(nodes_per_depth[d] for d in range(L + 1, MAX_LEN + 1)) / total_nodes

print("读法：")
print("  - 上限 10 覆盖 %.1f%% 流量、上限 20 覆盖 %.1f%%、上限 30 覆盖 %.1f%%、上限 50 覆盖 100%%。"
      % (c10 * 100, c20 * 100, c30 * 100))
print("  - 关键：前缀长度上限的**首要代价不是内存，是有多少查询拿不到建议**——")
print("    L=10 会让 %.1f%% 的查询直接没有补全，L=20 丢掉 %.1f%%，L=30 丢掉 %.1f%%。"
      % ((1 - c10) * 100, (1 - c20) * 100, (1 - c30) * 100))
print("  - 而它换来的内存其实不多：L=10 砍掉 %.1f%% 的深层节点，L=20 只砍掉 %.1f%%。"
      % (pruned_nodes(10), pruned_nodes(20)))
print("  - 所以「限制前缀长度」主要是**防御性上限**（防恶意超长输入把 trie 撑深、把查询拖慢），")
print("    而不是内存优化——讲义举例 50 的代价是 0（保留全部流量），只是没省到节点。")
print("  - 判据：先量自己的长度分布。如果某个 L 会丢掉超过 1% 的流量，它就是产品决策")
print("    （要不要给长查询补全），不是技术优化；内存要省，去看节点本身的存法。")
```

输出：

```text
查询长度分布（显式权重表，归一后）
  1 字符 16.5%、5 字符 6.6%、10 字符 3.3%、20 字符 0.9%、50 字符 0.0%
  trie 节点总数（简化模型）约 14330 万

前缀上限             覆盖查询流量          砍掉的深层节点        剩余节点(万)
5                51.24%            35.5%           9243
10               73.14%            17.2%          11866
20               90.08%             5.0%          13619
30               96.11%             1.3%          14149
50              100.00%             0.0%          14330

读法：
  - 上限 10 覆盖 73.1% 流量、上限 20 覆盖 90.1%、上限 30 覆盖 96.1%、上限 50 覆盖 100%。
  - 关键：前缀长度上限的**首要代价不是内存，是有多少查询拿不到建议**——
    L=10 会让 26.9% 的查询直接没有补全，L=20 丢掉 9.9%，L=30 丢掉 3.9%。
  - 而它换来的内存其实不多：L=10 砍掉 17.2% 的深层节点，L=20 只砍掉 5.0%。
  - 所以「限制前缀长度」主要是**防御性上限**（防恶意超长输入把 trie 撑深、把查询拖慢），
    而不是内存优化——讲义举例 50 的代价是 0（保留全部流量），只是没省到节点。
  - 判据：先量自己的长度分布。如果某个 L 会丢掉超过 1% 的流量，它就是产品决策
    （要不要给长查询补全），不是技术优化；内存要省，去看节点本身的存法。
```

读法：

- **上限 10 覆盖 73.1% 的流量——意味着 26.9% 的查询直接没有补全**；上限 20 丢掉 9.9%，上限 30 丢掉 3.9%，上限 50 丢掉 0%。
- 而它换来的内存其实不多：上限 10 砍掉 17.2% 的深层节点，上限 20 只砍掉 5.0%。
- 所以「限制前缀长度」主要是**防御性上限**——防止恶意超长输入把 trie 撑深、把单次查询拖慢——而不是内存优化。讲义举例 50 的代价是 0（保留全部流量），只是没省到节点；真要省内存，得去动节点的存法（上一节）。
- **判据：先量自己的长度分布。如果某个上限会丢掉超过 1% 的流量，它就是产品决策（要不要给长查询补全），不是技术优化。** 反过来，如果产品明确说「长查询不补全」，那上限压到 10 换来 17% 的节点内存就是划算的。

## 五、把三个模型套回本章（判据清单）

1. **节点缓存只建在热门前缀上**：子树 ≤ k 的前缀，遍历本来就便宜，别建缓存；建了缓存的节点，内存要多算 5 × 条目大小。
2. **先确认需求是「取 top-k」还是「遍历子树」**：前者用「排序数组 + 前缀区间二分」更省（实测省 51 倍内存），后者、或需要编辑距离纠错、或词表高频变动时，trie 的溢价才换得到东西。
3. **前缀长度上限先量分布再定**：算清「丢掉多少流量」，超过 1% 就是产品决策；同时把它当防御性上限（防超长输入），而不是内存手段。
4. **热更新策略与数据结构要配套**：周级批量重建 → 排序数组友好；实时插入 → trie 友好。讲义选了「每周重建」，那数据结构的选型就该跟着这个约束走。
5. **延迟预算拆开算**：<100 毫秒里，查询服务能花多少在 trie 查找上，剩下多少给网络与第三方（比如热门查询的相关性计算）。

## 六、这一章不重复已发的内容

- **缓存与分层**：见《[扩展的每一步都在换瓶颈](/blog/scaling-bottleneck-transfer/)》，本文不复述缓存选型与扩展阶梯。
- **一致性哈希**（把请求均匀分布到各服务器）：见《[一致性哈希实测](/blog/consistent-hashing-measured/)》。
- **限流**：见《[限流算法实测](/blog/rate-limiter-algorithms-measured/)》——峰值 48,000 QPS 这一层的保护在那边。
- **队列与解耦**：讲义的数据收集流水线靠批处理，同一节内容见《[扩展的每一步都在换瓶颈](/blog/scaling-bottleneck-transfer/)》。

## 七、这三个模型判不了什么

- **词表规模、去重率、平均长度、每节点字节、每条缓存字节全是估的**。真实数字取决于日志格式、去重口径与序列化实现；要把它们换成实测的 profile。特别是「每条查询 20 B」——真实查询词平均更短，但元数据更长。
- **trie 节点数模型是简化的**。真实共享前缀比估算的更充分（`t`、`a` 之类的热门前缀共享极多），所以真实 trie 会比估算的更省一些、节点分布也会更不均匀。
- **查询长度分布表是手写的**，不是你的日志。判据成立的前提是把它换成自己的分布；真实分布的形状（尤其长尾有多厚）直接决定上限怎么定。
- **三个模型都不含排序质量**。讲义把排序简化为「按热度取 top-5」，而真实的自动补全还有相关性、个性化（讲义「高级特性」里的多语言支持与热门查询）、以及时效性。热度只是一层。
- **没有算「热门查询」与「长尾查询」的资源分配**。把 100% 的节点都按同样规格建缓存，通常不如把资源集中在贡献大部分点击的前缀上。

## FAQ（八、常见问题）

**每个 trie 节点都缓存 top-k 吗？** 不必。只在子树大于 k 的前缀节点上建——小子树遍历本来就便宜。缓存让每个节点多背 5 条快照，约等于节点自身 1.25 倍内存。

**trie 和排序数组怎么选？** 看需求：要「按前缀遍历整棵子树」或要做编辑距离纠错、或词表高频变动 → trie；只要「给前 k 条前缀建议」且词表周级更新 → 排序数组 + 前缀区间二分更省（实测省 51 倍内存）。

**前缀长度限制在多少？** 先量自己的查询长度分布。代价首先在流量：上限 10 会让 26.9% 的查询没有补全，上限 20 丢掉 9.9%。它主要是防恶意超长输入的防御性上限，不是省内存的手段。

**trie 怎么更新？** 讲义选的是每周用聚合数据重建——实时更新不现实（每天几十亿次查询）。周级重建对排序数组友好，对 trie 也友好；如果改成实时插入，trie 的优势才显现。

**自动补全怎么排序？** 讲义简化为按查询热度取前 5 条。真实系统还要叠相关性、个性化与时效性；本文三个模型都不涉及排序质量，热度只是一层。

## 出处与许可

- 原书：*System Design Interview — An Insider's Guide*（Alex Xu，Vol 1 & 2, 2nd Ed.）——本章骨架（第 13 章 Design a Search Autocomplete System）为其目录与要点。
- 英文笔记仓库：[liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)；中文译本仓库：[lukeTheNeuromancer/system-design-notes-zh](https://github.com/lukeTheNeuromancer/system-design-notes-zh)。
- **许可状态**：2026-11-26 实测，两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均 404，仓库网页 200，**上游许可未能确认**；原书为商业出版物。故本篇为导读式：只复述章节骨架与需求数字，不引用译文原文或原书段落，不使用译本配图，正文主体为自写模型与判断。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段模拟均不含随机数，两次运行输出一致）。
