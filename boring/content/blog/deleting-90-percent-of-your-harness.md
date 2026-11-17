---
title: "删掉 90% 的 harness 之后"
date: 2026-11-17
update_date: 2026-11-17
description: "Google DeepMind 的 Philipp Schmid 每半年重建一次 coding agent harness，把 10–20 个专用工具删到只剩一个 bash。四个 harness 在 350 条任务上分数几乎相同，token 成本却差近一倍——选 harness 该看 token/task。"
tldr: "复杂 harness 不会让你的分数变低，只会悄悄让你更贵。真正该被当作一等指标的，是解决一个任务要花多少 token。"
keywords: ["Harness 瘦身", "工具精简", "token 效率", "bash 工具", "Bitter Lesson", "工具箱"]
taxonomies:
  tags: ["AI Agent", "软件工程", "工程实践", "Harness"]
---

删掉 90% 的 harness 之后，剩下的东西反而更值钱了——但这要看你用什么指标来判断。

Agent harness 正在变成一层没人再质疑的东西。工具列表、系统提示词、框架配置——每加一样都"以防万一"，几个月后没人说得清哪一行还在创造价值。

Google DeepMind 的 Philipp Schmid 用一个反复做了两年的实验处理这件事：每隔约六个月，他把自己的 coding agent harness 从零重建一遍，每次都问同一个问题——**我到底需要多少 harness**。最后一次实验的答案很激进：把 10–20 个专用工具删到只剩一个 bash，把 system prompt 砍到约 300 tokens，把执行循环改成异步。结果是基准分数跳升，token 成本反而更低。

这不是"少写点代码"的偏好问题。他给出了一套可以照着做的选型方法。

## 判据不是人的直觉，而是 reward

Schmid 先解释了一个前提：模型是怎么学会用工具的。

后训练的标准结构是——一个 task、一个 model、一组 tools、一个 compute 环境、一个 verifier。模型自己尝试解题，verifier 打分，分数回传更新模型。**没有任何人告诉模型该用哪个工具**，它只收到 reward 反馈。

这个结构的直接推论是：工具集该怎么设计，不该由人类的直觉决定，而该由「模型能不能拿到更高的 reward」决定。

这解释了为什么"每个常见操作配一个专用工具"是个人类直觉的产物——人类的工作流天然是分步的，读文件、搜索、编辑、记待办。于是工具集被设计成人类步骤的固化版。但模型不按人类的步骤走，它按"什么能让 reward 更高"走。

于是出现了一个可以量化的分歧：把人类的操作步骤固化成工具，和把操作空间整个交给模型，是两种范式。

## 10 个 terms 和 2 个 terms

Schmid 给了一个具体的对照。同一个代码仓库改动，两条路径：

左边是专用的文件系统工具（read file、edit file），右边是一条 inline bash 脚本。官方演讲稿的原话是：

> "on the left side, we roughly need around 10 terms to make the same changes to a coding repository, compared to the two terms on the right side just using bash."

词是 "terms" 而不是 "turns"——官方用这个词指工具调用轮次。关键不只是轮次：

> "The left path takes around 10x more tokens than the right path, and it's doing the exact same thing at the end for tasks."

十倍的 token，做的是同一件事。

原因在评测图里看得很清楚：专用工具路径在**读**文件的阶段还能并行，但一进入**改代码**阶段就退化成一轮一个 edit——每改一处就要回一次模型。bash 路径不需要，因为一次调用可以把多处改动合成一个脚本。

这解释了一件反直觉的事：**专用工具不是"更精确的抽象"，而是"更慢的封装"**。每封装一层，就把一次往返固化进接口里。

这与[「为智能体设计工作环境」](/blog/agent-native-development-practices/)里那条"好 harness 不是让 Agent 跑更多轮，而是让每一轮失败后留下的证据更可读"是互补的两面：那一篇讲证据怎么留得可读，这一篇讲接口怎么少到不需要额外证据来补救。

## 删掉了什么，留下了什么

Schmid 描述的 harness 演化链是完整的：2024 年 2 月还是 workflow（planner → search → reflect → answer，没有真正的 agent），然后是多工具 agent，再然后是 10–20 个工具的 coding agent，最后一次实验只剩一个工具。

删掉的是：专用文件读写工具、搜索/grep 工具、planning 工具、todo 工具、subagent 工具，以及绝大部分 system prompt 规则。

留下的那个 bash 工具设计得极简——跑在独立干净的 subshell 里，参数只有一个 `command`、一个给 UI 展示用的 `description`，以及一个 async 超时阈值。超过阈值，tool call 就 resolve 并返回一个本地 file handle，模型之后可以查这个进程是否还在跑。

这里有个值得注意的推论：**长任务可以前台启动、自动转后台、日志落盘，模型再用 bash 读日志**；agent 本身是 CLI 的话，还能用 bash 调用自己——于是 subagent 工具也不需要了。planning 和 memory 同理，有文件系统，模型可以自己记录工作进度。

Schmid 特意区分了「工具」与「执行环境」：真正被保留下来的不是工具箱，而是一台计算机。

## 分数一样，成本差一倍

最硬的一组数据来自他自己搭的评测：约 350 条任务，覆盖 coding knowledge work 与 terminal 命令，模型是 Gemini 4 Argon。对比四个 harness：

- 仅 bash
- bash + view media tool
- 两个带结构化文件系统工具的版本

先看分数列。官方原话是 "all of them look roughly identical"。

但他随即补了一句自我限定，这个限定很重要：

> "there's a slight variance in the scores, but I only ran each task one time. So might be just some noise"

**每个任务只跑了一次。** 所以准确率上那点差异是噪声，表格不构成统计上可靠的排名。Schmid 自己没有把它当成排名用。

真正有信息量的是 token 列：

> "if we just compare like the bash media as the baseline, the tasks are almost 2x cheaper compared to more complex more tools agent harnesses. And we would not see it if we just look at the score."

接近两倍的差距，在 score 列上完全看不出来。

这里有一个容易读错的地方值得说清楚：**成本基线是 bash + media，不是纯 bash**。那个 "view media tool" 是因为截图是二进制的——直接 `cat screenshot.png` 会把字节灌进上下文，模型看不见图——所以必须有一个把图像转成模型可读形式的工具。换句话说，bash-only 有一个真实缺口：它读不了二进制图像。

还有一层更细的反直觉：加了这个媒体工具的变体，token 更低、cache hit rate 更高。也就是说**"工具越少越便宜"不是一条能直接套用的规则**——真正的问题是「这个接口能不能让模型高效完成这类工作，包括它需要看到的信息」。

## 模型越强，减法的复利越大

Schmidt 的 demo 部分比较了不同模型代际下，同一个 prompt 在 default tools 和 bash-only 两种配置下的表现。

较早的 Gemini 3.5 Flash：两边几乎没差别——它用 bash 也是一轮一条命令，读一轮、写一轮，不会串联。

更强的 Gemini 4 Carbon：差距出来了。default tools 已经调用得更少、更并行；bash only 更少——它用 ripgrep 智能定位改动点，而不是读完所有文件，然后写一个 inline Python 脚本一次改完。

量化下来：

> "roughly 2.2 to 3.7 commands per bash call and for flash it was only 1.3 to 1.8. So we are seeing up to 3x"

每次 bash 调用串起的命令数，Carbon 是 2.2–3.7 条，Flash 只有 1.3–1.8 条，同任务 token 最多省三倍。

这里藏着一个容易被忽略的机制：**更简单的接口不会自动让模型变得更聪明，是更强的模型才能把简单接口用得更好**。Schmid 的说法是 "the better the model gets, the more reasoning capability it gets, bash helps the model to be able to chain more commands in a single call"——bash 的收益是模型能力的函数。

推论也就来了：**模型换代时，harness 应该跟着重做**。一套为旧模型的能力缺口设计的工具集，留给新模型只会强迫它走一条更慢的路径。

## 回摆的方向与安全短板

Schmid 不是在鼓吹无脑删工具。他给出了相反方向的三个趋势：

**Code mode。** 不再拼 bash 命令，而是直接写 TypeScript 或 Python。这与[把工具变成 API、让模型写代码的 Code Mode](/blog/cloudflare-code-mode/)是同一个方向——那条路线的完整机制（类型生成、V8 isolate 沙箱、密钥保护）在那篇里展开过。

**MCP 回归。** MCP server 现在支持结构化输出，模型因此能在单轮写出更高效的脚本；而且在 TypeScript 里加一层抽象，就能监控所有被执行的命令以确保安全。

**bash 的可审计性问题。** 自由形式的 shell 命令比结构化 API 更难审计——这一点他承认是自己方案的真实短板。

所以最终的判断不是"工具越少越好"，而是他那句：

> "Build to delete your code before the model does. Give your model a computer, not a toolbox."

给模型一台计算机，而不是一个工具箱。计算机是通用接口——审计、权限、资源限制都发生在这一层，而不是散落在每个专用工具里。

## 它不解决什么

这套方法论的边界，Schmid 自己划得比多数演讲清楚，值得原样保留：

**数据是厂商的自证。** 350 条任务、每任务只跑一次，样本量与重复次数都不足以支撑准确率上的排名。他本人把这条列为需要保留的怀疑。

**benchmark 第一是宣传口径。** 开场那半分钟是产品发布（Gemini 4 Carbon、Gemini Decisions API），"benchmark 第一"的说法应当按发布会口径看待，而不是按实测结论看待。

**减法不等于更少的交互。** 模型更愿意绕开复杂 harness 直接走 bash，不代表你的用户在 bash 面前体验更好——界面上少几个工具，与用户实际感知到的可靠性，是两件事。

**它没有回答"哪些工具该留"。** 演讲给的是判据（看每任务的 token 数与美元成本）和一个极端案例（删到只剩 bash），不是一套通用的工具集设计方法。中间地带——哪些工具该留、留几个——需要你自己在评测里找。

**它假设你有能力做这个实验。** 每半年重建一次 harness、搭一套 350 条任务的评测、逐个 harness 跑——这是有工程投入的。对多数团队，先把 CI 门禁和验收标准做实，收益比重新设计 harness 大得多。

## FAQ（常见问题）

**是不是工具越少越好？**
不是。官方的评测里，带媒体工具的变体 token 更低、cache hit rate 更高——纯 bash 有一个读不了二进制图像的真实缺口。真正的问题是「这个接口能不能让模型高效完成这类工作，包括它需要看到的信息」，不是工具数量本身。

**复杂 harness 会不会让分数变差？**
不会。模型会绕过去——但绕路本身要花更多轮次和更多 token。复杂 harness 的代价藏在成本列里，不在 score 列里。这也正是它容易被忽略的原因。

**该保留几个工具？**
演讲给的是判据而不是通用答案：看每任务的 token 数与美元成本。中间地带——哪些工具该留、留几个——需要你在自己的评测里找。

**这套方法适合所有团队吗？**
它的前提是你有能力每半年重建一次 harness、搭一套数百条任务的评测、逐个配置跑对比。这是实打实的工程投入。对多数团队，先把 CI 门禁与验收标准做实，收益比重新设计 harness 大得多。

## 可迁移的那一条

如果只能带走一句可迁移的：**在 accuracy 饱和之后，把每任务的 token 数与美元成本当成选 harness 的主指标**。

理由是机制性的：复杂 harness 不会让你分数变低，因为模型会绕过去——但绕路本身要花更多轮次和更多 token。分数掩盖了这份开销，成本列才把它显出来。

这也解释了为什么这件事值得每半年重做一次：模型在变强，同一套 harness 的性价比在变差，而你的评测集不会自动告诉你这件事。

想核现场段落，官方 transcript 可以直接拉：

```bash
curl -s https://ai.engineer/api/code/reading-download/transcripts/philipp-schmid.md \
  | grep -nE '10x more tokens|2x cheaper|3.7|view media'
```

## 关于这篇的取材与核验

本文整理自 Philipp Schmid 在 AI Engineer CODE 2026 的 talk《I deleted 90% of my harness (And It Got Better)》（2026-11-11，Continental 4–6 Mainstage）。核了官方 talk 页、官方 transcript（376 段带时间戳）与官方 sessions.json。

引用的英文原句逐条比对官方 transcript 与官方演讲稿。核验过程中**改掉了源笔记里的三处问题**，都值得记一笔：

**成本基线不是纯 bash，是 bash + media。** 源笔记把成本对比写成"bash 基线的单任务成本约为复杂 harness 的一半"，方向对，但基线认错了——官方原句是 "the bash media as the baseline"，且带媒体工具的那个变体 token 更低、cache hit rate 更高。官方 talk 页还专门加了一句限定：bash-only 并不在每个指标上都赢。

**PDF 输入确实支持。** 源笔记的「校对与修正」一节依据官方 Day 1 中英对照稿，把"PDF 原生输入"删掉了。但官方 transcript 2:22:22 明确说 "text, audio, images, video, and also PDFs"，官方 talk 页与 Decisions API 规格也一致。所以那次"更正"反而引入了错误——以 transcript 为准。

**职务口径有出入。** 官方 talk 页与 speakers.json 的 role 字段写的是 "Member of the Technical Staff"，但同一份 speakers.json 的 bio 又写 "Senior AI Developer Relations Engineer"。两个字段不一致，本文只用 talk 页上的说法。

另外，"每半年重建一次"这个周期出自官方演讲稿原句 "every roughly six months"；官方摘要里写的是 "every few month"——两处不一致，成稿以演讲稿为准，因为那是他自己的表述习惯。

## 参考资料

- [AI Engineer CODE 2026：I deleted 90% of my harness（官方 talk 页，含完整 transcript）](https://ai.engineer/code/2026/talks/philipp-schmid)
- [AI Engineer CODE 2026 官方日程（sessions.json，可核对时间与场地）](https://ai.engineer/code/2026/sessions.json)
- [AI Engineer CODE 2026 演讲者页（核对 Schmid 职务与所属）](https://ai.engineer/code/2026/speakers.json)
- [Rich Sutton：Bitter Lesson（本文提到的理论出处）](http://www.incomplete-thinking.net/2019/12/21/the-bitter-lesson.html)

*原文：Philipp Schmid "I deleted 90% of my harness (And It Got Better)"，AI Engineer CODE 2026*
*[原文链接](https://ai.engineer/code/2026/talks/philipp-schmid)*
