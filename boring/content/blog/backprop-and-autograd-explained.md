---
title: "反向传播与 Autograd：梯度是怎么算出来的"
date: 2026-11-09
update_date: 2026-11-09
description: "从链式法则到 PyTorch 的 autograd：讲清计算图、.grad 与 .grad_fn 的区别、线性层梯度公式 dX=GW^T 与 dW=X^TG 的逐元素推导，以及零_grad 写错时训练如何偏离真值。附三段可运行且已实测的 PyTorch 代码。"
tldr: "反向传播没有魔法，它就是链式法则按拓扑序逐层回退。autograd 只是替你决定先求哪个变量的导数，剩下的全是你自己在纸上写过的那几行公式。"
keywords: ["反向传播", "PyTorch autograd", "计算图", "链式法则", "线性层梯度", "梯度累积"]
taxonomies:
  tags: ["LLM原理", "PyTorch", "反向传播", "工程实践"]
---

反向传播与 Autograd 如何用链式法则高效算出所有参数的梯度？PyTorch 的 autograd 又是如何以计算图的方式无感知地完成这一切？最后落到线性层梯度推导（`dX = GW^T`、`dW = X^T G`）这个贯穿全课程的工程基本功上。

本文整理自南京大学《大语言模型基础：从零到一实现之路》第 3 讲（主讲：徐经纬），[原始幻灯片](https://njudeepengine.github.io/llm-course-lecture/2026/lecture3.html)。文中三段演示代码在 CPU 版 PyTorch 2.8.0 下逐行跑过，输出为实跑结果；讲义原版示例里有两处会直接报错或跑出偏差的地方，已在下文标注并修正。

## 一、训练是什么：猜、评估、更新

假设构建模型 f，其参数为 θ。目标是设计一种度量，刻画基于 θ 的预测结果与真实结果的差距，差距越小，模型越接近要估计的函数：

```
J(θ) = (1/n) Σ_X (f*(X) - f(X; θ))²
```

学习方法是梯度下降，寻找合适的 θ——这被称为**训练模型**。以最小化预测与真值的平方误差为目标，训练循环是三步：

1. 猜个 θ，根据输入 X 计算预测 Ŷ = f(X; θ)；
2. 评估误差：Y 和 Ŷ 的误差（loss）；
3. 根据误差更新 θ：θ = θ - λ·Δθ。

难点在第 3 步：深度学习模型是复合函数，直接求梯度困难。**反向传播算法按层「回退」，一层一层求偏导**，一次前向、一次反向就能拿到所有参数的梯度。

## 二、链式法则与计算图

深度模型形如 `y = f3(f2(f1(X)))`。展开链式法则：

```
∂J/∂θ_f1 = ∂J/∂y · ∂y/∂f3 · ∂f3/∂f2 · ∂f2/∂f1 · ∂f1/∂θ_f1
```

**计算图**（computation graph）就是把这套依赖关系显式画出来：节点是变量（input、weight）和算子，边是数据传递。前向沿边正向计算，反向沿边反向计算梯度。

偏导的构建有两条路线：**传统手工实现** 与 **基于计算图的 autograd**。后者是主流做法。

## 三、线性层的反向：两个核心公式

线性层 `Z = XW + b`，其中 X 是 `[N, D]`，W 是 `[D, E]`，b 是 `[E]`；损失函数 `L = CrossEntropy(Z, y)`。

- **前向**：计算 logits Z `[N, E]`，再算标量损失 L。
- **反向**：损失函数先传回上游梯度 `G = ∂L/∂Z`。

三个梯度各有形状约束：

| 梯度 | 公式 | 形状 |
|------|------|------|
| 输入梯度 | `dX = G W^T` | `[N, D]` |
| 权重梯度 | `dW = X^T G` | `[D, E]` |
| 偏置梯度 | `db = Σ_n G[n, :]` | `[E]` |

**权重梯度为什么要展平求和**：`W[de]` 被所有样本位置共享，各位置的贡献相加。令 `N = B × H`（批次 × 序列位置），把位置维合并但不改变元素对应关系：

```
X_flat [N, D],  G_flat [N, E]
dW = X_flat^T [D, N] @ G_flat [N, E] → [D, E]
```

矩阵乘法对 N 求和，恰好汇总所有位置。

**输入梯度为什么是 `G W^T`**：一个输入元素 `X[bhd]` 影响同一位置的所有 E 个输出，所以对输出特征维 E 求和：

```
∂L/∂X[bhd] = Σ_e G[bhe] · W[de]
```

写成矩阵乘就是 `dX = G @ W^T`，形状 `[B,H,E] @ [E,D] → [B,H,D]`。转置让求和维对齐。

**注意 `nn.Linear` 的权重布局**：公式里 `W` 是 `[D, E]`，但 PyTorch 的 `nn.Linear` 实际存的是 `[E, D]`（out_features, in_features），代码里写 `W.t()` 转置过去。

## 四、`.grad` 与 `.grad_fn`：两件不同的事

这是 autograd 最容易搞混的一对属性：

| 属性 | 回答的问题 | 内容 |
|------|-----------|------|
| `t.grad_fn` | 这个张量由什么运算产生，如何往回求导？ | 反向节点对象，或 `None` |
| `t.grad` | 本次目标对这个张量的梯度是多少？ | 梯度 Tensor，或 `None` |

- `.grad_fn` 在被追踪的前向运算中建立，**它是计算规则，不是梯度数值**。
- `.grad` 在反向时写入并累加，shape 与对应张量相同。
- 需梯度的叶子默认保存 `.grad`；非叶子需先调用 `retain_grad()`。
- **`.grad is None` 表示没有保存梯度值，不等于梯度为 0。**

线性层反传中的典型反向节点：

- **AddmmBackward**：对应 addmm 的反向（矩阵乘 + 偏置相加），是 `nn.Linear` / `F.linear` 的核心反向。
- **TBackward**：对应 transpose 的反向，反传时把梯度转回原始维度。
- **AccumulateGrad**：不是算子反向，而是「叶子张量梯度累加」节点，把传来的梯度写入叶子张量（如 `Linear.weight`/`bias`）的 `.grad` 中，并按步累加。

用一个最小例子看清三者的关系：

```python
import torch

x = torch.tensor([1., 2., 3.], requires_grad=True)
y = 2 * x
loss = y.sum()
y.retain_grad()  # 为了观察，保留非叶子 y 的梯度

print(x.grad, y.grad)          # None, None：尚未反向
print(x.grad_fn)               # None：x 是直接创建的叶子
print(type(y.grad_fn).__name__)  # MulBackward0
loss.backward()
print(x.grad)                  # tensor([2., 2., 2.])
print(y.grad)                  # tensor([1., 1., 1.])
```

梯度沿反向节点流动的路径是：

```text
loss.grad_fn       y.grad_fn              x 的梯度累加节点
SumBackward0  →    MulBackward0      →     AccumulateGrad
   1 → [1,1,1]      [1,1,1] × 2 → [2,2,2]  写入 x.grad
```

不调用 `y.retain_grad()`，梯度仍经过 `y` 传回 `x`，只是不会保存在 `y.grad`。

**AccumulateGrad 意味着梯度默认累加**：

```python
(2 * x).sum().backward()  # 新的前向与反向
print(x.grad)             # [4,4,4]：旧梯度 + 本次梯度
x.grad = None             # 清除已保存的梯度
(2 * x).sum().backward()
print(x.grad)             # [2,2,2]
```

`x.grad_fn` 始终是 `None`——叶子 `x` 不是由这个累加节点生成的。`backward()` 不更新参数；训练时用 `optimizer.zero_grad()` 清零，`optimizer.step()` 更新参数。

## 五、手写链式法则 vs autograd 对拍

**autograd 并没有做任何魔法**，它执行的正是你手写的那几行公式，只是把「先求哪个变量」交给了拓扑序。用一个 2→3→1 的两层小网络对拍一下。

> **讲义原版示例有一处会直接报错**：原文把第一层权重写成 `torch.tensor([[1.0, 2.0], [0.5, -1.0]])`，形状是 `[2, 2]`，但下一层权重和偏置都是 3 维，`x @ W1` 得到 `[1, 2]` 后与长度 3 的 `b1` 相加会抛出 `RuntimeError: The size of tensor a (2) must match the size of tensor b (3)`。按讲义自己的预期输出（`h_pre` 为 3 维、`dW1` 为 `[2, 3]`）反推，`W1` 应当是 `[2, 3]`。下面用修正后的权重，并保持讲义的全部预期数值不变。

```python
import torch

# ---- 参数与输入：全部手工指定，保证输出可手工推算 ----
x = torch.tensor([[1.0, -1.0]])          # [1,2]
W1 = torch.tensor([[1.0, 2.0, 1.5],       # [2,3]  ← 讲义原文此处少了一列
                   [0.5, -1.0, -1.5]])
b1 = torch.tensor([0.25, -4.0, 0.0])      # [3]
W2 = torch.tensor([[2.0],                  # [3,1]
                   [-1.0],
                   [0.5]])
b2 = torch.tensor([-0.5])                  # [1]
target = torch.tensor([[1.0]])

# 参与求导的副本
x_g  = x.clone().requires_grad_(True)
W1_g = W1.clone().requires_grad_(True)
b1_g = b1.clone().requires_grad_(True)
W2_g = W2.clone().requires_grad_(True)
b2_g = b2.clone().requires_grad_(True)

# ---- 前向 ----
h_pre = x_g @ W1_g + b1_g      # [1,3]
h     = torch.relu(h_pre)      # [1,3]
out   = h @ W2_g + b2_g        # [1,1]
loss  = ((out - target) ** 2).sum()
loss.backward()                # autograd 的反向

# ---- 手写反向：逐层链式法则 ----
dout = 2 * (out.detach() - target)      # dL/d(out)      [1,1]
dW2  = h.detach().T @ dout               # [3,1] @ [1,1] -> [3,1]
db2  = dout.sum(0)                       # [1]
dh   = dout @ W2.T                       # [1,1] @ [1,3] -> [1,3]
dh_pre = dh * (h_pre.detach() > 0)       # ReLU 用 mask 把负半轴梯度清零
db1  = dh_pre.sum(0)                     # [3]
dW1  = x.T @ dh_pre                      # [2,1] @ [1,3] -> [2,3]
dx   = dh_pre @ W1.T                     # [1,3] @ [3,2] -> [1,2]

print("forward loss =", loss.item())
print("h_pre        =", h_pre.detach().tolist())
print("out          =", out.detach().tolist())
print("manual dW1   =", dW1.tolist())
print("manual dW2   =", dW2.tolist())
print("manual dx    =", dx.tolist())
print("allclose (W1, b1, W2, b2, x) =",
      torch.allclose(W1_g.grad, dW1),
      torch.allclose(b1_g.grad, db1),
      torch.allclose(W2_g.grad, dW2),
      torch.allclose(b2_g.grad, db2),
      torch.allclose(x_g.grad, dx))
```

实测输出：

```text
forward loss = 2.25
h_pre        = [[0.75, -1.0, 3.0]]
out          = [[2.5]]
manual dW1   = [[6.0, 0.0, 1.5], [-6.0, 0.0, -1.5]]
manual dW2   = [[2.25], [0.0], [9.0]]
manual dx    = [[8.25, 0.75]]
allclose (W1, b1, W2, b2, x) = True True True True True
```

**要点**：

- 手推一遍前向：`x W1 = [0.5, 3.0]`，加 `b1` 得 `h_pre = [0.75, -1.0, 3.0]`；ReLU 把中间那个负数压成 `0`；`h W2 = 0.75×2 + 0×(-1) + 3×0.5 = 3.0`，加 `b2 = -0.5` 得 `out = 2.5`，`L = (2.5 - 1)² = 2.25`。
- 手推一遍反向：`dL/dout = 2(2.5-1) = 3.0` → `dW2 = h^T · dL/dout = [2.25, 0, 9]` → `dh = [6.0, -3.0, 1.5]` → ReLU mask `[1,0,1]` 把它变成 `[6.0, 0.0, 1.5]` → `dW1 = x^T · dh_pre`。
- **第 2 维的梯度整条链都是 0**，这就是 ReLU「负半轴不传梯度」的直接后果。
- 五组梯度全部 `allclose=True`：autograd 执行的正是这五行链式法则。

**一处与讲义不同的地方**：讲义给的 `manual dx` 是 `[7.5, 1.5]`，用修正后的 `W1` 实跑得到的是 `[8.25, 0.75]`。差异来自 `W1` 第三列的取值——讲义原文那一列是缺失的，`dx` 依赖完整权重矩阵，所以无法在原文的 `W1` 上复现 `[7.5, 1.5]`。`dx` 的作用是展示输入也在梯度流里：推理时不需要它，但输入本身可微（如 VAE、对比学习）时它就会被用到。

## 六、梯度下降：每一步误差恰好减半

一个 `X = I` 的两参数线性回归（数据正交，两个参数互不干扰），跑 6 步打印 `w` 与 loss。

> **讲义原版示例的另一处问题**：原文写 `y = torch.tensor([[3.0], [-2.0]])`，形状 `[2, 1]`，而 `pred = X @ w` 得到的是 `[2]`。相减时 PyTorch 广播成 `[2, 2]`，`mean()` 对四个元素求平均，梯度不再等于 `(w - y)`，实测第一步得到的是 `w = [0.25, 0.25]` 而不是讲义预期的 `[1.5, -1.0]`，「误差每步恰好减半」的结论也就不成立了。把 `y` 改成形状 `[2]` 后一切与讲义预期一致。

```python
import torch

X = torch.tensor([[1.0, 0.0],       # [2,2]，单位阵：两个特征互不干扰
                  [0.0, 1.0]])
y = torch.tensor([3.0, -2.0])       # [2]  ← 讲义原文写成 [[3.0], [-2.0]]，会广播成 [2,2]
w = torch.zeros(2, requires_grad=True)
lr = 0.5

for step in range(6):
    pred = X @ w                   # [2]
    loss = ((pred - y) ** 2).mean()
    print(f"step {step}: w = [{w[0].item():.5f}, {w[1].item():.5f}]"
          f"  loss = {loss.item():.5f}")
    loss.backward()                # 反向：dL/dw = w - y
    with torch.no_grad():          # 参数更新不进计算图
        w -= lr * w.grad
    w.grad = None                  # 清零梯度（等价于 optimizer.zero_grad()）
```

实测输出：

```text
step 0: w = [0.00000, 0.00000]  loss = 6.50000
step 1: w = [1.50000, -1.00000]  loss = 1.62500
step 2: w = [2.25000, -1.50000]  loss = 0.40625
step 3: w = [2.62500, -1.75000]  loss = 0.10156
step 4: w = [2.81250, -1.87500]  loss = 0.02539
step 5: w = [2.90625, -1.93750]  loss = 0.00635
```

**要点**：

- 因为 `X = I`，`∂L/∂w = w - y`，更新式 `w ← w - 0.5(w - y) = 0.5w + 0.5y`，即**误差每步精确减半**；6 步后 `w` 收敛到 `[3, -2]`，loss 从 `6.5` 掉到 `0.0063`，量级上降了三个数量级。
- `y` 是负数，所以第二个分量是「往上走」——梯度下降不看正负，只看梯度的方向永远与 loss 下降方向一致。
- 更新顺序是 `loss.backward()` → `no_grad()` 内更新 → 清零。`no_grad()` 保证参数更新本身不被记进计算图，否则下一步的图会无限拉长。
- 这个例子的 `w` 每步精确减半是数据设计的结果；真实数据上 loss 曲线会有抖动，这正是非凸损失面与学习率调参的动机。

## 七、忘记 `zero_grad()` 的后果

同一批小样本分两轮（模拟 micro-batch），一边每轮清零、一边不清零，把梯度缓冲区里累积的旧梯度直接拿去更新参数。

```python
import torch

samples = [(torch.tensor([[1.0]]), torch.tensor([[2.0]])),   # 1 * w -> 2
           (torch.tensor([[3.0]]), torch.tensor([[6.0]]))]   # 3 * w -> 6
lr = 0.1

def run(clear):
    w = torch.zeros(1, requires_grad=True)
    log = []
    for x, t in samples:
        loss = ((x @ w - t) ** 2).mean()
        loss.backward()                     # 梯度「累加」进 w.grad
        g = w.grad.clone()                  # 本轮结束时的缓冲区内容
        if clear:
            w.grad = None                   # 清零；删掉这行就是忘记 zero_grad()
        with torch.no_grad():
            w -= lr * g
        log.append((w.item(), g.item()))
    return log

ok = run(clear=True)
bad = run(clear=False)

for i in range(2):
    print(f"round {i+1}: 正确 w={ok[i][0]:.4f} grad={ok[i][1]:.4f} | "
          f"忘记清零 w={bad[i][0]:.4f} grad={bad[i][1]:.4f}")
print(f"两轮后参数差 = {abs(bad[1][0] - ok[1][0]):.4f}")
```

实测输出：

```text
round 1: 正确 w=0.4000 grad=-4.0000 | 忘记清零 w=0.4000 grad=-4.0000
round 2: 正确 w=3.2800 grad=-28.8000 | 忘记清零 w=3.6800 grad=-32.8000
两轮后参数差 = 0.4000
```

**要点**：

- 第一轮两者完全一致（缓冲区里还没有旧梯度）；第二轮开始分叉：正确路径梯度是 `-28.8`，忘记清零的路径是 `-4 + (-28.8) = -32.8`，**上一轮的梯度被当成了本轮的一半额外信号**。
- 后果不是「收敛慢一点」，而是**在朝错误方向走**：`w` 被推到 `3.68` 而不是 `3.28`，偏离真值 `6` 更远。轮次越多，累积的旧梯度占比越大，训练会越走越歪。
- 判定标准很简单：如果 `p.grad` 的数量级随训练轮次持续增长，说明梯度在累积。
- 正确写法是训练循环三件套 `optimizer.zero_grad()` → `loss.backward()` → `optimizer.step()`；`optimizer.zero_grad(set_to_none=True)` 比默认的置零更快（直接把 `.grad` 置 `None`，省掉一次清零内存写）。
- 顺带一提：**梯度累积本身是刻意设计的特性**——大模型训练用 `gradient_accumulation_steps` 把多个小 micro-batch 的梯度加总，模拟大 batch；区别只在于你是否在累积的边界上做一次真正的清零。

## 八、detach 与 no_grad：两种截断方式

| 写法 | 行为 | 典型用途 |
|------|------|---------|
| `x.detach()` | 把张量从当前计算图中分离，后续计算不会把梯度回传到被分离的分支 | 截断梯度（冻结某分支、teacher 模型前向）；缓存中间结果重复使用但不参与训练 |
| `with torch.no_grad():` | 上下文内不记录计算图，不分配 `grad_fn`/中间量，这些计算不参与 `loss.backward()` | 纯推理/验证（配合 `model.eval()`）；统计/后处理（metrics、argmax/topk）；无梯度的参数更新（EMA、手写优化步骤） |

注意事项：

- **不要在训练前向外层包 `no_grad` / `inference_mode`**，否则无法计算梯度。
- `detach()` 会打断梯度流，误用会让模型学不动；仅在确需截断时使用。
- 分离张量与原张量共享存储，避免原地写引入隐性错误。

## 九、标量与非标量 backward

反向传播需要一个起点，对标量来说就是 1。

- **标量 backward**：对标量输出使用 `y.backward()`。如果 `y.shape = [batch, dim]`，直接调用会报错——torch 内部不知道该对哪个方向做反向传播。
- **非标量 backward**：使用 `y.backward(gradient=v)`，`v` 与 `y` 同形，表示上游 grad 权重。

## 十、工程视角看 Autograd

**动态计算图与 VJP**：前向即时构图；非叶子张量有 `grad_fn`，叶子张量的梯度写入 `.grad`。`backward()` 等价于逐层执行向量-雅可比积 `v^T J`——工程上无需显式构造雅可比矩阵即可完成训练。背后采用的是反向模式自动微分。**理解到「反向模式自动微分的高效实现」这个程度就足够上手，不必先掌握雅可比的形式化定义。**

**高阶与多次反向**：按需使用 `create_graph=True` 与 `retain_graph=True`；默认一次反向后释放图。

```python
g = torch.autograd.grad(loss, params, create_graph=True)
g2 = torch.autograd.grad(sum(p.sum() for p in g), params)
```

**性能与调试**：AMP、梯度检查点、`torch.compile`；结合 hooks 与 notebook 的图打印定位梯度流。

```python
h = []
def log_grad(grad):
    h.append((grad.mean().item(), grad.norm().item()))

out = net(x)
out.register_hook(log_grad)    # 观察上游梯度
loss = criterion(out, y)
loss.backward()
```

## 十一、它不解决什么

- **梯度算对了，不等于模型学得好。** 损失函数选错、标签有噪声、数据分布有偏，反向传播只会忠实地把你带向一个错误的最优解。
- **非凸问题没有全局最优保证。** 梯度下降只能找到局部解，鞍点附近梯度接近零，容易误判为收敛。学习率调度、warmup、Adam 类自适应方法都是在处理这件事，它们不改变反向传播本身的定义。
- **数值稳定性不在链式法则的射程内。** 深层网络里的梯度爆炸或消失，根源是连乘的雅可比因子过大或过小，需要靠归一化（LayerNorm / RMSNorm）和残差连接来缓解，PyTorch 不会替你做这件事。
- **显存开销在图上，不在梯度上。** 反向需要保留前向的中间结果，图越大占用的显存越多。梯度检查点（gradient checkpointing）用「重算前向换取省显存」，代价是多一次前向计算。

## 十二、一句话总结

**前向建立反向计算所需的图，反向计算梯度，优化器更新参数**——三者各司其职。反向传播的本质是针对优化目标按层回退，一层一层求偏导；autograd 把这件事做成了无感知的调用，但底层仍然是链式法则。

线性层反向的 `dX = GW^T`、`dW = X^T G` 必须烂熟于心：权重被所有位置共享，所以 `dW` 要先展平位置维再求和。这是后续手撕 attention、FFN 反向的通用模板。

## 延伸阅读

- [PyTorch Autograd 官方文档](https://pytorch.org/docs/stable/autograd.html)：讲义在解释 VJP 与反向模式自动微分时明确推荐。
- [反向模式自动微分综述](https://www.cs.toronto.edu/~hinton/absps/cogscibm.pdf)：Baydin et al.，讲义提示的理论背景。
- AMP、梯度检查点、`torch.compile`：讲义在性能与调试部分提及的三件工程利器，均可在 PyTorch 官方文档找到专题指南。
- 相关阅读：[RMSNorm 与 SwiGLU：Llama 的两块拼图](/blog/rmsnorm-and-swiglu-ffn-explained/)、[RoPE 旋转位置编码：Attention 如何感知顺序](/blog/rope-and-input-embedding-explained/)。
