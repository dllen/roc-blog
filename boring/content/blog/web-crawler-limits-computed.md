---
title: "爬虫的三件事可以算出来：规范化、礼貌上限与近重复"
date: "2026-11-26"
description: "《系统设计面试内幕指南》第 9 章把网络爬虫拆成 URL 边界、下载器、去重与礼貌性。这篇不复述译文，而是给三件事各配一个可跑的模型——URL 规范化的安全规则与红线、按域名限速下的吞吐上限公式、以及从整页哈希到 SimHash 近重复的阈值该怎么定。"
tldr: "礼貌抓取的吞吐上限 = min(线程数/延迟, 主机数×每主机 rps)：要撑住峰值 800 次/秒、每主机 1 rps，至少得覆盖 800 个主机。近重复去重的阈值不能照抄——「汉明距离 3」在中文短文上什么都抓不到，模板化近重复实测到 10 位。"
keywords: ["网络爬虫", "URL 规范化", "礼貌抓取", "SimHash", "系统设计"]
taxonomies:
  tags: ["系统设计", "架构设计", "读书笔记", "爬虫"]
---

爬虫的三件事可以算出来：URL 怎么规范化才不丢内容、按域名限速之后还能跑到多少 QPS、两个页面算不算重复。讲义把这三件事都留成了经验判断——「保证同一时刻对同一主机只有一个请求」「用哈希比对检查重复」「用 URL 长度限制避免无限循环」。经验判断没法验收，下面给三件能跑的模型。

这篇不复述译文，也不搬运中文译本的任何段落。它复述这一章的骨架（需求数字、组件清单、三条工作流），然后补三个自写模型：**URL 规范化的安全规则与红线**、**礼貌抓取的吞吐上限**、**从整页哈希到 SimHash 近重复的阈值该怎么定**。

## 口径说明

- 源笔记是 Alex Xu《System Design Interview — An Insider's Guide》第 9 章的社区中译。上游两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均返回 404，**上游许可未能确认**；原书是商业出版物。故本篇为导读式：只复述章节骨架与需求数字，不引用译文原文或原书段落，不使用译本配图，正文主体是自写模型与判断。
- 三个脚本均为自写增量，只依赖 Python 标准库；输出为实跑结果，逐行可复现（脚本 c 的阈值扫描表与 B 的离散事件仿真都不含随机数）。
- 与已发文章的重叠见「这一章不重复已发的内容」一节。

## 一、本章骨架：五个数字与十一个组件

**需求（四个数字）**：只收 HTML；每月 10 亿个网页，折算 400 页/秒、峰值 800 QPS；要跟踪新增与更新；忽略重复内容。数据存 5 年，约 30 PB。

**组件（按数据流排）**：种子 URL → URL 边界（frontier，待下载队列）→ HTML 下载器（配 DNS 解析器）→ 内容解析器（校验、丢弃畸形页）→ 内容是否已见（哈希比对）→ 内容存储（热门内容放内存）→ URL 提取器（从解析结果抽新链接）→ URL 过滤器（黑名单与非法 URL）→ URL 是否已见（去重）→ URL 存储。

**工作流程（五步）**：种子进 frontier → 下载器取 URL 并解析 IP → 解析器校验并交给「内容是否已见」→ 新内容才提取链接 → 过滤去重后回灌 frontier。

讲义给的设计挑战有四个：可扩展性（并行处理数十亿页）、健壮性（坏 HTML、崩溃、恶意链接）、礼貌性（别把别人的服务器压垮）、以及功能上的可扩展（加新内容类型只改模块）。这四个挑战里，**礼貌性最容易被写成口号**，因为它没有数字。下面第二节到第四节各给一个数字。

## 二、增量一：URL 规范化的安全规则与红线

URL 过滤器和「URL 是否已见」是爬虫里最便宜的两个组件，也是最容易埋雷的两个。规范化规则一旦写错，症状是**静默丢内容**——页面确实抓到了，但因为两个 URL 被并成同一个 key，其中一份永远不会被抓。

安全的规则是那些不改变「这个 URL 指向什么」的规则：scheme 与 host 转小写、去掉默认端口、去掉 fragment、query 参数排序、去掉末尾斜杠。危险的规则是那些看起来像「清理」、实际改掉语义的规则：丢掉整个 query、path 转小写、合并 www 与裸域、把 http 与 https 当成同一个。

```python
"""URL 规范化：哪些规则安全，哪些会改掉语义。

只依赖标准库；输出确定性。
"""
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

def normalize(url, drop_query=False, lower_path=False, merge_www=False, merge_scheme=False):
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = parts.hostname.lower() if parts.hostname else ""
    netloc = host
    if parts.port and not ((scheme == "http" and parts.port == 80) or (scheme == "https" and parts.port == 443)):
        netloc = "%s:%d" % (host, parts.port)
    path = parts.path or "/"
    if lower_path:
        path = path.lower()
    if len(path) > 1 and path.endswith("/"):
        path = path.rstrip("/")
    query = ""
    if not drop_query and parts.query:
        query = urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True)))
    if merge_www and host.startswith("www."):
        netloc = host[4:]
    if merge_scheme:
        scheme = "http"
    return urlunsplit((scheme, netloc, path, query, ""))

def show(u):
    return u.replace("http://", "").replace("https://", "")

SAFE = [
    ("scheme 与 host 转小写", "http://Example.COM/A"),
    ("去掉默认端口", "http://example.com:80/a"),
    ("去掉 fragment", "http://example.com/a#section"),
    ("query 参数排序", "http://example.com/a?b=2&a=1"),
    ("去掉末尾斜杠", "http://example.com/a/"),
]
DANGER = [
    ("丢掉整个 query", "http://example.com/a?id=7", dict(drop_query=True)),
    ("path 转小写", "http://example.com/Article", dict(lower_path=True)),
    ("合并 www 与裸域", "http://www.example.com/a", dict(merge_www=True)),
]
print("安全规则（默认可以开）")
for name, sample in SAFE:
    print("  %-16s %-26s -> %s" % (name, show(sample), show(normalize(sample))))
print()
print("危险规则（会改掉语义，不能默认开）")
for name, sample, kw in DANGER:
    print("  %-16s %-26s -> %s" % (name, show(sample), show(normalize(sample, **kw))))
print("  %-16s %-26s -> %s" % ("http 与 https 合并", "http://example.com/a vs https://example.com/a",
                               show(normalize("http://example.com/a", merge_scheme=True))))
print()
GROUPS = [
    ("同一资源的 5 个变体", [
        "http://example.com/a",
        "http://example.com/a/",
        "http://Example.com/a",
        "http://example.com:80/a",
        "http://example.com/a#top",
    ]),
    ("同一带参资源的 2 个变体", [
        "http://example.com/a?b=2&a=1",
        "http://example.com/a?a=1&b=2",
    ]),
]
for label, variants in GROUPS:
    canon = sorted(set(normalize(u) for u in variants))
    print("%s -> 折叠成 %d 个规范形式：%s" % (label, len(canon), "、".join(show(c) for c in canon)))
print()
print("把危险规则也开上的后果：")
loose = sorted(set(normalize(u, drop_query=True) for u in GROUPS[0][1] + GROUPS[1][1]))
print("  丢 query 后两组被并成 %d 个 key，/a?id=7 与 /a?id=8 会共用一个 key —— 内容不同却只抓一次" % len(loose))
both = sorted(set(normalize(u, merge_scheme=True) for u in ["http://example.com/a", "https://example.com/a"]))
print("  合并 scheme 后 http 与 https 共用 %d 个 key，而两者往往指向不同内容或重定向链" % len(both))
```

输出：

```text
安全规则（默认可以开）
  scheme 与 host 转小写 Example.COM/A              -> example.com/A
  去掉默认端口           example.com:80/a           -> example.com/a
  去掉 fragment      example.com/a#section      -> example.com/a
  query 参数排序       example.com/a?b=2&a=1      -> example.com/a?a=1&b=2
  去掉末尾斜杠           example.com/a/             -> example.com/a

危险规则（会改掉语义，不能默认开）
  丢掉整个 query       example.com/a?id=7         -> example.com/a
  path 转小写         example.com/Article        -> example.com/article
  合并 www 与裸域       www.example.com/a          -> example.com/a
  http 与 https 合并  http://example.com/a vs https://example.com/a -> example.com/a

同一资源的 5 个变体 -> 折叠成 1 个规范形式：example.com/a
同一带参资源的 2 个变体 -> 折叠成 1 个规范形式：example.com/a?a=1&b=2

把危险规则也开上的后果：
  丢 query 后两组被并成 1 个 key，/a?id=7 与 /a?id=8 会共用一个 key —— 内容不同却只抓一次
  合并 scheme 后 http 与 https 共用 1 个 key，而两者往往指向不同内容或重定向链
```

读法：

**第一，折叠不是越多越好。** 同一资源的 5 个变体在安全规则下折叠成 1 个规范形式，同一带参资源的 2 个变体也折叠成 1 个——这才是想要的。而一旦把「丢 query」也开上，两组资源会并成同一个 key，`/a?id=7` 与 `/a?id=8` 共用一条记录，**内容不同却只抓一次**。这类 bug 在日志里完全看不出来：抓取计数正常、错误率正常，只是有一半内容悄悄缺失。

**第二，四条危险规则的危险程度不一样。** 丢 query 是内容级丢失；path 转小写在 Linux 上通常安全，但在大小写不敏感的文件系统或大小写敏感的路由上会指向不同资源；合并 www 与裸域多数站点会 301，但也有站点两个域名给不同内容；http 与 https 合并最隐蔽——两者常常一个 301 到另一个，但**也常常各自有效**，且重定向链本身有时是内容的一部分。

**第三，规范化规则要写成一个可审计的清单。** 讲义里 URL 过滤器只写了一句「排除黑名单或错误 URL」。可用的形式是像上面输出那样的两栏表：默认开启的安全规则（每条给出样例），默认关闭的危险规则（每条给出「会丢什么」的说明）。这份表也是 code review 里唯一能检查的东西——「你规范化了 path 吗」是问不出来的，「你的规范化规则表里 path 转小写在哪一栏」是能问出来的。

## 三、增量二：礼貌抓取的吞吐上限

讲义对礼貌性的描述是结构性的：保证同一时刻对同一主机只有一个请求，两次下载之间加延迟；用「主机名 → 队列」的映射表，每个下载线程只从自己那条队列取 URL。这套结构有一个可以直接算出来的上限：

**吞吐上限 = min(全局线程数 ÷ 单请求延迟, 主机数 × 每主机 rps 上限)**

两项分别对应两种撞墙方式：线程数不够，或者**没有足够多的主机可以礼貌地分散请求**。下面这个离散事件仿真把这条公式和实际行为对齐：每台主机一个队列与最小请求间隔，全局线程各自轮转主机，frontier 足够大（每主机 500 条待抓 URL，不会被清空）。

```python
"""礼貌抓取的吞吐上限：把「不要压垮服务器」算成一条可用的判据。

离散事件仿真：时间步长固定，主机轮转选取，frontier 充足，无随机数 -> 输出确定性。
"""
STEP = 0.01
HORIZON = 20.0
QUEUE_PER_HOST = 500      # 每主机待抓 URL 数（frontier 足够大，不会被清空）


def simulate(n_hosts, per_host_rps, workers, latency):
    hosts = ["h%03d.example" % i for i in range(n_hosts)]
    pending = [QUEUE_PER_HOST] * n_hosts
    next_allowed = [0.0] * n_hosts
    busy_until = [0.0] * n_hosts
    worker_free = [0.0] * workers
    cursor = [0] * workers          # 每个线程的轮转游标，保证请求分散到不同主机
    host_req = [0] * n_hosts
    host_last = [-1.0] * n_hosts
    min_gap = [1e9] * n_hosts
    completed = 0
    now = 0.0
    while now < HORIZON:
        for w in range(workers):
            if worker_free[w] > now + 1e-9:
                continue
            for k in range(n_hosts):
                hi = (cursor[w] + k) % n_hosts
                if pending[hi] <= 0 or busy_until[hi] > now + 1e-9 or next_allowed[hi] > now + 1e-9:
                    continue
                pending[hi] -= 1
                host_req[hi] += 1
                if host_last[hi] >= 0:
                    gap = now - host_last[hi]
                    if gap < min_gap[hi]:
                        min_gap[hi] = gap
                host_last[hi] = now
                worker_free[w] = now + latency
                busy_until[hi] = now + latency
                next_allowed[hi] = now + 1.0 / per_host_rps
                cursor[w] = (hi + 1) % n_hosts
                completed += 1
                break
        now += STEP
    ideal = min(workers / latency, n_hosts * per_host_rps)
    gaps = [g for g in min_gap if g < 1e8]
    return completed, completed / HORIZON, ideal, (min(gaps) if gaps else 0.0), sum(host_req)


print("%-34s %8s %9s %8s %10s" % ("配置", "实测/s", "公式上限", "达成率", "最小间隔"))
CASES = [
    ("1000 主机 x 1 rps, 50 线程", 1000, 1.0, 50, 0.20),
    ("200 主机 x 1 rps, 50 线程", 200, 1.0, 50, 0.20),
    ("200 主机 x 1 rps, 100 线程", 200, 1.0, 100, 0.20),
    ("2000 主机 x 1 rps, 50 线程", 2000, 1.0, 50, 0.20),
]
for label, nh, rps, w, lat in CASES:
    c, obs, ideal, mingap, per = simulate(nh, rps, w, lat)
    print("%-34s %8.1f %9.1f %7.1f%% %10.3f" % (label, obs, ideal, 100.0 * obs / ideal, mingap))
print()
print("公式：吞吐上限 = min(全局线程数 / 单请求延迟, 主机数 x 每主机 rps 上限)")
print("读法：主机数远大于线程数时礼貌不是瓶颈；主机数掉到与线程数同量级时，先撞礼貌上限。")
print()
need_peak = 800.0
for rps in (0.5, 1.0, 2.0):
    print("  峰值需求 %d/s、每主机 %.1f rps -> 至少 %.0f 个主机才不撞礼貌上限"
          % (need_peak, rps, need_peak / rps))
```

输出：

```text
配置                                     实测/s      公式上限      达成率       最小间隔
1000 主机 x 1 rps, 50 线程                250.0     250.0   100.0%      4.000
200 主机 x 1 rps, 50 线程                 200.0     200.0   100.0%      1.000
200 主机 x 1 rps, 100 线程                200.0     200.0   100.0%      1.000
2000 主机 x 1 rps, 50 线程                250.0     250.0   100.0%      8.000

公式：吞吐上限 = min(全局线程数 / 单请求延迟, 主机数 x 每主机 rps 上限)
读法：主机数远大于线程数时礼貌不是瓶颈；主机数掉到与线程数同量级时，先撞礼貌上限。

  峰值需求 800/s、每主机 0.5 rps -> 至少 1600 个主机才不撞礼貌上限
  峰值需求 800/s、每主机 1.0 rps -> 至少 800 个主机才不撞礼貌上限
  峰值需求 800/s、每主机 2.0 rps -> 至少 400 个主机才不撞礼貌上限
```

三处值得停下来：

**第一，仿真与公式完全吻合（达成率 100%），所以这条公式可以直接用来做容量决策。** 1000 台主机时吞吐撞在 250/s（= 50 线程 ÷ 0.2 秒延迟），礼貌完全不是瓶颈；把主机数砍到 200 台，吞吐掉到 200/s，**瓶颈从算力换成了礼貌**，再加算力也没用——把线程加到 100 个仍然是 200/s。这正是「礼貌性是个工程约束而不是态度」的意思。

**第二，把本章需求代进去，结论是一个具体数字。** 峰值需求 800 QPS，每主机 1 rps → 至少要覆盖 800 台主机才不撞礼貌上限；每主机 0.5 rps → 1600 台；每主机 2 rps → 400 台。也就是说，**「爬多快」和「覆盖多少个站点」是同一个约束的两端**：想提高峰值吞吐，加线程要同时加站点数。

**第三，仿真里「最小间隔」这一列是礼貌性的自证。** 每主机 rps=1 时实测最小请求间隔是 1.000 秒，没有出现任何违反间隔的请求。这行数字的价值在于：礼貌性是**可以验收的**——你可以从抓取日志里算出每个域名的最小请求间隔，然后对表，而不是靠人回忆「我们好像限速了」。

## 四、增量三：从「完全相同」到「近重复」

讲义给的内容去重只有一句：内容是否已见，用哈希比对检查重复。这能抓住**逐字节相同**的页面，但抓不到真实网络里大量存在的近重复：同一个模板加不同导航与广告、镜像站、同一个活动的不同报名页、只改了标题的列表页。这些在抓取侧表现为重复存储，在索引侧表现为同一篇内容被搜出多次。

SimHash 把这件事变成可调的：把页面切成 5 词 shingle，逐个算 64 位指纹，再取汉明距离。

```python
"""内容去重：从「哈希完全相同」到「近重复」的距离。

讲义只给哈希比对；真实网络里大量是近重复（模板、镜像、轻微改动）。
这里用 64 位 SimHash 实跑，并给出汉明距离与阈值判定。

分词要兼容中文：汉字按单字切，英文数字按词切。
只依赖标准库；输出确定性。
"""
import hashlib, re

TOKEN_RE = re.compile(r"[a-z0-9]+|[\u4e00-\u9fff]")

def tokens(text):
    text = re.sub(r"<[^>]+>", " ", text.lower())
    return TOKEN_RE.findall(text)

def shingles(toks, k=5):
    if len(toks) < k:
        return [" ".join(toks)] if toks else []
    return [" ".join(toks[i:i + k]) for i in range(len(toks) - k + 1)]

def simhash(text, bits=64):
    counts = [0] * bits
    shs = shingles(tokens(text))
    for sh in shs:
        h = int(hashlib.md5(sh.encode()).hexdigest(), 16)
        for b in range(bits):
            counts[b] += 1 if (h >> b) & 1 else -1
    out = 0
    for b in range(bits):
        if counts[b] > 0:
            out |= 1 << b
    return out

def distance(a, b):
    return bin(a ^ b).count("1")

BASE = "本页介绍系统设计的常见问题：缓存、分片、限流、幂等与一致性。展开讲缓存穿透与击穿的区别，" \
       "分片键选择要考虑热点与再平衡，限流要同时照顾突发与公平，幂等依赖请求号而不是业务顺序，" \
       "一致性要区分读己之写与因果顺序。"
OTHER = "分布式锁的实现有哪几种：基于数据库的唯一约束、基于缓存的原子写入、基于 ZooKeeper 的临时顺序节点，" \
        "以及各方案在容错与性能上的取舍，需要结合一致性要求来选。"

DOCS = [
    ("原文", BASE),
    ("完全相同", BASE),
    ("改了一个词", BASE.replace("幂等依赖请求号", "幂等要依赖请求号")),
    ("模板化近重复", BASE + " 导航：首页 产品 文档 关于 招聘 广告 登录 注册 站点地图 联系方式 隐私政策"),
    ("另一篇文章", OTHER),
]
THRESHOLD = 3
base_hash = simhash(BASE)
print("64 位 SimHash，5 词 shingle；初始阈值 %d，下方给出阈值扫描与可行区间" % THRESHOLD)
print("%-16s %18s %8s %8s" % ("样本", "SimHash", "汉明距", "判定"))
for label, text in DOCS:
    h = simhash(text)
    d = distance(base_hash, h)
    print("%-16s %18x %8d %8s" % (label, h, d, "近重复" if d <= THRESHOLD else "不同"))
print()
print("讲义给的办法（整页哈希比对）：完全相同 -> %s；模板化近重复 -> %s"
      % ("判定为重复" if hash(BASE) == hash(DOCS[1][1]) else "判定为不同",
         "判定为重复" if hash(BASE) == hash(DOCS[3][1]) else "判定为不同（抓取两份）"))
print()
d_edit = distance(base_hash, simhash(DOCS[2][1]))
d_tmpl = distance(base_hash, simhash(DOCS[3][1]))
d_other = distance(base_hash, simhash(DOCS[4][1]))
print("各样本与原文的汉明距：改一个词 %d、模板化近重复 %d、完全不相干 %d" % (d_edit, d_tmpl, d_other))
print()
print("阈值扫描（阈值越大越激进）：")
print("%-8s %s" % ("阈值", "被判为近重复的样本"))
for t in (0, 3, 6, 10, 12, 16, 26):
    caught = [label for label, text in DOCS[1:] if distance(base_hash, simhash(text)) <= t]
    print("%-8d %s" % (t, "、".join(caught) if caught else "（无）"))
print()
lo = d_tmpl
hi = d_other
print("可行区间：想抓到模板化近重复需要阈值 >= %d，而要不误收无关文章需要阈值 < %d" % (lo, hi))
print("  -> 可行区间 [%d, %d)，本样本取 12（两侧各留余量）" % (lo, hi))
print("  -> 注意：阈值 3 在这份中文语料上什么都抓不到（模板化近重复已到 %d 位），" % d_tmpl)
print("     说明「汉明距离 3」是英文长文的经验值，不能照抄到中文短文；")
print("     而改一个词的样本距 %d 位，会被阈值 12 一并收进来——这通常是想要的，" % d_edit)
print("     因为改一个词的页面确实仍然是近重复。")
```

输出：

```text
64 位 SimHash，5 词 shingle；初始阈值 3，下方给出阈值扫描与可行区间
样本                          SimHash      汉明距       判定
原文                 c85299b611e476ed        0      近重复
完全相同               c85299b611e476ed        0      近重复
改了一个词              c8509b3615c476cd        6       不同
模板化近重复             cd5289bc13c4e66d       10       不同
另一篇文章              7d3cd07619ab7a45       26       不同

讲义给的办法（整页哈希比对）：完全相同 -> 判定为重复；模板化近重复 -> 判定为不同（抓取两份）

各样本与原文的汉明距：改一个词 6、模板化近重复 10、完全不相干 26

阈值扫描（阈值越大越激进）：
阈值       被判为近重复的样本
0        完全相同
3        完全相同
6        完全相同、改了一个词
10       完全相同、改了一个词、模板化近重复
12       完全相同、改了一个词、模板化近重复
16       完全相同、改了一个词、模板化近重复
26       完全相同、改了一个词、模板化近重复、另一篇文章

可行区间：想抓到模板化近重复需要阈值 >= 10，而要不误收无关文章需要阈值 < 26
  -> 可行区间 [10, 26)，本样本取 12（两侧各留余量）
  -> 注意：阈值 3 在这份中文语料上什么都抓不到（模板化近重复已到 10 位），
     说明「汉明距离 3」是英文长文的经验值，不能照抄到中文短文；
     而改一个词的样本距 6 位，会被阈值 12 一并收进来——这通常是想要的，
     因为改一个词的页面确实仍然是近重复。
```

这份输出里有三个和直觉相反的结果：

**第一，「汉明距离 3」在中文短文上抓不到任何近重复。** 模板化近重复实测 **10 位**、改一个词 **6 位**、完全无关 **26 位**。社区里流行的阈值 3 是英文长文的经验值，照抄到中文语料上会**一个近重复都抓不到**，而抓不到的原因是模板差异落在了长文档里占小比例、在短文档里占大比例。阈值必须在自己的语料上实测。

**第二，阈值存在可行区间，而且区间是可以算出来的。** 想抓到模板化近重复需要阈值 ≥ 10，要不误收无关文章需要阈值 < 26，所以可行区间是 [10, 26)；本样本取 12，两侧各留余量。这是「阈值」这种魔数唯一的正确用法：**先量距离分布，再定阈值**，而不是抄一个数。

**第三，改一个词的样本（6 位）会被阈值 12 一并收进来——这通常正是想要的**，因为只改了一个词的页面确实仍然是近重复。反过来，真正的风险不在阈值，在**用途**：抓取侧想去重可以用 12，索引侧判「同一篇文章」需要更严的阈值（甚至要上 MinHash + 集合 Jaccard 阈值），而判断「两个页面是否同一模板」要的又是另一套特征。同一份距离，套三个用途，三个阈值。

## 五、把三个模型套回本章需求

1. **规范化规则表**入库前先过一遍：默认开启的五条安全规则 + 四条危险规则的开关理由。危险规则要开，必须写明它会丢什么类型的内容。
2. **峰值 QPS 反推站点覆盖量**：按 `主机数 ≥ 峰值 QPS ÷ 每主机 rps` 估一遍，再对照 frontier 的规模——frontier 太小会让爬虫「闲下来等 URL」，太大则让内存和去重存储吃紧。
3. **礼貌性做可验收指标**：从抓取日志算每个域名的最小请求间隔与实际 QPS，超限告警。这比 robots.txt 声明更能反映真实行为。
4. **去重分两层**：抓取侧用 SimHash 阈值 12 一类的值挡掉近重复，索引侧用更严的判据；两层不要共用一个阈值。
5. **蜘蛛陷阱用 URL 长度与规范化兜底**：讲义提到用 URL 长度限制避免无限循环，这条与规范化规则直接相关——**规范化会缩短 URL，也会改变 URL**，所以长度阈值要在规范化之后计算。

## 六、这一章不重复已发的内容

- **一致性哈希**（服务器间分担负载）：已单独成文《[一致性哈希实测](/blog/consistent-hashing-measured/)》，本文不复述。
- **限流**（按 IP 限速保护服务）：已有专门文章，本文只讨论「对外部站点限速」这一侧。
- **水平扩展与缓存**：见《[扩展的每一步都在换瓶颈](/blog/scaling-bottleneck-transfer/)》。
- **服务器渲染与反垃圾**：本章「其他考量」提到，属于另开主题的范畴。

## 七、这三个模型判不了什么

- **礼貌模型假设请求延迟是常数**。真实抓取的延迟分布很重尾（慢站点、超时），用平均值算线程数会低估所需线程数。
- **rps 上限是拍出来的**。robots.txt 里的 Crawl-delay 是一个下限而不是上限，真实上限取决于对方服务器的承受能力；模型给的是「在给定上限下的吞吐」，不是「对方能承受的上限」。
- **规范化规则的真实风险在站点自己的路由上**。同一个 URL 在不同站点可能一个返回列表页、一个返回详情页；「path 转小写是否安全」没有全局答案，只能按站点域名单独定策。
- **SimHash 的距离依赖分词与文档长度**。中文按单字切、英文按词切，换成 jieba 分词或做词干化，距离分布会变，阈值要重测。
- **三个模型都不含反爬对抗**：robots.txt 只是声明，不是防护。

## FAQ（八、常见问题）

**URL 规范化哪些规则能默认开？** scheme/host 转小写、去默认端口、去 fragment、query 排序、去末尾斜杠这五条一般安全。丢 query、path 转小写、合并 www、合并 http/https 都不能默认开——它们会静默丢内容，且症状在日志里看不见。

**爬虫要多快才不影响目标站点？** 先定每主机 rps 上限，再按 `主机数 ≥ 峰值 QPS ÷ 每主机 rps` 估覆盖量，然后加线程把单请求延迟造成的上限抬上去。两者是串联的，先撞哪一个取决于主机数与线程数的比值。

**为什么不用整页哈希判重复？** 整页哈希只认逐字节相同，模板化近重复、改一个词的页面都抓不到；实测这类样本的汉明距离是 6~10 位，用 SimHash + 实测阈值才能覆盖。

**SimHash 阈值定多少？** 先测自己的语料：近重复样本与无关样本的距离分布，中间那段就是可行区间。本样本是 [10, 26)，取 12。英文社区常用的 3 在中文短文上等于零召回。

**robots.txt 能替代限速吗？** 不能。robots.txt 是声明（哪些路径不许抓），限速是行为约束（每秒最多几次）。声明不执行就要自己执行，而"执行了"的证据是日志里的最小请求间隔。

## 出处与许可

- 原书：*System Design Interview — An Insider's Guide*（Alex Xu，Vol 1 & 2, 2nd Ed.）——本章骨架（第 9 章 Design a Web Crawler）为其目录与要点。
- 英文笔记仓库：[liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)；中文译本仓库：[lukeTheNeuromancer/system-design-notes-zh](https://github.com/lukeTheNeuromancer/system-design-notes-zh)。
- **许可状态**：2026-11-26 实测，两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均 404，仓库网页 200，**上游许可未能确认**；原书为商业出版物。故本篇为导读式：只复述章节骨架与需求数字，不引用译文原文或原书段落，不使用译本配图，正文主体为自写模型与判断。
- 本文三个脚本为自写增量，仅依赖 Python 标准库（`urllib.parse`、`hashlib`、`re`），在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（脚本 b 的离散事件仿真与脚本 c 的阈值扫描均无随机数，两次运行输出一致）。
