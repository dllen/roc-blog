---
title: "Agent 的评估，90% 是 1996 年的日志分析"
date: 2026-09-01
description: "Agent 评估是 Agent 落地最难的问题之一：怎么知道一个 Agent 好不好？怎么量化它的进步？Benchmark、RLHF、自动化测试，这些听起来很新。但如果你仔细看，它们不过是 Linux 早就解决过的问题——日志分析、回归测试、SRE 的 SLO。"
taxonomies:
  tags: ["AI", "LLM", "Agent", "Linux", "评估", "测试", "SRE", "Observability"]
extra:
  update_date: 2026-09-01
---

前两篇聊了 Agent 的"基础设施"和"工具调用"，第三篇聊了"记忆"。有读者继续追问：Agent 的评估呢？怎么知道一个 Agent 好不好、怎么量化它的进步？

这是 Agent 落地最难的问题之一。Agent 的输出是自然语言，Agent 的行为是动态的，Agent 的目标是模糊的——不像传统软件，输入输出都能精确断言。

但如果把 Agent 的评估拆开来看，它面对的核心问题，和 Linux 运维工程师在 90 年代面对的问题一模一样：

- 怎么量化"系统是否健康"？
- 怎么发现"最近这次变更有没有引入问题"？
- 怎么建立"性能基线"并监控偏差？

SRE（Site Reliability Engineering）花了几十年回答这些问题。Agent 评估需要的，正是同一套方法论。

---

## 1. Agent 评估的本质：系统健康检测

先看清楚 Agent 评估面对的问题：

- 给一个 Agent 一组任务，看它完成得好不好
- 怎么定义"好"？
- 怎么让评估可重复、可比较？

这和 Linux 的"系统健康检测"几乎一样：给系统一组负载，看它的表现是否正常。区别只在于：传统系统测 latency、throughput、error rate；Agent 测任务完成率、正确性、一致性。

```python
# 传统系统监控
metrics = {
    "latency_p99": 120ms,
    "throughput": 1000 req/s,
    "error_rate": 0.1%
}
# SLO：latency_p99 < 200ms, error_rate < 1%
```

```python
# Agent 评估
eval_results = {
    "task_completion_rate": 0.85,
    "factual_accuracy": 0.92,
    "response_consistency": 0.78
}
# Benchmark：completion > 80%, accuracy > 85%
```

核心逻辑是一样的：**先定义什么是"好"，再量化当前值和"好"之间的距离。**

---

## 2. Benchmark：性能基线 = SLO

Agent 领域最常见的评估方式是 **Benchmark**——一套标准任务 + 标准答案，用来衡量 Agent 在某个维度上的表现。

这在 Linux 里对应的是 **SLO（Service Level Objective）** 和 **性能基线**：

```bash
# 建立性能基线（正常情况下的表现）
# p99 延迟 120ms，错误率 0.1%，吞吐 1000 req/s
cat /etc/slo/agent-benchmark.json
{
  "latency_p99": "120ms",
  "error_rate": "0.1%",
  "throughput": "1000req/s"
}

# 每次发布前跑回归测试，确保新版本不劣化
./run-benchmark.sh --baseline /etc/slo/agent-benchmark.json
# Result: latency_p99=125ms ✓, error_rate=0.12% ✓
# PASSED: 偏差在 5% 以内
```

Agent 的 Benchmark 也是这个逻辑：

```python
# Agent benchmark：用标准任务衡量 Agent 能力
class AgentBenchmark:
    tasks = [
        ("read_code", "读这个 Python 文件并总结逻辑", expected_output="..."),
        ("write_test", "为这个函数写单元测试", expected_output="..."),
        ("debug_error", "修复这个报错", expected_output="..."),
    ]

    def run(self, agent):
        results = []
        for task_name, prompt, expected in self.tasks:
            output = agent.run(prompt)
            score = self.judge(output, expected)
            results.append({"task": task_name, "score": score})
        return results
```

Benchmark 和 SLO 基线的核心都是：**用可控的输入，测量可量化的输出，建立可比较的基准。**

---

## 3. 黄金集：预期输出 = known answer key

很多 Agent Benchmark 的设计思路是：准备一组"黄金输入 + 黄金输出"，Agent 的输出和黄金输出越接近，分数越高。

这在 Linux 里对应的是 **golden test（黄金测试）**：

```bash
# 测试脚本的"预期输出"写好，跑了对比
./script.sh > /tmp/output.txt
diff /tmp/output.txt /expected/golden-output.txt
# 如果 diff 为空，说明输出和预期一致

# 或者用专门的 diff 工具，支持容差
diff -u /expected/golden-output.txt /tmp/output.txt
```

Agent 评估的"黄金集"是同一个思路，只是"相等"的定义从精确匹配变成了语义相似：

```python
# 精确匹配（适合有标准答案的任务）
def exact_match(predicted: str, expected: str) -> float:
    return 1.0 if predicted.strip() == expected.strip() else 0.0

# 语义相似（适合开放性任务）
def semantic_similarity(predicted: str, expected: str) -> float:
    embedding_a = embed(predicted)
    embedding_b = embed(expected)
    return cosine_similarity(embedding_a, embedding_b)

# LLM 作为评判（LLM-as-Judge）
def llm_judge(predicted: str, expected: str, task: str) -> float:
    prompt = f"任务：{task}\n预期输出：{expected}\n实际输出：{predicted}\n请给出一个 0-1 之间的分数，1 表示完美匹配"
    return float(llm(prompt))
```

**Golden test 教会 Agent 评估什么**：精确匹配适合有标准答案的场景（代码补全、数学题），LLM-as-Judge 适合开放性场景（写作质量、推理过程）。选错评估方式，比没有评估更危险——它会产生虚假的安全感。

---

## 4. 回归测试：prompts 变更 = 代码变更

Agent 的 prompt 改了，Agent 的行为可能变。Prompt engineering 和代码开发一样，需要回归测试。

Linux 的做法是 **CI/CD + 回归测试套件**：

```bash
# 代码改动触发测试
git push && ./run-tests.sh
# ✓ test_unit.py (32 tests passed)
# ✓ test_integration.py (15 tests passed)
# ✗ test_regression.py (2 tests failed)
# REJECTED: 2 regressions detected
```

Agent prompt 的改动也该走同样的流程：

```bash
# prompt 改动触发评估
git commit -m "improve error handling prompt" prompts/error-handling.yaml
./eval-agent.sh --tasks regression-suite --verbose
# ✓ Task: file_read [PASS] - 95% accuracy
# ✗ Task: code_debug [FAIL] - 68% accuracy (baseline: 82%)
# REJECTED: code_debug 退化 14%，请检查 prompt 变更
```

这是 Agent 工程化的关键一步：**把 prompt 当代码一样管理——有版本控制、有 CI、有 review、有回滚。** 很多团队 prompt 改来改去、无法复现历史表现，根本原因是把 prompt 当"配置"而不是"代码"在管。

---

## 5. A/B 测试：prompt 变体 = feature flag

Prompt 迭代需要验证哪个版本更好。Agent 框架的方案是 **A/B 测试**——两个 prompt 变体同时跑，比谁效果好。

Linux 里这叫 **feature flag / canary release**：

```bash
# 10% 流量跑新版本（新 prompt），90% 跑旧版本
# 监控两组的关键指标
curl -H "X-Feature-Flag: new-prompt" http://agent-api/tasks

# 比较结果
# Flag=new-prompt: 100 tasks, 87% success
# Flag=old-prompt: 100 tasks, 82% success
# 结论：新 prompt 提升 5%，可以全量
```

Agent 的 prompt A/B 测试也是同样的逻辑：

```python
# 两组 prompt 对比
prompt_a = "你是客服，请礼貌回答用户问题。"
prompt_b = "你是客服，请礼貌、专业地回答用户问题，重点解决用户诉求。"

results_a = run_benchmark(agent, prompt_a, tasks)
results_b = run_benchmark(agent, prompt_b, tasks)

print(f"Prompt A: {results_a.success_rate:.1%}")
print(f"Prompt B: {results_b.success_rate:.1%}")
print(f"Δ = {results_b.success_rate - results_a.success_rate:.1%}")
```

**A/B 测试的关键原则**：流量要够大（统计显著性）、观察期要够长（排除偶然）、指标要事先定义（不要事后选指标）。很多 Agent 团队"感觉"新 prompt 更好，往往是样本量不足的幻觉。

---

## 6. 日志分析：trace = dmesg / journalctl

Agent 执行过程中产生的中间步骤（tool calls、tool results、sub-agent outputs），在 Linux 里对应的是 **系统日志和 trace**：

```bash
# 完整的系统调用 trace
strace -f -e trace=read,write,execve python agent.py 2>&1 | head -100

# systemd journal 的完整日志
journalctl -u agent-bot -f --since "10 minutes ago"
# Sep 01 10:23:45 agent-bot python[12345]: [AGENT] Starting task: read_code
# Sep 01 10:23:46 agent-bot python[12345]: [TOOL] Calling: read_file(path="/tmp/code.py")
# Sep 01 10:23:47 agent-bot python[12345]: [TOOL] Result: 45 lines read
# Sep 01 10:23:48 agent-bot python[12345]: [AGENT] Reasoning: the code uses...
```

Agent 的 trace 系统也在做同样的事情——把 Agent 的执行过程完整记录下来，用于事后分析：

```python
# 结构化日志：每一步都打点
agent_trace.log({
    "event": "tool_call",
    "tool": "read_file",
    "args": {"path": "/tmp/code.py"},
    "result": {"lines": 45, "success": True},
    "timestamp": "2026-09-01T10:23:46Z"
})
```

完整的 trace = journalctl，结构化的 step 日志 = auditd。两者的目的都是**事后分析**：Agent 这次为什么错了？哪一步开始偏离的？能否复现？

---

## 7. 错误分析：core dump = failure replay

Agent 失败了，需要分析原因。Linux 的做法是 **core dump + 事后复盘**：

```bash
# 进程崩溃，生成 core dump
# /var/crash/core.2026-09-01.12345

# 分析 core dump
gdb /path/to/agent binary /var/crash/core.2026-09-01.12345
# (gdb) bt  # backtrace
# #0  0x00007f3e2a1b2a3d in __GI_raise (sig=sig@entry=11)
# #1  0x00007f3e2a1b3895 in __GI_abort ()
# #2  0x00007f3e2a1d0667 in __GI__IO_default_bufref ()

# 找到崩溃行，修 bug，再上线
```

Agent 的等价物是 **failure replay**——把 Agent 失败 case 的完整输入保存下来，用于事后复盘：

```python
# 保存失败 case
if not task.success:
    save_failure_case(
        task_id=task.id,
        input=task.input,
        expected=task.expected_output,
        actual=task.actual_output,
        trace=task.trace,
        error=task.error
    )

# 事后 replay：给定相同输入，看 Agent 现在的表现
# 如果现在能通过，说明修了什么；如果还是失败，说明问题更深
replay_result = agent.run(failure_case.input)
assert replay_result == failure_case.expected, "Still failing!"
```

Core dump 和 failure replay 的目的都是**可复现的调试**——把失败的上下文固定下来，让工程师不用重现就能分析。Agent 的 failure replay 还能做**自动 regression detection**：每次发布前，把历史失败 case 都跑一遍，确保没有退化。

---

## 8. SLO：错误预算 = eval pass rate

SRE 有一个核心概念叫 **SLO（Service Level Objective）** 和 **错误预算（Error Budget）**：

```bash
# SLO：每月 99.9% 可用
# 月总时间 = 43200 分钟
# 允许宕机时间 = 43 分钟（错误预算）

# 错误预算消耗殆尽时，停止新功能开发，全力修稳定性
# 错误预算充裕时，可以激进地发新功能

if error_budget_remaining < 10%:
    alert("Error budget low, freeze deploys!")
else:
    proceed_with_release()
```

Agent 评估也能建立类似的"质量 SLO"：

```python
# Agent SLO：每周评估通过率 > 90%
eval_results = run_weekly_benchmark(agent)

pass_rate = eval_results["overall_score"]
error_budget = 1.0 - eval_results["target"]  # 10% 允许失败

if pass_rate < eval_results["target"]:
    alert(f"Agent quality SLO breach: {pass_rate:.1%} < {eval_results['target']:.1%}")
    block_prompt_changes()
else:
    print(f"Quality healthy: {pass_rate:.1%}, {error_budget:.1%} error budget remaining")
```

**SLO 思维对 Agent 评估的启发**：评估不是一次性活动，而是持续的质量监控。要建立定期评估节奏（daily/weekly），维护评估结果的 trend（是在变好还是变差），用错误预算来决定"这次 prompt 改动值不值得上线"。

---

## 9. 从日志分析能学到什么

把 Linux 日志分析和 Agent 评估对照下来，核心方法论其实很清晰：

**量化是起点**：不能测量的东西就不能管理。先定义清楚"什么是好"（SLO），再建立测量机制（benchmark），再持续监控（dashboard + alert）。

**回归测试是安全网**：prompt 改动必须走 CI——跑一遍黄金集，确保没有退化。宁可发版慢一点，也要保证 Agent 不会因为一次 prompt 改动而整体变差。

**trace 是调试的基础**：完整的执行 trace（tool calls + intermediate results）是事后分析的必要条件。日志不打点，Agent 失败了都不知道哪一步出了问题。

**SLO + 错误预算把评估变成工程问题**：不是"我们要让 Agent 尽可能好"，而是"我们的目标是 85% 准确率，低于 80% 触发告警，高于 90% 可以继续迭代"。有边界的质量目标比无限追求完美更实用。

**A/B 测试防止主观臆断**："我觉得新 prompt 更好"不等于"数据证明新 prompt 更好"。用统计显著性说话，不要用直觉说话。

---

## 结语：评估的本质从未改变

1996 年，Linux 工程师面对的问题是：怎么知道这台服务器是否健康？

他们的答案是：建立 SLO，记录指标，跑回归测试，监控趋势，分析 core dump，把质量变成可量化的工程问题。

2026 年，Agent 工程师面对的问题是：怎么知道这个 Agent 是否满足用户需求？

答案是完全一样的：建立 Benchmark，测量 pass rate，跑回归测试，trace 执行过程，分析失败 case，用错误预算控制迭代节奏。

Agent 评估没有发明新的方法论——它只是把 SRE 几十年的经验，用 Agent 的语言重新说了一遍。

理解了这一点，你就既懂了 Linux 的运维哲学，也懂了 Agent 评估的本质：不是追求完美的 AI，而是把不确定性变成可管理的风险。

一个健康的 Agent，和一台健康的服务器一样：不需要永远不犯错，只需要知道什么时候会犯错、为什么犯错，以及怎么修复。
