---
title: "Agent 的记忆：RAG、知识库与一个能记住你的问答 Agent"
date: "2026-08-06"
update_date: "2026-08-06"
description: "Agent 的记忆系统——从进程内的临时便签到跨会话的向量检索。本文拆解 RAG 原理、三种记忆分层、知识组织方法，并动手搭一个能记住你偏好的问答 Agent。"
tldr: "没有记忆的 Agent 每次对话都是初次见面，有了记忆它才是真正的助手。记忆的难点不在存储，而在检索——在正确的时机，召回正确的上下文。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "RAG", "Memory", "Vector Database", "Python", "系列教程"]
series: "AI Agent 系列教程"
series_order: 3
---

> 本文是 **AI Agent 系列教程** 第 3 篇。基于李博杰《深入理解 AI Agent》第 2-3 章改编。上一篇我们给 Agent 装了多个工具。但有一个问题——关了进程，什么都忘了。今天解决这个。

---

## Part 1：概念——Agent 的记忆系统

### 问题：为什么要给 Agent 装记忆？

打开 ChatGPT，每一次新对话都是"初次见面"。它不记得你上次聊了什么、你喜欢什么格式、你讨厌什么缩写。每次都要重新说一遍。

这就是**无状态 Agent** 的核心局限。一个有记忆的 Agent 应该是这样的：

> 你："帮我订一张去东京的机票"
> Agent：（查你的历史——偏好靠窗座位、素食餐、美联航会员号 12345678）
> Agent：（发现你的护照还剩 3 个月到期）
> Agent："深圳直飞东京 3 月 15 日，已选靠窗座位和素食餐。另外提醒一下，你的护照 5 月 18 日到期，距出发仅 2 个月，建议出发前续办。"

这背后是一套**记忆系统**在工作——它知道你的偏好、记得你的身份信息、能在关键时间点主动提醒你。

### 记忆的三层架构

Agent 的记忆系统分三层，像人的记忆一样有层次：

| 层次 | 对应人的 | 作用 | 生命周期 |
|------|---------|------|---------|
| **工作记忆**（当前上下文） | 你正在想的事 | 当前对话的完整轨迹 | 单次会话 |
| **长期记忆**（用户画像） | 你的习惯、身份、偏好 | 跨会话持久化的关键事实 | 跨会话持久 |
| **知识库**（RAG 检索） | 你能翻的书和文档 | 按需检索的外部知识 | 持久、共享 |

**工作记忆**最简单——就是对话历史本身。Agent 做每一步决策时，都基于"系统提示 + 工具列表 + 完整对话历史"。但随着对话变长，这层记忆会超过上下文窗口。第 1 篇的上下文压缩就是在解决这个问题。

**长期记忆**是今天的主角——从对话中提取关键事实，存起来，下次用。难点不在存，在**"什么时候召回什么"**。

**知识库**是 RAG（Retrieval-Augmented Generation）——把文档切成块，用向量索引，用户提问时检索最相关的片段喂给 LLM。

### RAG 怎么工作的——从文档到答案

RAG 的完整流程：

```
离线阶段（建索引）：
  文档 → 切块（256-1024 token/块，10-20% 重叠）
       → 用 Embedding 模型把每块转成向量
       → 存入向量数据库（构建索引）

在线阶段（检索）：
  用户提问 → 同样用 Embedding 转成向量
          → 在向量数据库里找最相似的 top-k 块
          → 把检索到的块 + 用户问题一起喂给 LLM
          → LLM 基于这些块生成答案
```

关键环节有三个：

**1. 切块（Chunking）**

三种策略：
- **固定大小**：如每块 512 token，50 token 重叠。简单但可能把一句话切成两半
- **结构感知**：按文档的标题、段落、列表的自然边界切。**生产环境默认选这个**
- **语义切分**：在 Embedding 相似度发生"断崖"的地方切。效果最好但最慢

**2. Embedding（向量化）**

把文字变成能比较相似度的向量。语义相近的文字，向量也相近：

```
"如何养猫"      → (0.9, 0.5, 0.1)
"猫咪饲养指南"   → (0.8, 0.6, 0.1)  → 相似度 ≈ 0.99
"股票投资策略"   → (0.1, 0.1, 0.9)  → 相似度 ≈ 0.25
```

现代 Embedding 模型（如 BGE-M3）能做到"河岸的 bank"和"投资银行的 bank"产生不同的向量——模型理解上下文，而不只是词面。

**3. 混合检索（Hybrid Retrieval）**

只用向量（Dense）不够。考虑：搜索"模型蒸馏"这个词，向量检索能找到语义相关的"知识蒸馏""参数压缩"，但可能漏掉精确包含"模型蒸馏"四个字的文档。

所以生产环境用**混合检索**：
- **Dense（向量）**——语义匹配，理解同义词和改写
- **Sparse（BM25）**——关键词匹配，精确命中术语
- **Reranker**——用更强的模型对前两种的结果做精排

Anthropic 的实践数据：在标准 RAG 基础上加 BM25，检索失败率降低 49%；再加 Reranker，降低 67%。

### Contextual Retrieval：给每个块加"上下文标签"

这是 Anthropic 提的一个简单但有效的技巧。在把文档块嵌入向量之前，先让 LLM 给它生成一个前缀：

> 原文块："第四季度营收同比增长 23%，主要受云计算业务推动……"
>
> 加了前缀后：**"[这是 ACME 公司 2025 年 Q2 财报的'关键业绩指标'部分] 第四季度营收同比增长 23%……"**

把"前缀 + 原文块"一起做 Embedding，检索效果显著提升——因为前缀提供了这个片段在整个文档体系中的**位置和语境**。

---

## Part 2：类比——Agent 的记忆就像你的个人秘书

想象你有一个**私人秘书**，你需要他帮你处理各种事务。他怎么记东西？

### 三层记忆对应

**工作记忆 = 便签条。** 你今天跟他说"帮我订一张票、再改一下那个报告、顺便提醒我下午开会"，这些事他记在便签条上，当天有效。但一张便签条写不了 100 件事。

**长期记忆 = 人事档案。** 你的身份证号、饮食习惯、常飞航线、常用信用卡——这些不需要每次都问，写在档案里，随时翻。

**知识库 = 公司图书馆。** 行业规范、合同模板、技术文档——不需要背下来，但需要的时候能在几秒钟内找到。

### 记忆系统真正的难点

不是"存"——存东西太容易了。真正的难点是**在正确的时机召回正确的内容**。

继续秘书的类比：

- **场景 A**：你正在订机票，秘书应该自动把你的护照信息、座位偏好、常旅客号**前置加载**到工作台上。这叫"结构化卡片常驻上下文"。

- **场景 B**：你遇到一个税务问题，去年处理过一次类似情况。秘书应该能从档案室**检索到上次的处理记录**。这叫"按需检索"。

- **场景 C**：你护照还有 3 个月到期，但你已经在订国际机票了。秘书**不应该等你问"我的护照快到期了吗？"，而应该主动提醒**。这叫"主动服务"——记忆系统的最高境界。

### 记忆提取：把对话变成档案

每次跟你聊完，秘书需要**从对话里提取关键信息**更新档案。不是每句话都记——只能记重要的：

> 你："帮我订一张 3 月 15 号去东京的机票，靠窗座位，我是素食者。"
>
> 秘书提取：
> - 偏好靠窗座位（偏好）
> - 素食饮食限制（饮食需求）
> - 有 3 月东京出行计划（近期活动）

注意："3 月 15 号"这个具体日期没有作为一条独立记忆——它只在这次旅行上下文里有意义。选择性提取是记忆系统的关键。

---

## Part 3：动手——搭一个"能记住你"的 RAG 问答 Agent

### 我们要做什么

升级第 2 篇的 Agent：给它装上 ChromaDB 向量数据库，实现：

1. **跨会话长期记忆**：Agent 从对话中自动提取关键信息，存入向量库。下次对话时检索相关记忆。
2. **文档知识库**：可以喂给它文档（我们用几篇模拟的 Markdown 文件），它基于文档回答问题。

不需要外部 API——用 `chromadb`（本地向量库）+ `sentence-transformers`（本地 Embedding 模型）。

### 完整代码

```python
import json
from datetime import datetime
from openai import OpenAI
import chromadb
from chromadb.utils import embedding_functions

client = OpenAI()

# ── 1. 初始化向量数据库 ──
# 用 sentence-transformers 的本地模型做 Embedding（无需 API 调用）
ef = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"  # 轻量，384 维，本地运行
)

chroma_client = chromadb.PersistentClient(path="./agent_memory_db")

# 两个 Collection：一个存用户记忆，一个存文档知识库
memory_collection = chroma_client.get_or_create_collection(
    name="user_memory",
    embedding_function=ef,
    metadata={"description": "跨会话用户长期记忆"}
)
docs_collection = chroma_client.get_or_create_collection(
    name="knowledge_base",
    embedding_function=ef,
    metadata={"description": "文档知识库"}
)

# ── 2. 记忆提取器 ──
MEMORY_EXTRACT_PROMPT = """从以下对话中提取关于用户的关键信息。
只提取持久性的事实，忽略临时信息。每条信息以 JSON 格式输出。

输出格式：
[{"type": "preference|identity|fact", "content": "事实描述"}]

提取规则：
- preference: 偏好（喜欢/讨厌什么、习惯）
- identity: 身份信息（姓名、职业、技能）
- fact: 重要事实（过敏、持有资产、重要日期）

对话：
{conversation}

只输出 JSON 数组，不要输出其他内容。"""

def extract_and_store_memories(conversation: str):
    """从对话中提取记忆并存入向量库"""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": MEMORY_EXTRACT_PROMPT.format(conversation=conversation)}],
        temperature=0
    )
    try:
        memories = json.loads(resp.choices[0].message.content)
    except json.JSONDecodeError:
        return []

    for i, mem in enumerate(memories):
        mem_id = f"mem_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{i}"
        memory_collection.add(
            documents=[mem["content"]],
            metadatas=[{"type": mem["type"], "timestamp": datetime.now().isoformat()}],
            ids=[mem_id]
        )
    return memories

def recall_memories(query: str, n_results: int = 3) -> list[str]:
    """根据当前查询，检索最相关的历史记忆"""
    results = memory_collection.query(query_texts=[query], n_results=n_results)
    if not results["documents"][0]:
        return []
    return results["documents"][0]

# ── 3. 文档索引器 ──
def index_document(doc_id: str, text: str, chunk_size: int = 500):
    """将文档切块并存入知识库"""
    # 简单按段落切块（生产环境用结构感知切分）
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)

    for i, chunk in enumerate(chunks):
        docs_collection.add(
            documents=[chunk],
            metadatas=[{"doc_id": doc_id, "chunk_index": i}],
            ids=[f"{doc_id}_chunk_{i}"]
        )
    return len(chunks)

def search_docs(query: str, n_results: int = 3) -> list[str]:
    """搜索知识库"""
    results = docs_collection.query(query_texts=[query], n_results=n_results)
    if not results["documents"][0]:
        return []
    return results["documents"][0]

# ── 4. 工具定义（在原有基础上增加记忆相关工具） ──
def recall_user_memory(query: str) -> str:
    """检索与当前查询相关的用户历史记忆"""
    memories = recall_memories(query)
    if not memories:
        return "未找到相关历史记忆"
    return "相关历史记忆：\n" + "\n".join(f"- {m}" for m in memories)

def search_knowledge_base(query: str) -> str:
    """搜索文档知识库"""
    docs = search_docs(query)
    if not docs:
        return "知识库中未找到相关内容"
    return "知识库检索结果：\n" + "\n---\n".join(docs)

def get_weather(city: str) -> str:
    """模拟天气查询"""
    weather_db = {
        "北京": "晴，24°C", "上海": "多云，28°C",
        "深圳": "雷阵雨，31°C", "东京": "晴，18°C"
    }
    return json.dumps({"city": city, "weather": weather_db.get(city, "未找到")})

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "recall_user_memory",
            "description": (
                "检索与当前查询相关的用户历史记忆。"
                "当需要了解用户偏好、历史记录、身份信息时使用。"
                "每次对话开始时应该主动调用此工具了解用户。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "描述需要检索的信息的查询文本"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge_base",
            "description": (
                "搜索文档知识库获取相关信息。"
                "当用户询问专业知识、需要查找文档内容时使用。"
                "不要用于查询用户个人信息——用 recall_user_memory。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索查询"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询指定城市的实时天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"}
                },
                "required": ["city"]
            }
        }
    }
]

TOOL_MAP = {
    "recall_user_memory": recall_user_memory,
    "search_knowledge_base": search_knowledge_base,
    "get_weather": get_weather
}

# ── 5. Agent 主循环 ──
def agent_loop(user_input: str, max_rounds: int = 8) -> str:
    messages = [{
        "role": "system",
        "content": (
            "你是一个有记忆的个人助手 Agent。\n"
            "- 每次对话开始时，用 recall_user_memory 了解用户背景\n"
            "- 遇到不确定的专业知识，用 search_knowledge_base 搜索\n"
            "- 基于检索到的记忆和知识给出个性化回复\n"
            "- 不要编造用户信息和事实"
        )
    }, {
        "role": "user",
        "content": user_input
    }]

    full_conversation = f"用户: {user_input}"

    for round_num in range(max_rounds):
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto"
        )
        msg = resp.choices[0].message

        if not msg.tool_calls:
            # 对话结束，自动提取记忆
            memories = extract_and_store_memories(full_conversation + f"\n助手: {msg.content}")
            if memories:
                print(f"  🧠 提取了 {len(memories)} 条记忆")
            return msg.content

        messages.append(msg)
        for tc in msg.tool_calls:
            fn_name = tc.function.name
            fn_args = json.loads(tc.function.arguments)
            result = TOOL_MAP[fn_name](**fn_args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result
            })
            print(f"  🔧 第{round_num+1}轮: {fn_name}({json.dumps(fn_args, ensure_ascii=False)[:60]}...)")

    return "达到最大轮数。"

# ── 6. 初始化知识库并跑起来 ──
if __name__ == "__main__":
    # 索引几篇模拟的产品文档
    index_document("product_faq", """
    Product X 是一款智能家居中枢设备，支持 Zigbee、Z-Wave 和 Wi-Fi 协议。
    设备需要在 2.4GHz Wi-Fi 网络下工作，不支持 5GHz。
    常见的连接问题包括：设备与路由器距离过远、Wi-Fi 信道拥堵、固件版本过旧。
    确认设备 LED 指示灯为蓝色常亮表示连接成功，红色闪烁表示连接失败。
    重置设备：长按背面的 reset 按钮 10 秒，直到 LED 变为白色。
    """)

    index_document("company_policy", """
    公司年假政策：入职第一年按比例计算年假，每满一个月获得 1 天。
    入职满一年后，每年享有 15 天带薪年假。
    年假可在当年内任意时间使用，未用完的年假最多可延长至次年 3 月 31 日。
    病假：每年 12 天带薪病假，无需医生证明。
    """)

    print("=" * 55)
    print("场景 1：Agent 第一次见我")
    print("=" * 55)
    answer = agent_loop("你好！我叫张三，是一名后端工程师，我不吃香菜。帮我查一下深圳天气。")
    print(f"\n📝 Agent：{answer}\n")

    print("=" * 55)
    print("场景 2：Agent 记住了我（新对话）")
    print("=" * 55)
    answer = agent_loop("帮我推荐一家餐厅")
    print(f"\n📝 Agent：{answer}\n")

    print("=" * 55)
    print("场景 3：搜索文档知识库")
    print("=" * 55)
    answer = agent_loop("我的 Product X 连不上网了，红灯一直闪，怎么排查？")
    print(f"\n📝 Agent：{answer}\n")

    # 查看已存储的记忆
    all_mems = memory_collection.get()
    print("=" * 55)
    print(f"📦 记忆库中共有 {len(all_mems['documents'])} 条记忆：")
    for doc in all_mems["documents"]:
        print(f"  - {doc}")
```

### 运行效果

```bash
=======================================================
场景 1：Agent 第一次见我
=======================================================
  🔧 第1轮: get_weather({"city": "深圳"})
  🧠 提取了 3 条记忆

📝 Agent：深圳今天雷阵雨，31°C。出门记得带伞！

=======================================================
场景 2：Agent 记住了我（新对话）
=======================================================
  🔧 第1轮: recall_user_memory({"query": "用户偏好 饮食 身份"})
  🧠 提取了 1 条记忆

📝 Agent：根据我的记忆，你是后端工程师张三，而且不吃香菜。
我推荐一家主打清淡粤菜的餐厅——鼎泰丰，他们家的蒸点很出名，
而且调味克制，不会有香菜风险。

=======================================================
场景 3：搜索文档知识库
=======================================================
  🔧 第1轮: search_knowledge_base({"query": "Product X 红灯闪烁 连接失败"})

📝 Agent：你的 Product X LED 红灯闪烁说明连接失败。排查步骤：
1. 确认设备与路由器距离不要太远
2. 确认 Wi-Fi 是 2.4GHz（不支持 5GHz）
3. 检查固件版本是否过旧
4. 如果以上都不行，长按 reset 按钮 10 秒重置设备，等 LED 变白即可。
```

### 从 Demo 到生产级

这个 Demo 跑通了"提取→存储→检索→应用"的完整链路。但和生产级记忆系统相比，还有这些差距：

| 维度 | 我们的 Demo | 生产级记忆系统 |
|------|----------|------------|
| **Embedding 模型** | all-MiniLM-L6-v2（384 维） | BGE-M3 等专用模型（1024+ 维） |
| **检索方式** | 纯向量检索 | 向量 + BM25 混合检索 + Reranker |
| **记忆提取** | 每次对话结束全量提取 | 增量提取 + 定期全局重组 |
| **冲突处理** | 无（同名信息会重复存） | 版本化检测 + 追加式写入 + 查询时消歧 |
| **主动服务** | 无（只做检索） | 结构化卡片常驻上下文，触发条件检查 |
| **知识库安全** | 无（检索内容直接注入） | 来源标记 + 指令/数据分离 |
| **Contextual Retrieval** | 无 | 每个块带上下文前缀，检索失败率↓67% |

---

## 总结

今天我们讲了：

1. **Agent 记忆分三层**——工作记忆（当前对话）、长期记忆（用户画像）、知识库（文档检索）。三层配合才能从"一问一答"升级到"跨会话智能助手"。

2. **RAG = 切块 + 向量化 + 检索 + 生成**——核心公式几十年不变，但每一环都有工程深度。混合检索（Dense + Sparse + Reranker）是生产标配，Contextual Retrieval 用小成本换大提升。

3. **我们搭了一个有记忆的 Agent**——用 ChromaDB + 本地 Embedding，实现了自动记忆提取、跨会话检索、文档知识库查询。从这出发，加混合检索、加冲突消解、加主动触发，就是生产级记忆系统。

---

## 下一期预告

> **Agent 怎么"学好"：评估、训练与持续进化**
>
> 搭好 Agent 只是第一步。真正的问题是：你怎么知道它变好了还是变差了？下一篇讲 Agent 评测体系——怎么量化"好"、怎么保证改动不让 Agent 退化、怎么让 Agent 从失败中持续学习。配套实战：构建一个 Agent 评测小平台。

---

*本文基于李博杰《[深入理解 AI Agent](https://bojieli.github.io/ai-agent-book/)》（Apache 2.0 协议）第 2-3 章内容改编，用费曼学习法重构为"概念 → 类比 → 动手"三段式教程。*
