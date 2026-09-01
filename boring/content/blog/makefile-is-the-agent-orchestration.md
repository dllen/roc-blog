---
title: "Agent 的编排，90% 是 1996 年的 Makefile"
date: 2026-09-01
description: "多 Agent 协作、任务依赖图、工作流引擎——这些听起来是 2024 年的新技术。但如果你仔细看，它们不过是 Makefile 在 1996 年就解决过的问题：拓扑排序、增量执行、并行调度、失败传播。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Linux", "Makefile", "工作流", "编排", "DAG"]
extra:
  update_date: 2026-09-01
---

前四篇聊了 Agent 的基础设施、工具调用、记忆和评估。有读者继续问：多 Agent 协作呢？

这是目前最热门的方向之一——Multi-Agent System、Agent Workflow、Orchestration。框架们画着复杂的架构图，节点连着节点，Agent 调用 Agent，看起来像是全新的问题。

但如果把多 Agent 协作的核心逻辑拆开来看：定义任务、解决依赖、并行执行、处理失败——这正是 Makefile 在 47 年前（1976 年）就定义好的问题域。

本文把多 Agent 编排还原到 Makefile，看看这套"老古董"能给现代 Agent 工作流带来什么启发。

---

## 1. 多 Agent 协作的本质：任务依赖图

多 Agent 系统要解决的核心问题是：**哪些任务可以并行，哪些必须等待前置任务完成？**

Makefile 给出了标准答案——**有向无环图（DAG）**：

```makefile
# Makefile 声明了任务之间的依赖关系
# 最终目标：build
# build 依赖：main.o lib.o
# main.o 依赖：main.c
# lib.o 依赖：lib.c

build: main.o lib.o
    gcc -o build main.o lib.o

main.o: main.c
    gcc -c main.c

lib.o: lib.c
    gcc -c lib.c
```

对应的依赖图：

```
main.c ──→ main.o ──┐
                       ├──→ build
lib.c ──→ lib.o ──┘
```

多 Agent 协作的 DAG 是一样的逻辑，只是节点从"编译目标"变成了"Agent 任务"：

```yaml
# Multi-Agent workflow 定义
workflow:
  tasks:
    research:
      agent: researcher
      description: "研究竞品功能"
      output: research_report.json

    design:
      agent: designer
      description: "基于研究报告设计方案"
      depends_on: [research]
      input: research_report.json

    implement:
      agent: coder
      description: "实现设计方案"
      depends_on: [design]

    test:
      agent: tester
      description: "编写测试用例"
      depends_on: [implement]
```

对应的 DAG：

```
research ──→ design ──→ implement ──→ test
```

Makefile 解决的是"C 代码怎么编译"，Multi-Agent 解决的是"任务怎么协作"。但底层的图结构完全相同。

---

## 2. 拓扑排序：决定执行顺序

Makefile 有一个关键算法：**拓扑排序**——把依赖图转成线性执行顺序，保证每个节点在它的依赖之后执行。

```bash
# make 内部做拓扑排序，保证：
# 1. main.o 和 lib.o 在 build 之前
# 2. main.c 和 lib.c 在各自 .o 之前

$ make -n  # -n = dry run，看执行顺序
gcc -c main.c
gcc -c lib.c
gcc -o build main.o lib.o
```

Multi-Agent 工作流引擎也在做同样的事：

```python
# 拓扑排序实现（Agent 工作流引擎的内部逻辑）
def topological_sort(tasks):
    # 计算每个任务的入度（有多少前置依赖）
    in_degree = {task.id: len(task.depends_on) for task in tasks}

    # 从入度为 0 的任务开始（没有前置依赖）
    queue = [task for task in tasks if in_degree[task.id] == 0]
    sorted_order = []

    while queue:
        task = queue.pop(0)
        sorted_order.append(task)

        # 这个任务完成后，依赖它的任务入度减 1
        for dependent in task.dependents:
            in_degree[dependent.id] -= 1
            if in_degree[dependent.id] == 0:
                queue.append(dependent)

    return sorted_order
```

**关键认知**：Multi-Agent 工作流引擎的核心算法，和 GNU Make 共享同一个祖先——拓扑排序。理解了 Makefile，就理解了 Agent 编排器的核心逻辑。

---

## 3. 增量执行：只重算变化的部分

Makefile 的精髓是**增量编译**：如果 main.c 没变，就不需要重新编译 main.o；如果 main.o 和 lib.o 没变，就不需要重新链接 build。

```bash
# main.c 未修改 → make 跳过编译步骤
$ make
make: 'build' is up to date.

# touch main.c 修改时间 → main.o 重新编译，但 lib.o 跳过
$ touch main.c
$ make
gcc -c main.c        # main.c 变了，重新编译
gcc -o build main.o lib.o  # 重新链接
# lib.c 没变，lib.o 没有重新编译
```

Multi-Agent 工作流也可以做**增量执行**：

```python
# 检查任务输出是否仍然有效
def task_needs_rerun(task, cached_outputs):
    if task.id not in cached_outputs:
        return True  # 从未执行过，必须跑

    cached = cached_outputs[task.id]

    # 输入变了（前置任务的输出变了）→ 需要重跑
    for dep_id in task.depends_on:
        if cached_outputs[dep_id].checksum != cached.inputs_checksum[dep_id]:
            return True

    # 任务定义变了（prompt、agent 配置变了）→ 需要重跑
    if task.definition_checksum != cached.task_definition_checksum:
        return True

    return False  # 所有输入未变，跳过
```

这比"每次都全量重跑"高效得多。当工作流有 50 个任务、其中只有 1 个 prompt 改了，全量重跑是浪费——增量执行只需要跑那 1 个任务和它的下游。

---

## 4. 并行调度：-j 参数

Makefile 的 `-j` 参数开启并行编译：

```bash
# 串行：一步一步来
$ time make
gcc -c main.c     # 2 秒
gcc -c lib.c      # 2 秒
gcc -o build ...  # 1 秒
# 总计：5 秒

# 并行 -j4：4 个任务同时跑
$ time make -j4
gcc -c main.c &   # 进程 1
gcc -c lib.c &    # 进程 2
wait              # 等两个进程完成
gcc -o build ...  # 1 秒
# 总计：3 秒
```

Multi-Agent 工作流引擎的并行调度也是同样的原理——没有依赖的任务同时跑：

```python
# 并行调度：按层执行 DAG
def execute_workflow_parallel(workflow):
    layers = topological_layers(workflow)  # 按层级划分任务

    for layer in layers:
        # 这一层的任务彼此没有依赖，可以并行
        tasks_in_layer = [workflow.tasks[id] for id in layer]

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(tasks_in_layer)) as executor:
            futures = {
                executor.submit(execute_task, task): task
                for task in tasks_in_layer
            }

            for future in concurrent.futures.as_completed(futures):
                task = futures[future]
                try:
                    result = future.result()
                    workflow.save_output(task.id, result)
                except Exception as e:
                    workflow.mark_failed(task.id, e)
```

```
Layer 1: research          ← 没有依赖，最先跑
Layer 2: design, planning   ← 都可以等 research 完成
Layer 3: implement, review  ← 可以并行，各自依赖不同的上游
Layer 4: test, deploy      ← 最后跑
```

Makefile 的 `-j` 教会 Agent 编排器：并行不是无脑多线程，而是尊重依赖图的拓扑结构——只有在拓扑序允许的情况下，才把没有依赖的任务放进同一个调度批次。

---

## 5. 失败传播：.DELETE_ON_ERROR 和 -k

Makefile 遇到编译错误，默认会停止整个流程。但如果加了 `-k`（keep going），会在当前任务失败后继续跑其他不依赖失败任务的目标：

```bash
# 默认行为：失败即停
$ make
gcc -c main.c        # 成功
gcc -c lib.c         # 失败 ✗
# 停止，不会执行链接

# -k 模式：失败后继续其他不相关目标
$ make -k
gcc -c main.c        # 成功
gcc -c lib.c         # 失败 ✗
gcc -o build main.o  # 继续（lib.o 失败了，但 main.o 成功了）
```

Multi-Agent 工作流也有类似的策略：

```python
# 失败处理策略
class FailureStrategy:
    STOP_ON_FIRST_FAILURE = "stop"      # 默认：遇到失败就停
    CONTINUE_INDEPENDENT = "keep-going"  # -k 模式：失败后继续独立任务
    COMPENSATE = "compensate"            # 失败后执行补偿操作（回滚）

# 实际执行
if strategy == "stop":
    raise WorkflowError(f"Task {task.id} failed, stopping")
elif strategy == "keep-going":
    # 标记失败，但继续跑其他不依赖此任务的目标
    workflow.mark_skippable(task.id)
    continue
```

**关键区别**：Makefile 的 `-k` 适合编译（lib.o 失败了，但 build 还能用 main.o 继续链接），但 Multi-Agent 工作流需要更谨慎——有些任务失败意味着整个工作流的结果不可信，即使其他任务"成功"了。

---

## 6. 变量和模板：DRY 原则

Makefile 支持变量和函数，减少重复：

```makefile
# 变量
CC = gcc
CFLAGS = -Wall -O2
TARGET = build

# 通配符
SOURCES = $(wildcard *.c)
OBJECTS = $(SOURCES:.c=.o)

# 模式匹配
%.o: %.c
    $(CC) $(CFLAGS) -c $< -o $@

# 函数
define run_test
    python test_$(1).py
endef
```

Multi-Agent 工作流也可以用模板减少重复：

```yaml
# 工作流模板
- name: standard_agent_task
  retry: 3
  timeout: 300s
  on_failure: log_and_notify

- name: research_agent
  extends: standard_agent_task
  agent: researcher
  prompt_template: "templates/research_prompt.j2"

- name: analysis_agent
  extends: standard_agent_task
  agent: analyst
  prompt_template: "templates/analysis_prompt.j2"
  depends_on: [research_agent]
```

DRY（Don't Repeat Yourself）在 Makefile 里是最佳实践，在 Agent 工作流里也是——把通用的重试策略、超时配置、错误处理提取成模板，比每个任务单独定义要可靠得多。

---

## 7. 伪目标：.PHONY 和工作流入口

Makefile 有 `.PHONY` 目标——不是真正的文件，只是用来触发一系列操作：

```makefile
# phony target：不是生成文件，而是触发一组操作
.PHONY: clean test install

clean:
    rm -f *.o $(TARGET)

test:
    pytest tests/

install:
    cp $(TARGET) /usr/local/bin/
```

Multi-Agent 工作流的"入口任务"就是伪目标：

```yaml
workflow:
  entrypoints:
    full_pipeline:  # 触发完整工作流
      - research
      - design
      - implement
      - test

    fast_pipeline:  # 快速验证（跳过耗时的 research）
      - mock_research
      - design
      - implement
      - test

    ci_pipeline:  # CI 用（不跑实现，只跑评估）
      - research
      - design
      - evaluate_design
```

`.PHONY` 教会 Agent 编排器：工作流不只是 DAG，还需要有入口点——用户/系统触发工作流的方式，和 DAG 本身是正交的。

---

## 8. 调试：make -n 和 dry-run

Makefile 有一个极其有用的调试模式：`-n`（dry-run），只打印会执行的操作，但不真正执行：

```bash
# 看 make 会做什么，但不真正做
$ make -n
gcc -c main.c
gcc -c lib.c
gcc -o build main.o lib.o
```

Multi-Agent 工作流也应该有 dry-run 模式：

```python
# 工作流 dry-run：模拟执行，不真正调用 Agent
def dry_run(workflow):
    print("=== Workflow Dry Run ===")
    for task in topological_sort(workflow.tasks):
        print(f"[DRY] {task.agent}: {task.description}")
        print(f"  Input: {task.input}")
        print(f"  Output: (simulated)")
        print(f"  Cost: (simulated: ${task.estimated_cost})")
        print(f"  Duration: (simulated: {task.estimated_duration}s)")
    print("=== Dry Run Complete ===")
```

Dry-run 是工作流安全性的关键保证——在上线之前看清楚"这次工作流会做什么"，避免意外触发昂贵的 API 调用或不可逆的操作。

---

## 9. 从 Makefile 能学到什么

把 Makefile 和 Multi-Agent 编排对照下来，核心设计原则其实很清晰：

**DAG 是核心抽象**：任务之间的依赖关系就是有向无环图，拓扑排序决定执行顺序。这是最简洁、最通用的工作流模型。

**增量优于全量**：不要每次都重新跑整个工作流。检查输入是否变化、任务定义是否变化，只重跑必要的部分。

**并行要尊重拓扑**：`-j` 参数不是万能的，只有在没有依赖的任务之间才能并行。Multi-Agent 工作流的并行调度也是同理。

**失败策略要明确**：是遇到失败就停（默认），还是继续跑独立任务（`-k`），还是执行补偿操作？不同的场景需要不同的策略。

**Dry-run 是安全网**：在上线之前看清楚执行计划，避免意外。Makefile 的 `-n` 用了几十年，Multi-Agent 工作流也需要同样的机制。

**模板减少重复**：把通用的模式提取成模板（重试、超时、错误处理），比每个任务单独定义更可靠、更易维护。

---

## 结语：Makefile 已经回答了工作流的核心问题

1976 年，Stuart Feldman 写下了第一个 Make。它解决的是"当几百个源文件需要按正确顺序编译时，怎么自动化这个过程"。

2024 年，Agent 框架们画着 Multi-Agent 架构图。它们解决的是"当几十个 Agent 任务需要按正确顺序协作时，怎么自动化这个过程"。

Makefile 的答案：依赖图（DAG）、拓扑排序、增量执行、并行调度、失败传播。

Multi-Agent 工作流的答案：完全一样的。

理解了 Makefile，就理解了 Agent 编排器的核心逻辑。剩下的只是把"编译 C 代码"翻译成"调度 Agent 任务"——表层语言变了，底层的计算模型没有变。

Makefile 已经 47 岁了，但它仍然是软件工程里最优雅的工作流定义语言之一。Multi-Agent 编排器们，与其花时间发明新概念，不如好好读一读 Make 的源码——里面藏着你需要的答案。
