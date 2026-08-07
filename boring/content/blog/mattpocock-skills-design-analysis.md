---
title: "Matt Pocock Skills 体系解析：设计哲学与核心 Skill 导读"
date: 2026-08-07
description: "系统解读 Matt Pocock 开源的 AI Coding Skills 项目：从目录结构、设计约定到核心 Skill 的实现逻辑，探讨它如何解决 AI 编程中的真实痛点。"
tldr: "这套 Skill 系统的核心价值是两个：对齐靠 grilling，反馈靠环路——其余都是这两点的延伸。"
taxonomies:
  tags: ["AI", "LLM", "Coding Agent", "Matt Pocock", "Engineering"]
---

Matt Pocock 是 TypeScript 社区的知名布道者，同时也是一位在 AI 编程工具上投入很深的工程师。他开源了一套 AI Coding Skills，目标不是给 AI 塞更多知识，而是给 AI 编程建立**工程纪律**。

本文不带滤镜地解析这套系统的设计思路、核心 Skill 的实现逻辑，以及它实际要解决什么问题。

---

## 1. 项目结构：promoted vs. non-promoted

项目把 skills 分成四个 bucket：

```
skills/
  engineering/   # 18 个 promoted skills，出现在 plugin.json
  productivity/  # 7 个 promoted skills
  misc/          # 不 promoted，不对外暴露
  in-progress/   # beta 版本，同上
  deprecated/    # 已废弃，同上
```

这是一个很实用的边界设计：beta 和正式的要分开，没有充分验证的不能进 plugin.json。两个 promoted bucket 的 skills 同时需要在 `docs/` 目录有对应的文档页，发布后的 URL 固定为 `aihero.dev/skills-<name>`，与文件路径解耦。

`.claude-plugin/plugin.json` 是精确的白名单——里面列的每一个 skill 才被插件打包。用户装了什么完全透明，没有隐藏的 magic。

---

## 2. SKILL.md 的 frontmatter 约定

每个 skill 就是一个 `SKILL.md` 文件，前端固定 YAML frontmatter：

```yaml
---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first...
---
```

`name` 是全局唯一标识，`description` 有两个作用：人类读它理解 skill 是干什么的，更重要的是**模型靠这段描述决定何时 reach for 这个 skill**。description 写得粗糙，模型就会 reach for 错。

第三个隐含维度是"谁可以调用"，通过两个标记控制：

- **user-invoked**：只在你显式调用时才触发
- **model-invoked**：模型可以自动 reach for

所有 user-invoked skill 都是编排层（orchestration），它们负责协调；model-invoked skill 才是真正干活的底层能力。

---

## 3. Grill 的本质：对抗性追问直到对齐

`grilling` 是整个 skill 体系的核心原子。它解决的是 AI 编程中最高频的失败模式：**你以为它懂了，做出来发现完全不是那么回事**。

Grilling 的算法不复杂但有效：

1. 维护一个**前沿（frontier）**：所有依赖已解决的决策集合
2. 每轮向前沿所有问题同时发起追问，每条问题附上推荐答案
3. 用户回答后重新计算前沿，继续下一轮
4. 前沿为空时结束

关键设计点：每个问题必须同时给出推荐答案。这不是给用户参考，是**强迫 AI 自己先想清楚**。一个你自己都拿不出推荐答案的问题，大概率是还没想清楚该问什么。

Fact（文件结构、工具行为）由 AI 自己派 sub-agent 去查，Decision（用哪个方案）留给用户——这消除了"用户答不上来因为信息本该 AI 自己查"这种内耗。

`grill-with-docs` 在 grilling 之上叠了一层 `domain-modeling`：把决策同步写入 `CONTEXT.md`（术语表）和 ADR（架构决策记录）。 grilling 是 stateless 的追问；`grill-with-docs` 是 stateful 的，同时留下文档。

---

## 4. TDD：反馈环优先于猜测

`tdd` skill 的核心论点是：**没有一条能 red 的命令，什么调试技术都救不了你。**

Phase 1 花最大篇幅讲的不是怎么写测试，而是怎么构造反馈环。列了 10 种构造方式，从"failing test at the seam"到"replay captured trace"，再到"bisection harness"和"HITL bash script"。顺序就是优先级——优先构造确定性强的环，不行再退化。

一旦有了环，才进入 Phase 2–5 的假设→验证循环。每个假设必须是**可证伪**的，格式是"If X is the cause, then Y will happen"——能写出这个句子才算真假设，不是 vibe。

这个 discipline 在直觉上跟大多数人的调试习惯相反：我们倾向于先读代码猜原因，再去验证。但 AI 生成的代码在没有上下文信号的情况下，猜测的准确率更低。强制先建环再推理，是针对这个场景的专项设计。

---

## 5. Code Review：双轴正交分离

`code-review` 把 review 拆成两个独立 sub-agent：

- **Standards 轴**：代码规范（repo 文档 + Fowler smell baseline）
- **Spec 轴**：实现是否忠实于需求

为什么要分开？因为一个变更可能：

- 完美符合规范，但实现了错误的功能 → Standards 通过，Spec 失败
- 完全满足需求，但破坏了团队约定 → Spec 通过，Standards 失败

合并成一条报告，两者会互相掩盖。分开报告，每个轴独立出结论，上层聚合。

Fowler smell baseline 是固定的 12 个 smells（Duplicated Code、Shotgun Surgery、Divergent Change 等），即使 repo 没有成文规范，这套 baseline 仍然适用。Repo 文档优先；没有文档时才用 baseline。

---

## 6. 组合优于继承

一个值得注意的设计选择：skill 之间大量通过**组合**而非**继承**来复用逻辑。

最典型的例子是 `grill-with-docs` 的 SKILL.md，只有 3 行：

```markdown
---
name: grill-with-docs
disable-model-invocation: true
---

Run a `/grilling` session, using the `/domain-modeling` skill.
```

它不重复 grilling 的逻辑，只是把两个已验证的 skill 串联起来。router 层（`ask-matt`）也只有 140 行，精确描述所有 skill 的关系图，自己不含业务逻辑。

这个模式的好处是：每个 skill 只验证一次，组合方式无穷多，维护成本低。

---

## 7. 评价：它解决了什么，没解决什么

**它解决的问题：**

- AI 快速产出但质量不稳定 → TDD + code review 把质量门控前置
- 对齐靠猜，做完才发现错 → grilling 强制前置追问
- 反馈环缺失导致调试靠猜 → diagnosing-bugs 强制先建环再推理
- 文档和决策记录随对话消失 → domain-modeling 和 ADRs 强制留档

**它没解决的问题：**

- 团队内部的对齐（利益相关者、PM、设计师）——这部分还是靠人
- 模型本身能力不足的场景——skill 是纪律，不提升模型智商
- 需要创造性的架构突破——它优化的是决策质量，不是决策的创造性

最后一点值得多说：这套 skill 的设计哲学是**收敛**，不是发散。它假设你已有一个要解决的问题，只是在实现路径上有歧义。如果问题是"我不知道要做什么"，skill 系统帮不了你——你需要的是市场调研、用户访谈，而不是一套调试流程。

---

**相关阅读：**
- [彻底搞懂 Agent Skills：从原理到实践](/blog/deep-dive-into-agent-skills/)
- [Spec-Driven Development 深度解析](/blog/spec-driven-development-depth-analysis/)