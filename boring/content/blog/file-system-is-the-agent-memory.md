---
title: "Agent 的记忆，90% 是 1996 年的文件系统"
date: 2026-09-01
description: "Agent 的长期记忆靠 RAG，短期记忆靠 context window。但如果你仔细看它的本质——持久化、检索、过期、压缩——你会发现这不过是 Linux 文件系统在几十年前就解决过的问题。/var/log、/tmp、crontab，这些目录和机制早已蕴含了 Agent 记忆系统的所有设计要素。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Linux", "RAG", "Memory", "文件系统"]
extra:
  update_date: 2026-09-01
---

前两篇聊了 Agent 的"基础设施"和"工具调用"——分别对应 Linux 的进程管理和 SSH 远程执行。有读者接着问：那 Agent 的"记忆"呢？

RAG（检索增强生成）是目前最热门的 Agent 记忆方案。但 RAG 的核心问题——把信息存下来、需要时找出来、保持新鲜、处理容量限制——Linux 文件系统在 90 年代就逐一解决过了。

这篇文章把 Agent 记忆的每个维度还原到文件系统，看看那些看似现代的技术，背后站着怎样的老前辈。

---

## 1. 记忆的本质：持久化 + 检索

Agent 的记忆系统要解决两个根本问题：

1. **存进去**：把对话、工具调用结果、提取的知识持久化
2. **找出来**：给定当前上下文，从记忆里召回相关的内容

Linux 的文件系统也是同样的模型：

```bash
# 存进去：写文件
echo "2026-09-01: 用户问了 Agent 安全问题" >> /var/log/agent/memory.log

# 找出来：grep 检索
grep "Agent 安全" /var/log/agent/memory.log
```

区别只在于规模：Agent 的记忆可能有几百万条对话片段，Linux 的日志可能有几百 GB。但"写 + 检索"的核心操作是一样的。

---

## 2. 短期记忆：context window = /tmp

LLM 的 context window 是有限的一次性记忆空间——能装下的 token 是固定的，超出就消失。这在 Linux 里对应的是 **/tmp 目录**：

```bash
# /tmp 是内存文件系统，重启即清空
# 对应 context window：对话结束即释放
mount | grep tmpfs
# tmpfs on /tmp type tmpfs (rw,nosuid,nodev)

# 临时工作文件
mktemp
# /tmp/tmp.xKj9Lm

# 定期清理（防止磁盘占满）
find /tmp -type f -atime +7 -delete  # 7天未访问的文件删掉
```

Agent 的"当前会话上下文"就是 /tmp——有大小限制（context window），会话结束就清空，每次新会话都从零开始。Linux 用 `tmpfs` 和 `find -delete` 管理 /tmp，Agent 框架用 context truncation 和 session reset 管理 context。

**关键认知**：context window 不是存储，是工作内存。RAG 解决的是长期记忆，不是 context。

---

## 3. 长期记忆：向量数据库 = /var/lib

Agent 的长期记忆通常存在向量数据库（Milvus、Pinecone、Chroma）里，通过 embedding 相似度检索。这在 Linux 里对应的是 **/var/lib** 目录：

```bash
# /var/lib：应用持久状态，不属于系统本身
ls /var/lib/
# apt/  docker/  systemd/  agent-bot/

# Agent 的知识库存在这里
/var/lib/agent-bot/
# ├── memories/           # 向量数据库
# ├── sessions/           # 历史会话
# └── learned/           # 持续学习产物
```

**文件组织 vs 向量索引**：

| 维度 | Linux 文件系统 | Agent 记忆系统 |
|---|---|---|
| 存储单位 | 文件（inode + data blocks） | 向量 + metadata |
| 检索方式 | 路径查找、grep 内容搜索 | embedding 相似度搜索 |
| 元数据 | stat（大小、时间、权限） | timestamp、source、relevance_score |
| 持久化 | 磁盘 fsync 后即安全 | 数据库 WAL + 定期 flush |
| 备份 | cp、rsync | export + import 向量数据 |

向量数据库做的，是把"文件名 + 路径"的精确匹配，升级成"语义相似度"的模糊匹配——但底层的"存储 + 索引 + 检索 + 过期"四层结构，和文件系统完全一样。

---

## 4. 语义检索：inverted index = man -k

向量检索的核心是：把文本变成向量，存到索引里，查询时算相似度。这在 Linux 里对应的是 **man pages 的 keyword search**：

```bash
# man -k 搜索手册页（反转索引）
man -k "network socket"
# accept (3)           - accept a connection on a socket
# bind (2)              - bind a name to a socket
# connect (2)           - initiate a connection on a socket
# getaddrinfo (3)       - network address and service translation
# socket (2)            - create an endpoint for communication
```

`man -k` 的底层是 `whatis` 数据库（一个反转索引）：把每个 man page 的标题和简短描述提取出来，构建"关键词 → man page"的映射表。查询时，把关键词去索引里匹配，返回所有相关条目。

向量数据库的 inverted index 本质上是一样的：

```
"网络安全" → [doc_042, doc_108, doc_231, ...]
"内存泄漏" → [doc_015, doc_108, doc_377, ...]
"网络 socket" → [doc_042, ...]
```

区别在于匹配粒度：man -k 做关键词精确匹配，向量数据库做语义 embedding 相似度匹配。但从信息检索的角度，两者解决的是同一个问题——如何从大量文档里找到和查询最相关的那些。

---

## 5. 记忆新鲜度：TTL = mtime + find

Agent 记忆的另一个挑战是"过期"——知识会过时，用户偏好会变，几个月前的对话可能已经没用了。

Linux 管理文件过期的方式是 **mtime + find**：

```bash
# 查看文件修改时间
stat /var/lib/agent-bot/memories/old-session.json
# Modify: 2026-06-01 10:23:45.000000000 +0800

# 删掉 90 天前的记忆文件
find /var/lib/agent-bot/memories/ \
    -type f \
    -mtime +90 \
    -delete

# 删掉 30 天未访问的记忆索引
find /var/lib/agent-bot/vector-index/ \
    -type f \
    -atime +30 \
    -delete
```

Agent 框架的 TTL 机制是一样的逻辑，只是粒度更细——可以按"记忆类型"（对话 vs 知识 vs 偏好）、"来源"（用户 vs 系统）、"使用频率"设置不同的过期时间。

```python
# Agent 记忆 TTL 的伪代码
async def cleanup_expired_memories():
    now = datetime.now()
    for memory in memories:
        age = now - memory.created_at
        if age > memory.ttl:  # TTL 可以是 1h、7d、30d 不等
            await delete_from_vector_db(memory.id)
            await delete_from_metadata_db(memory.id)
```

**Linux 的教训**：TTL 设置是个工程问题，不是算法问题。定 7 天太短、记忆召回率低；定 365 天太旧、检索噪音大。Agent 记忆的 TTL 也一样——需要根据实际使用场景调优，不是越大越好。

---

## 6. 记忆压缩：logrotate = summarization

context window 是固定大小，但记忆是无限增长的。Linux 用 **logrotate** 处理日志膨胀：

```bash
# /etc/logrotate.d/agent
/var/log/agent/*.log {
    daily              # 每天轮转
    rotate 14          # 保留 14 个版本
    compress           # 压缩旧日志
    delaycompress      # 昨天的今天再压（方便调试）
    notifempty         # 空日志不轮转
    missingok           # 丢了不报错
    postrotate
        systemctl reload agent > /dev/null 2>&1 || true
    endscript
}
```

Agent 的"记忆压缩"对应的是 **summarization（摘要）**——把大量细节压缩成高层语义：

```python
# 原始记忆：100 条对话
conversations = [
    {"role": "user", "content": "帮我写一个排序算法"},
    {"role": "assistant", "content": "用 Python 写..."},
    # ... 98 more turns
]

# 压缩成摘要
summary = {
    "date": "2026-08-15",
    "topic": "排序算法",
    "key_decisions": ["用户偏好 Python", "最终选择了 quicksort"],
    "outcome": "用户满意，代码保存到 /home/user/sort.py"
}
# 原始 100 条对话 → 1 条摘要
```

logrotate 保留旧日志的压缩包（以备审计），Agent summarization 保留原始记忆的摘要（以备召回）。两者都是"在容量限制下平衡信息保留和检索效率"的机制。

---

## 7. 记忆隔离：namespace = multi-agent memory

多 Agent 系统里，每个 Agent 可能有自己独立的记忆空间，防止相互污染。这在 Linux 里对应的是 **mount namespace**：

```bash
# Agent A 的记忆挂载在 /var/lib/agent-a/
# Agent B 的记忆挂载在 /var/lib/agent-b/
# 它们各自以为自己独占了 /var/lib

unshare --mount --propagation private
mount --bind /var/lib/agent-a /var/lib
# 现在 /var/lib 就是 Agent A 的"私有"记忆空间
```

Docker 的 volume 机制也是这个思路：

```bash
docker run --mount type=volume,src=agent-a-memory,dst=/var/lib/agent-bot agent-image
# Agent A 的 /var/lib/agent-bot 是独立的 volume
# Agent B 的 /var/lib/agent-bot 是另一个 volume
```

多 Agent 记忆隔离的本质是：每个 Agent 看到的是同一个路径，但底层是不同的存储卷。向量数据库的"tenant isolation"、不同 Agent 的独立 memory namespace，做的是同样的事情。

---

## 8. 记忆安全：chmod + gpg = encryption

Agent 的记忆可能包含敏感信息——内部代码、商业数据、用户隐私。Linux 的文件安全模型在这里完全适用：

```bash
# 文件权限：属主可读写，其他人无权限
chmod 600 /var/lib/agent-bot/memories/*.json

# 目录权限：Agent 用户独享
chown -R agent-bot:agent-bot /var/lib/agent-bot
chmod 700 /var/lib/agent-bot

# 敏感记忆加密（类似 /etc/shadow）
gpg --symmetric /var/lib/agent-bot/memories/sensitive.json
chmod 600 /var/lib/agent-bot/memories/sensitive.json.gpg
```

Agent 框架的 memory encryption（静态加密）就是这套逻辑的标准化——把 `chmod 600` + `gpg` 打包成一个"透明加密层"，让应用不用改代码就能获得记忆加密能力。

---

## 9. 记忆审计：auditd = memory replay

Agent 的记忆系统如果出了问题（比如记忆被污染、敏感信息泄露），需要有能力回溯——"这条记忆是什么时候写入的？谁触发的？上下文是什么？"

Linux 的 **auditd** 提供了完整的系统调用审计：

```bash
# 审计文件访问：谁在读 /var/lib/agent-bot
auditctl -w /var/lib/agent-bot -k agent-memory-access

# 查询审计日志
ausearch -k agent-memory-access | head -20
# type=SYSCALL msg=audit(...): arch=c000003e syscall=2 success=yes exit=3 a0=...
#   items=1 name="/var/lib/agent-bot/memories/session-123.json"
#   pid=12345 uid=agent-bot

# 按时间范围查
ausearch -k agent-memory-access --start=2026-09-01 00:00:00
```

Agent 的"记忆回放"（memory replay）功能——"回到某个时刻，看看 Agent 记得什么、忘记了什么"——对应的就是 audit log 的时间序列查询。审计日志不删，记忆的来龙去脉就都有据可查。

---

## 10. 从文件系统能学到什么

把 Linux 文件系统对照下来，Agent 记忆系统的核心挑战其实很明确：

**容量 vs 检索质量的权衡**，Linux 已经用 logrotate、TTL、分层存储（ssd vs hdd vs tape）解决了几十年。

**语义 vs 精确的权衡**，man -k 和向量数据库分别代表两个极端——前者精确但脆弱，后者模糊但鲁棒。最优解通常是混合：关键词匹配做快速过滤，向量相似度做精细排序。

**隐私 vs 效用的权衡**，chmod + gpg + auditd 提供了分层的安全模型——根据数据敏感度选择加密强度和审计粒度。Agent 记忆也可以分级：公开知识不加密，私有对话加密 + 审计，内部代码只允许特定 Agent 访问。

**持久化 vs 性能的权衡**，fsync 和 WAL 是 Linux 解决"既要安全又要速度"的标准答案。Agent 记忆也可以借鉴：实时写入内存，定期 flush 到向量数据库，中间用 write-ahead log 保证不丢。

---

## 结语：记忆系统的本质从未改变

1971 年，Unix 发明了文件系统——用 inode 和 data blocks，把字节流持久化到磁盘，用路径名做检索入口。

2024 年，Agent 发明了 RAG——用 embedding 和向量索引，把语义内容持久化到向量数据库，用相似度做检索入口。

技术栈变了，从磁盘块设备到分布式向量服务，但问题域没有变：**如何在无限增长的信息里，保持记忆的可检索性、新鲜度、安全性和可审计性。**

Linux 的答案是分层的文件系统和工具链：`/tmp` 做临时缓存，`/var/lib` 做持久存储，`find -mtime` 做 TTL 清理，`logrotate` 做压缩归档，`auditd` 做安全审计。

Agent 记忆系统需要的，也是同样的分层设计——只是把文件换成向量，把路径换成 embedding，把 chmod 换成 scopes。

理解了这个等价关系，你就既懂了文件系统的设计哲学，也懂了 Agent 记忆的本质——以及为什么简单可靠的方案，往往比花哨的新技术更经得起时间考验。
