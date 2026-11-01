---
title: "Super-agent 执行层：槽位、后台作业与故障恢复"
date: 2026-11-01
update_date: 2026-11-01
description: "dsh-superagent 原型如何让一个工单真正跑起来：Executor Session 与目录、5 秒转后台的 shell 作业、30 分钟后台时限、worker 槽位的并发配额、prepare 命令建 worktree，以及失败后的重试、重启与存储式投递。"
tldr: "执行层的核心命题是「人的消息永远优先于机器的节奏」——槽位满了人的消息也能插队，后台作业有硬时限，失败要能被重启后重建而不是从头再来。"
keywords: ["dsh-superagent 执行层", "Executor Session", "worker 槽位并发", "后台作业超时", "Agent 故障恢复"]
taxonomies:
  tags: ["Agent", "并发控制", "故障恢复", "多智能体"]
---

架构文章说 Super-agent 的 Worker 层「上下文隔离、挂完整执行工具、专注完成单一任务」。原型仓库的 `docs/003-execution.md` 回答的是更具体的问题：一个工单被接纳之后，谁来跑、用什么跑、跑到一半断了怎么办。

这一层的设计里藏着一个反复出现的优先级：**人的消息永远比机器的节奏重要**。

## 一、工单阶段：它在等什么

每个未结束的工单处于一个阶段，由「当前在等什么」决定。表格自上而下读，第一条匹配的生效：

| 阶段 | 条件 | 面板标签 |
|---|---|---|
| person / delivery | 向 Executor Session 投递 Input 失败；2 秒后重试，再按翻倍延迟（最长 1 分钟）重试，成功、新 Assignment 或工单结束即清除 | Input 未送达 |
| person / answer | 有一个待人工回答的问题 | 等待回答 |
| person / review | 最新汇报为 `ready` | 等待评审 |
| person / blocked, failed | 最新汇报为 `blocked` 或 `failed`，且此后没有人的消息到达 | 受阻 · 失败 |
| working / queued | 没有 Assignment，或有一个 pending 的 | 排队中 |
| idle | 最新汇报为 `waiting`，或 Assignment 已结束 | 等待触发 |
| working | 其余情况 | 工作中 |

`person` 阶段意味着工单**无法在没有人类输入的情况下继续**。而一条新的人类消息会把受阻或失败的工单释放给它的 Executor，于是它进入下一条匹配的阶段——通常是 `working`。

`idle` 是「这轮干完了，没有待办问题」的状态。订阅 Thread 上来了 Trigger 就能继续它。

## 二、Executor：一人一单一份目录

每个工单分到一个名为 `worker-<ticket id>` 的 Executor Session，和一个以工单短名命名的目录。目录建在配置的 execution root 下，默认是 `<stateDir>/work`。

两个 preset 各司其职：`dsh-superagent-worker` 给 Executor 用，`dsh-superagent-router` 给主 Session 用。两者都有 5 秒的 shell 与作业等待上限——**前台 shell 命令超过 5 秒就转成后台作业**，这样 worker 能在下一步接收新消息，而不是干等一个长命令结束。

Executor Session 以操作者的 OS 用户身份运行命令，**不需要审批**。这一条在部署文档里被明确标注为风险：两个 preset 都以 `danger-full-access` 运行，凭据包装器只是选择 agent 的凭据，**并不隔离进程**——worker 仍能按路径执行程序、读取操作者的 home 目录。文档给出的隔离办法是使用一个只含 agent 凭据的专用 OS 账号。

## 三、后台作业与 worker 槽位

### 后台作业的规则

当一轮结束时还有 shell 作业或 subagent 在跑，工单**保留自己的 worker 槽位**并保持 working 状态。它不会被报成 waiting，主 Session 也不会收到等待汇报。作业或 subagent 完成后会用结果唤醒同一个槽位里的 Executor。只有当一轮结束时没有后台工作，Executor 才正常汇报 waiting。

时限方面：**每轮结束后，后台工作最多有 30 分钟完成**。到达这个上限时，shell 作业被杀掉，工单被报为 waiting，汇报里包含 Executor 的最后一段话、哪些作业被杀、哪些 subagent 仍在活动。subagent 允许继续跑，Executor 在下一轮读取被杀作业的结果。

交付给人（Handoff）会**立即释放槽位**，汇报继续有效。这适用于 `ready` 汇报或提问之后（除非期间又来了新 Input），也适用于任何 `blocked` 或 `failed` 汇报之后。交付时 subagent 停止；shell 作业（比如为评审启动的服务器）可以继续直到 Assignment 结束——它们不占槽位，也豁免 30 分钟上限，包括之后几轮的豁免。它们完成时不会唤醒 Executor，Executor 在下一轮自己读结果。

Assignment 结束时，它的 shell 作业被杀掉且不唤醒 Session，它的 subagent 被释放。

### 槽位即并发配额

工单从启动那一刻起就占住一个 worker 槽位——包括准备阶段（prepare），或者从唤醒空闲 Executor 的那次投递开始算。活跃的一轮也一直占着。

**配置的并发上限作用于这些槽位**，并且额外多一个槽位，专门给人的消息或状态查询使用。正常槽位全满时，这种唤醒可以用那个额外槽位，并且优先于新任务的启动拿下一个空位。

> 换句话说，**新工作不能妨碍人继续推进一个已有工单**。

CI 结果这类其它 Input 则要等正常槽位。启动请求在 `working / queued` 状态等待空位。因为启动是并发执行的，一个慢的 prepare 命令只耽误它自己那个工单。

## 四、准备阶段：每个工单一份 worktree

第一次 Assignment 之前，如果工单目录还不存在，prepare 命令会在 execution root 里用 `sh` 执行一次，限时 10 分钟。没有 prepare 命令的话，worker 就在一个空目录里开始。

命令失败会导致工单失败并记录输出。重试或人在该工单的某个 Thread 上发消息，都会再次尝试准备。

一个典型命令用 `git worktree` 创建 checkout。**当某个 PR 的分支名最后一段与工单短名一致时，这个 PR 就属于该工单。**

这个约定把「工单」和「分支/PR」绑在了一起，不需要额外的映射表——分支名本身承载了归属关系。

## 五、执行变量：环境与提示词共享同一份事实

prepare 命令和 Executor 指令拿到**同一组执行变量**。命令读环境变量，Executor 在提示词里读它们的值和描述。**这些变量里不含任何凭据。**

| 变量 | 注册方 | 值 |
|---|---|---|
| `DSH_SUPERAGENT_DIR` / `_NAME` / `_TICKET` | Executor | 工单的目录、短名和 id |
| `DSH_SUPERAGENT_BLOCKED_COMMANDS` | Executor | Executor 不得运行的命令 |
| `DSH_SUPERAGENT_GITHUB_REPOSITORY` | GitHub | 监听的仓库 `owner/name` |
| `DSH_SUPERAGENT_GITHUB_ACCOUNT` / `_COMMIT_EMAIL` | GitHub | agent 账号及其提交邮箱 |
| `DSH_SUPERAGENT_GITHUB_NUMBER` / `_PR_HEAD` | GitHub | 发起该工单的 Issue 或 PR，以及 PR 的 head ref |
| `DSH_SUPERAGENT_FEISHU_BOT` / `_FEISHU_CHAT` | Feishu | bot，以及发起该工单的群 |

工单专属的值来自它的目录和原始 Trigger，其它值来自当前部署配置。**只有面板能改执行环境设置**；发给主 Session 的文本改不了配置好的 shell 命令。

Worker 通过 agent 账号的 `gh` 访问 GitHub，通过 bot 的 `lark-cli` 访问飞书。被禁用的命令按名字调用时直接失败。但文档给了一个诚实的能力边界：

> 这些包装器和目录建立的是默认行为，**不是安全边界**。worker 仍然可以用绝对路径执行程序。

## 六、合并：默认不自动合

自动合并由 **Delivery requirements** 提示词决定，宿主没有任何针对合并的决策逻辑。

默认情况下，Executor **绝不会**以 agent 账号身份启用 auto-merge——GitHub 会把合并归因到启用它的人。Delivery requirements 必须指定另一个账号的 CLI 来做合并；没有的话，就由人来合并 PR。

默认指令允许的自动合并条件很具体：只针对该工单开启的 PR、状态为 ready、必需审批覆盖 head commit、且新增加删除的总行数少于 200 行。在推送新版本之前，Executor 会先撤销 auto-merge。

这些指令管的是 Agent，不是 GitHub 的合并规则。**要强制执行审批要求，得在分支保护里设置并撤销过期的审批。**

## 七、失败与恢复：三种不同的处置

### Executor 受阻或失败

当 Executor Session 汇报 `blocked` 或 `failed`，或者启动失败、报错而记录为 `failed` 时，**工单不再自动接收任何 Input**。

需要区分「传递性失败」和「实质失败」：模型提供方或网络的临时故障、HTTP 408/429/5xx、连接被拒/重置/超时，都属于传递性失败，会先按递增退避重试三次——启动会重跑，转失败的 worker 会被告知继续。**失败的 prepare 命令不会重试。**

一旦进入 failed 状态，CI 和 bot 的消息仍会记录在它上面，但不会被投递，也不会唤醒 Session。它的工具保持可用，人可以直接在 Session 里继续。

解除 hold 的条件有三个：人的消息到达、出现一个既非 `blocked` 也非 `failed` 的后续汇报、或者一次重试。

### 重试

重试在工单处于 `person / delivery`、`person / blocked` 或 `person / failed` 时可用：一次新的 Assignment 会重新启动 worker 并接收等待中的 Input。

一旦人的消息到达了一个受阻或失败的工单，Executor 就拿到了这条消息，工单显示为 working（或者失败启动重跑时显示 queued），此时不再提供重试——除非投递本身失败了。

重试会结束当前 Assignment，在**同一个 Executor Session、目录、分支和 PR** 里启动新的 Assignment。

一条容易忽略的规则：**Executor 的模型只在 Session 创建时生效**，已存在的 Session 保留原有模型。

### 重启

运行中的 Assignment 以「host restarted」结束，新的 Assignment 带一条恢复说明启动——告诉 Executor 先检查自己的目录、git 历史和 GitHub，**再重复任何对外动作**，并且从最老的工单开始。

等待中、ready、blocked、failed 的工单保持原状，除非在那次汇报之后有 Input 到达，那样它们也会重新启动。

会话、目录、订阅、待处理消息和下文的存储式工作都能挺过重启。**哪个 Executor Session 读走了哪些消息的记录也保留下来**——一步在认领之后、模型调用之前就记下「已读」；被重启打断的那一步算已读一次，前提是之后有汇报或一轮结束；而认领了却被取消或错误打断的步骤算未读。

重启或重试会给新的 Assignment 再次交付它所替换的那个 Assignment 交付过、但其 Executor Session 没读走的那些消息——被取消或截断的那一步可能已经丢掉了它们。于是 Session 里还留着的那份副本，会在重启时或崩溃持久化后被取出，在新 Assignment 的第一条消息之前移除，所以那次投递是唯一的副本。

## 八、存储式工作：先存后做

文档最后给出了一条贯穿所有故障处理的模式：

> dsh-superagent 在决策之后做的事——比如中继候选、中继后续消息或汇报、启动 Assignment、投递 Input——**都是先存起来，再执行**。

投递失败（比如 Session 无法到达）会按 2 秒起、翻倍至 1 分钟的退避重试；启动失败会让它的工单失败。

每类工作在连续失败三次后才作为系统问题上报到总览的「系统问题」里；Input 投递失败则显示在它自己的工单上。

中继到主 Session 的工作保持顺序，通知也一样；其中一条失败会挡住同类的后续消息。

外发消息按退避从 5 秒开始、翻倍至 300 秒重试。**同一个工单发往同一个会话的消息按排队顺序发出**，所以它的确认消息会排在它后来的答复或结果之前——一条消息要等同一工单发往同一会话的更早消息发出去，直到那条消息连续失败三次并显示为问题为止。其它工单的消息、以及不属于任何工单的消息，不受这个等待影响。

消息只会在它的 Source 不再监听该会话、或 Source 回答该会话永远收不到时被丢弃；Source 关闭期间它会等待。**被丢弃的消息会保留记录**（何时丢弃、为什么、属于哪个工单），所以它不会被再次排队——一条被丢弃的确认读起来是「已丢弃」而不是「已发送」。

## 九、暂停处理

暂停会停止调度、新的 Eval、Eval 超时、Input 投递和回复；已经在进行中的启动会等到处理恢复后才继续。

Source 继续记录 Trigger，正在运行的 Executor 一轮不会被中断。

人在一个已结束工单上发的消息会等待：暂停后的第一轮会恢复该工单——如果它的 Mandate 在那时的 Policy 下依然成立。

**进行中的 Eval 在暂停期间不会超时**，它的截止时间按暂停时长顺延。

## 十、这套执行层的取舍

把上面的规则放在一起，能看出几条一致的取向：

**人优先。** 槽位满了人的消息可以插队；工单只有拿到人的输入才停在 `person` 阶段；暂停不打断正在跑的一轮。机器的进度永远让位于人的介入。

**失败要能重建，不能靠重来。** 恢复说明要求 Executor 先检查目录、git 历史和 GitHub 再重复对外动作；重启后能识别「哪条消息已经算读过」；存储式工作先落盘再执行，让重试与顺序都成立。

**边界写死在提示词和配置里，不靠自觉。** 30 分钟后台时限、5 秒转后台、200 行合并上限、少于 10 分钟的 prepare——都是明确数值。合并策略是提示词而非代码逻辑，意味着它可被调整，代价是它也可能被误改。

**但安全边界被明确划在能力之外。** 包装器和目录是默认行为而非安全边界，worker 仍能按绝对路径执行程序、读取操作者的 home 目录。真正的隔离要靠专用 OS 账号。这是整套执行层文档里最需要被认真对待的一句提醒。

## 参考资料

- [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) — MIT 许可，官方注明为研究原型、非正式产品
- 仓库文档 `docs/003-execution.md`、`docs/006-deployment.md`（本文主要依据）
- 关联阅读：[Super-agent 设计：Session 是实现细节](/blog/super-agent-architecture-design/) — 五个模块与架构全景
- 关联阅读：[Super-agent 原型源码：工单、授权与订阅的领域模型](/blog/super-agent-domain-model-tickets-and-mandates/) — 九个概念与授权规则
