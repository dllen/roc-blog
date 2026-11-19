---
title: "前向执行：把「模型如何运行」写成可运行的断言"
date: 2026-11-19
update_date: 2026-11-19
description: "大语言模型基础第 2 讲讲清楚了 Tensor、线性层、广播与 einsum，但所有结论都是散文形式的断言。这篇把它们逐条变成可执行的验证：广播规则写成判定器与 torch 对拍 144 组形状全中，多层 Linear 可折叠的代数恒等式实测误差 2.2e-06，einsum 写错却静默通过反而更危险。"
tldr: "讲义说「从最后维度向前对齐、相等或其一为 1」——把它写成判定器与 torch 对拍 144 组形状，零分歧。但 einsum 的字符串写错不一定报错：bhd,de->bhd 会静默变成「x 乘以 w 的行和」，形状 (2,3,4) 而不是你要的 (2,3,5)。"
keywords: ["广播规则 判定器", "einsum 维度约定", "nn.Linear 权重布局", "多层线性 折叠", "前向执行 断言", "Tensor 形状"]
taxonomies:
  tags: ["编程语言", "系统设计", "人工智能"]
---

大语言模型基础第 2 讲的任务是「建立计算直觉」——回答一个问题：**一个模型在计算机里究竟是怎么运行的？** 答案是：输入 Tensor → 执行 forward → 输出 Tensor。

这一讲的内容密度很高：线性层、矩阵乘、三类乘法的区别、广播的三条兼容规则、einsum 的维度约定、`nn.Module` 的组合与残差、`nn.Linear` 的权重布局。**但每一个结论都是散文形式的断言**——「广播要求对应维度要么相等、要么其一为 1」「多层 Linear 仍是线性变换」「einsum 里 `d` 只在输入中出现所以沿 d 求和」。

散文形式的断言有个共同弱点：**读者相信它，但没法验证它**。这篇把第 2 讲的三条核心断言变成可执行的检查，每条都给出「讲义说什么 → 实跑是什么 → 差在哪」。

> 这篇整理自南京大学《大语言模型基础：从零到一实现之路》第 2 讲「特征空间的变换——模型如何前向执行」的中文笔记（主讲：徐经纬，讲义幻灯片见 [njudeepengine.github.io](https://njudeepengine.github.io/llm-course-lecture/2026/lecture2.html)）。讲义的结论本身经核对**全部正确**，本文的增量在于把它们变成可机械验证的断言，并指出讲义未覆盖的边界情形。

## 一、广播规则：把三条散文规则写成判定器

讲义给的广播规则是三条：

1. 从最后一个维度向前对齐
2. 对应维度要么大小相等；要么其中一个为 `1`
3. 较短 Tensor 缺失的前导维度视为 `1`

**这是一套完整的判定程序**，所以它可以被写下来，然后拿去和 torch 对拍：

```python
"""Turn the lecture's three prose broadcasting rules into an executable checker.

The lecture states the rules like this:
  1. align from the last dimension backwards
  2. each aligned pair must be equal, or one of them must be 1
  3. a shorter tensor's missing leading dimensions count as 1

That is a decision procedure, so it can be written down. This implements it,
then cross-checks it against what torch actually does over a grid of shapes,
including cases the lecture does not cover.
"""
import itertools
import torch


def broadcast_shape(a, b):
    """Apply the lecture's rules; return the result shape or None."""
    n = max(len(a), len(b))
    pa = (1,) * (n - len(a)) + tuple(a)
    pb = (1,) * (n - len(b)) + tuple(b)
    out = []
    for x, y in zip(pa, pb):
        if x == y:
            out.append(x)
        elif x == 1:
            out.append(y)
        elif y == 1:
            out.append(x)
        else:
            return None
    return tuple(out)


def torch_shape(a, b):
    """What torch does, or None if it refuses."""
    try:
        return tuple((torch.zeros(a) + torch.zeros(b)).shape)
    except RuntimeError:
        return None


SHAPES = [
    (2, 2, 3), (2, 3), (3,), (2, 1), (1, 3), (4,), (2, 2, 1),
    (1, 1, 3), (5, 1, 1), (1,), (3, 2), (2, 3, 4),
]


def run():
    print("checking the lecture's rules against torch over %d shape pairs"
          % (len(SHAPES) ** 2))
    print("")
    agree = 0
    disagree = []
    for a, b in itertools.product(SHAPES, repeat=2):
        mine = broadcast_shape(a, b)
        theirs = torch_shape(a, b)
        if mine == theirs:
            agree += 1
        else:
            disagree.append((a, b, mine, theirs))
    print("rule checker agrees with torch on %d of %d pairs"
          % (agree, len(SHAPES) ** 2))
    print("disagreements: %d" % len(disagree))
    for a, b, mine, theirs in disagree:
        print("   %s + %s -> rule %s, torch %s" % (a, b, mine, theirs))
    print("")

    print("the lecture's two worked examples:")
    x = torch.tensor([[[1., 2., 3.], [4., 5., 6.]],
                      [[7., 8., 9.], [10., 11., 12.]]])
    b = torch.tensor([10., 20., 30.])
    y = x + b
    print("   [B,H,E] + [E] with B=2,H=2,E=3")
    print("   y[0] = %s" % y[0].tolist())
    print("   y[1] = %s" % y[1].tolist())
    expected = [[[11., 22., 33.], [14., 25., 36.]],
                [[17., 28., 39.], [20., 31., 42.]]]
    print("   matches the lecture's numbers: %s" % (y.tolist() == expected))
    print("")

    scale = torch.tensor([[10.], [100.]])
    z = x * scale
    print("   [B,H,E] * [H,1] with the same x")
    print("   z[0] = %s" % z[0].tolist())
    print("   z[1] = %s" % z[1].tolist())
    expected2 = [[[10., 20., 30.], [400., 500., 600.]],
                 [[70., 80., 90.], [1000., 1100., 1200.]]]
    print("   matches the lecture's numbers: %s" % (z.tolist() == expected2))
    print("")

    print("cases the lecture does not show:")
    for a, b in [((2, 2, 3), (2, 1)), ((2, 2, 3), (3, 1)), ((2, 2, 3), (1, 2, 3))]:
        print("   %s + %s -> %s" % (a, b, broadcast_shape(a, b)))
    print("   ([2,2,3] + [2,1]) is NOT the same as ([2,2,3] * [H,1]):")
    print("   the [2,1] case aligns to the LAST two dims, so it scales E")
    print("   and H; the [H,1] case aligns to H and E")


if __name__ == "__main__":
    run()
```

```text
checking the lecture's rules against torch over 144 shape pairs

rule checker agrees with torch on 144 of 144 pairs
disagreements: 0

the lecture's two worked examples:
   [B,H,E] + [E] with B=2,H=2,E=3
   y[0] = [[11.0, 22.0, 33.0], [14.0, 25.0, 36.0]]
   y[1] = [[17.0, 28.0, 39.0], [20.0, 31.0, 42.0]]
   matches the lecture's numbers: True

   [B,H,E] * [H,1] with the same x
   z[0] = [[10.0, 20.0, 30.0], [400.0, 500.0, 600.0]]
   z[1] = [[70.0, 80.0, 90.0], [1000.0, 1100.0, 1200.0]]
   matches the lecture's numbers: True

cases the lecture does not show:
   (2, 2, 3) + (2, 1) -> (2, 2, 3)
   (2, 2, 3) + (3, 1) -> None
   (2, 2, 3) + (1, 2, 3) -> (2, 2, 3)
   ([2,2,3] + [2,1]) is NOT the same as ([2,2,3] * [H,1]):
   the [2,1] case aligns to the LAST two dims, so it scales E
   and H; the [H,1] case aligns to H and E
```

**判定器与 torch 在 144 组形状对上零分歧。** 讲义的规则是准确的——这是个好消息，但也说明**光靠读规则得不到任何新东西**。

真正有价值的是它**能不能用**。把规则写成判定器之后，它立刻可以做三件讲义没提的事：

**第一，自动判「能不能广播」，不用靠人脑对齐维度。** 讲义给的是一张三行表格：

| 运算 | 对齐过程 | 结果 |
|---|---|---|
| `[B,H,E] + [E]` | `[B,H,E] + [1,1,E]` | `[B,H,E]` |
| `[B,H,E] * [H,1]` | `[B,H,E] * [1,H,1]` | `[B,H,E]` |
| `[B,H,E] + [D]` | $E \ne D$ | 报错 |

这只是三个例子。判定器把它变成**任意形状对**的判断——包括讲义没列的那些：

```
   (2, 2, 3) + (2, 1) -> (2, 2, 3)
   (2, 2, 3) + (3, 1) -> None
   (2, 2, 3) + (1, 2, 3) -> (2, 2, 3)
```

**第二，它抓住了讲义表格里没有的一个陷阱。** `[2,2,3] + [2,1]` 和 `[2,2,3] * [H,1]` **不是同一件事**，尽管形状表看起来都「对齐成三维」：

- `[H,1]` 从右往左对齐到的是 **H 和 E** 两维 → 沿 E 维重复，第 h 个头乘第 h 个标量；
- `[2,1]` 同样从右往左对齐到的是 **H 和 E** 两维（`[2,1]` 补成 `[1,2,1]`）→ 也是沿 E 重复。

而 `(2,2,3) + (3,1)` 直接不可广播——因为 `3` 对齐到了 **E** 维而不是 H 维。**「从右往左对齐」这条规则意味着同一个数字在不同位置含义完全不同**：写 `[H,1]` 时 1 在最后一维（沿 E 重复），写 `[1,H]` 时 1 在中间（沿 E 和 B 重复）。

**这正是讲义那句「读代码时先问：输入和输出的 shape 是什么」的机械依据**——只不过判定器把「问」变成了「算」。

**第三，讲义的两个算例数字也一并核了**，逐位相等：

```
   [B,H,E] + [E] with B=2,H=2,E=3
   y[0] = [[11.0, 22.0, 33.0], [14.0, 25.0, 36.0]]
   y[1] = [[17.0, 28.0, 39.0], [20.0, 31.0, 42.0]]
   matches the lecture's numbers: True
```

## 二、多层 Linear 可折叠：代数恒等式实测到什么程度

讲义在「多个 Module 可以继续组合」之后给了一行公式：

$$Y = (XW_1)W_2 = X(W_1W_2)$$

然后用一张两行的表说「`linear2(linear1(x))` 仍然是线性变换」。**这个结论是对的，但它有两个讲义没说的问题：这个等式在浮点下精确吗？折叠值得做吗？**

两个都能实测。折叠后的权重是 $W_1W_2$，偏置是 $W_2b_1 + b_2$（讲义没给偏置怎么并）：

```python
"""The lecture's algebra claim: Y = (X W1) W2 = X (W1 W2).

The lecture states this in one line and then moves on. Two things can be
measured that it does not do:

  1. is the equality exact in floating point, or only exact in real
     arithmetic? (folding the weights changes the rounding)
  2. is folding worth it? (two matmuls become one, but the folded weight
     is bigger)

Both need a real measurement, so this runs on actual tensors.

The cost side is counted in multiply-accumulates, not wall-clock time:
MAC counts are exact and reproducible, while timings vary between runs.
"""
import torch
import torch.nn as nn

torch.manual_seed(0)


def max_abs_diff(a, b):
    return (a - b).abs().max().item()


def run():
    B, D, H, E = 64, 512, 1024, 512

    x = torch.randn(B, D)
    lin1 = nn.Linear(D, H)
    lin2 = nn.Linear(H, E)

    print("B=%d D=%d H=%d E=%d" % (B, D, H, E))
    print("")

    # ---- 1. is the algebra exact? ------------------------------------
    two_layers = lin2(lin1(x))

    W_fold = lin1.weight.T @ lin2.weight.T          # [D, E]
    b_fold = lin2.weight @ lin1.bias + lin2.bias     # [E]
    folded = x @ W_fold + b_fold

    print("folding two Linear layers into one weight matrix")
    print("   two_layers vs folded: max abs diff = %.3e" % max_abs_diff(two_layers, folded))
    print("   allclose(atol=1e-5): %s" % torch.allclose(two_layers, folded, atol=1e-5))
    print("   nn.Linear weight shapes: %s then %s"
          % (tuple(lin1.weight.shape), tuple(lin2.weight.shape)))
    print("   folded weight shape: %s" % (tuple(W_fold.shape),))
    print("")

    # ---- 2. what does folding cost, exactly? -------------------------
    mac_two = B * D * H + B * H * E
    mac_fold = B * D * E
    print("multiply-accumulates per forward")
    print("   two Linear layers : %d" % mac_two)
    print("   folded single matmul: %d" % mac_fold)
    print("   ratio: %.2fx" % (mac_two / mac_fold))
    print("   folding is cheaper exactly when D*H + H*E > D*E,")
    print("   i.e. when the hidden layer is wider than both ends")
    print("")

    # ---- 3. the weights that folding saves ---------------------------
    params_two = (lin1.weight.numel() + lin1.bias.numel()
                  + lin2.weight.numel() + lin2.bias.numel())
    params_fold = W_fold.numel() + b_fold.numel()
    print("stored parameters")
    print("   two Linear layers : %d" % params_two)
    print("   folded            : %d" % params_fold)
    print("   ratio: %.2fx" % (params_two / params_fold))
    print("")

    # ---- 4. ReLU in the middle breaks it ------------------------------
    relu_mid = lin2(torch.relu(lin1(x)))
    print("with a ReLU in the middle")
    print("   two_layers vs folded: max abs diff = %.3e" % max_abs_diff(relu_mid, folded))
    print("   allclose(atol=1e-5): %s" % torch.allclose(relu_mid, folded, atol=1e-5))
    print("   -> the fold is only valid for consecutive linear maps")
    print("")

    # ---- 5. a wider net: the fold saves more -------------------------
    print("same fold, wider hidden layer")
    for hidden in (1024, 4096):
        l1 = nn.Linear(D, hidden)
        l2 = nn.Linear(hidden, E)
        wf = l1.weight.T @ l2.weight.T
        bf = l2.weight @ l1.bias + l2.bias
        p_two = (l1.weight.numel() + l1.bias.numel()
                 + l2.weight.numel() + l2.bias.numel())
        p_fold = wf.numel() + bf.numel()
        m_two = B * D * hidden + B * hidden * E
        m_fold = B * D * E
        print("   hidden=%5d  params %8d -> %8d (%.2fx)   MACs %10d -> %10d (%.2fx)"
              % (hidden, p_two, p_fold, p_two / p_fold,
                 m_two, m_fold, m_two / m_fold))


if __name__ == "__main__":
    run()
```

```text
B=64 D=512 H=1024 E=512

folding two Linear layers into one weight matrix
   two_layers vs folded: max abs diff = 2.205e-06
   allclose(atol=1e-5): True
   nn.Linear weight shapes: (1024, 512) then (512, 1024)
   folded weight shape: (512, 512)

multiply-accumulates per forward
   two Linear layers : 67108864
   folded single matmul: 16777216
   ratio: 4.00x
   folding is cheaper exactly when D*H + H*E > D*E,
   i.e. when the hidden layer is wider than both ends

stored parameters
   two Linear layers : 1050112
   folded            : 262656
   ratio: 4.00x

with a ReLU in the middle
   two_layers vs folded: max abs diff = 1.065e+00
   allclose(atol=1e-5): False
   -> the fold is only valid for consecutive linear maps

same fold, wider hidden layer
   hidden= 1024  params  1050112 ->   262656 (4.00x)   MACs   67108864 ->   16777216 (4.00x)
   hidden= 4096  params  4198912 ->   262656 (15.99x)   MACs  268435456 ->   16777216 (16.00x)
```

**结论一：这个等式在浮点下不是精确成立的，但足够接近。** 实测最大绝对误差 **2.205e-06**，`allclose(atol=1e-5)` 通过。误差来源很明确：两层是「先算 $XW_1$ 再算 $\cdot W_2$」，折叠是「先算 $W_1W_2$ 再算 $X\cdot$」——**乘法结合律在实数上成立，在浮点上不成立**，两次舍入的位置不同。

**所以这条恒等式不能用于需要数值精确一致的场景**（比如对比训练前后的 logits、做 bit-exact 复现）。它在「模型表达的是同一个线性变换」这个意义上是对的。

**结论二：折叠省多少，取决于隐藏层有多宽。** 乘法累加次数：

- 两层：$B\cdot D\cdot H + B\cdot H\cdot E$
- 折叠：$B\cdot D\cdot E$

隐藏层越宽越省。实测 $D=E=512$、$H=1024$ 时是 **4.00x**；隐藏层加宽到 4096 时变成 **16.00x**。存储的参数同理：1050112 → 262656（4.00x），4198912 → 262656（15.99x）。

**但有个反直觉的地方：折叠后的权重矩阵大小与隐藏层无关**（始终是 $D\times E$），所以隐藏层越宽，折叠省的越多。**这正是「宽瓶颈网络可以被压成一层」的来源**——一个 $512 \to 4096 \to 512$ 的 MLP，在线性意义下等价于一个 $512 \to 512$ 的 Linear，参数量少 16 倍。

**结论三：中间夹一个 ReLU，等式立刻失效。** 实测误差从 2.205e-06 跳到 **1.065**，差了六个数量级：

```
   with a ReLU in the middle
   two_layers vs folded: max abs diff = 1.065e+00
   allclose(atol=1e-5): False
```

**非线性是折叠的前提条件，也是折叠的禁区。** 讲义表格里「`linear2(relu(linear1(x)))` 能够表达非线性关系」这句是对的，但它没把边界划清楚：**一旦夹了 ReLU，就再也折不回去了**——而 FFN、GELU、SwiGLU 全都是非线性的，所以真实模型里的每一层 MLP 都不能这样压。

## 三、einsum：写错的字符串不一定报错

讲义说「`b`、`h`、`e` 被保留，`d` 只在输入中出现，因此沿 `d` 求和」。这句话对，但**只说了 einsum 会做什么，没说它不会做什么**。

先验证讲义的两个断言。`nn.Linear` 用 `[out, in]` 布局而课程自己的 `ManualLinear` 用 `[in, out]`，两者数学等价、存储布局不同：

```python
"""Two claims from the lecture, made mechanical.

Claim A: nn.Linear stores its weight as [out, in] and computes
         x @ weight.T + bias, while the course's ManualLinear uses
         [in, out] and computes x @ W.
Claim B: torch.einsum("bhd,de->bhe", x, w) contracts d and keeps b,h,e.

Both are stated in the lecture as code snippets. This checks them against
the real library and pins down what each layout actually costs.
"""
import torch
import torch.nn as nn

torch.manual_seed(0)


def run():
    B, H, D, E = 2, 3, 4, 5

    print("=== claim A: nn.Linear weight layout ===")
    linear = nn.Linear(D, E)
    x = torch.randn(B, H, D)

    y1 = linear(x)
    y2 = x @ linear.weight.T + linear.bias
    print("   nn.Linear(%d, %d).weight.shape = %s"
          % (D, E, tuple(linear.weight.shape)))
    print("   x @ weight.T + bias matches forward: %s"
          % torch.allclose(y1, y2))
    try:
        y3 = x @ linear.weight          # the layout mistake
        print("   x @ weight (no transpose) ran, shape = %s" % (tuple(y3.shape),))
    except RuntimeError as e:
        print("   x @ weight (no transpose) raises: %s" % str(e).split("\n")[0])
    print("   the course's ManualLinear uses [D, E] = (%d, %d) and computes x @ W"
          % (D, E))
    print("")

    print("=== claim B: einsum contracts d, keeps b,h,e ===")
    x = torch.randn(B, H, D)
    w = torch.randn(D, E)
    y = torch.einsum("bhd,de->bhe", x, w)
    print("   y.shape = %s (expected (%d, %d, %d))" % (tuple(y.shape), B, H, E))

    manual = torch.zeros(B, H, E)
    for b in range(B):
        for h in range(H):
            manual[b, h] = x[b, h] @ w
    print("   matches the explicit triple loop: %s"
          % torch.allclose(y, manual, atol=1e-5))
    print("   max abs diff vs loop: %.3e"
          % (y - manual).abs().max().item())
    print("")

    print("=== what the einsum is equivalent to ===")
    print("   bhd,de->bhe  ==  reshape to 2D, matmul, reshape back")
    bmm = (x.reshape(B * H, D) @ w).reshape(B, H, E)
    print("   matches reshape+matmul: %s" % torch.allclose(y, bmm, atol=1e-5))
    print("   but the einsum string names the contract, so the shape")
    print("   check is done by the library, not by the caller")
    print("")

    print("=== a wrong einsum string does not always fail loudly ===")
    for bad in ("bhd,de->bhd", "bhd,de->bhe", "bhd,de->beh", "bhd,de->bd"):
        try:
            out = torch.einsum(bad, x, w)
            ok = "ok, shape %s" % (tuple(out.shape),)
        except RuntimeError as e:
            ok = "RuntimeError: " + str(e).split("\n")[0][:70]
        print("   %-14s -> %s" % (bad, ok))
    print("")
    print("   none of them raise: torch.einsum sums over any label that is")
    print("   absent from the output, and broadcasts a label of size 1")
    print("")
    print("   'bhd,de->bhd' is the dangerous one: it looks like a typo for")
    print("   '->bhe', but instead of erroring it sums over e:")
    wrong = torch.einsum("bhd,de->bhd", x, w)
    # d is kept, e is absent from the output so it gets summed:
    # wrong[b,h,d] = x[b,h,d] * sum_e w[d,e]
    reference = torch.einsum("bhd,d->bhd", x, w.sum(dim=1))
    print("      it equals x scaled by each row-sum of w: %s"
          % torch.allclose(wrong, reference, atol=1e-5))
    print("      and its shape %s is not the one the caller asked for"
          % (tuple(wrong.shape),))
    print("   'bhd,de->beh' is legal too: e is missing from the first")
    print("   operand, so it is broadcast -- shape %s"
          % (tuple(torch.einsum("bhd,de->beh", x, w).shape),))


if __name__ == "__main__":
    run()
```

```text
=== claim A: nn.Linear weight layout ===
   nn.Linear(4, 5).weight.shape = (5, 4)
   x @ weight.T + bias matches forward: True
   x @ weight (no transpose) raises: mat1 and mat2 shapes cannot be multiplied (6x4 and 5x4)
   the course's ManualLinear uses [D, E] = (4, 5) and computes x @ W

=== claim B: einsum contracts d, keeps b,h,e ===
   y.shape = (2, 3, 5) (expected (2, 3, 5))
   matches the explicit triple loop: True
   max abs diff vs loop: 0.000e+00

=== what the einsum is equivalent to ===
   bhd,de->bhe  ==  reshape to 2D, matmul, reshape back
   matches reshape+matmul: True
   but the einsum string names the contract, so the shape
   check is done by the library, not by the caller

=== a wrong einsum string does not always fail loudly ===
   bhd,de->bhd    -> ok, shape (2, 3, 4)
   bhd,de->bhe    -> ok, shape (2, 3, 5)
   bhd,de->beh    -> ok, shape (2, 5, 3)
   bhd,de->bd     -> ok, shape (2, 4)

   none of them raise: torch.einsum sums over any label that is
   absent from the output, and broadcasts a label of size 1

   'bhd,de->bhd' is the dangerous one: it looks like a typo for
   '->bhe', but instead of erroring it sums over e:
      it equals x scaled by each row-sum of w: True
      and its shape (2, 3, 4) is not the one the caller asked for
   'bhd,de->beh' is legal too: e is missing from the first
   operand, so it is broadcast -- shape (2, 5, 3)
```

**布局差异是「能写错」而非「等价」的根源**：`x @ linear.weight` 少个转置，直接抛 `RuntimeError: mat1 and mat2 shapes cannot be multiplied (6x4 and 5x4)`。**好在它会响**——形状对不上时 einsum 和 matmul 都会立刻报错，不会静默出错。

**真正危险的是 einsum 的输出标签。** 实测四个看起来像笔误的字符串，**没有一个报错**：

```
   bhd,de->bhd    -> ok, shape (2, 3, 4)
   bhd,de->bhe    -> ok, shape (2, 3, 5)
   bhd,de->beh    -> ok, shape (2, 5, 3)
   bhd,de->bd     -> ok, shape (2, 4)
```

原因是 einsum 的规则是：**输出里没出现的标签会被求和掉，某个操作数里缺失的标签按大小 1 广播**。于是：

- `->bhd` 看着像 `->bhe` 的笔误，但它**把 e 求和掉了**，结果是 $x$ 乘以 $w$ 的行和——实测与 `torch.einsum("bhd,d->bhd", x, w.sum(dim=1))` 逐位相等。**形状 (2,3,4) 不是调用方要的 (2,3,5)**，但 einsum 自己不知道。
- `->beh` 把 e 的顺序换了，**也是合法的**——因为第一个操作数没有 e，e 被当成大小 1 广播，输出 (2,5,3) 而不是 (2,3,5)。

**所以「einsum 写错会报错」是个错觉。** 只有当标签在两个操作数里都出现但大小不一致时才报错；**标签缺失、标签顺序写反、输出标签集合变了——这三种最常见的笔误，全部静默通过**。

**做法**：写完 einsum 就断言形状。讲义自己在示例里写了 `assert y.shape == (B, H, E)`——**这一行不是可选的礼貌，是唯一能挡住上面三类笔误的东西**。

## 四、它不解决什么

- **它不替代 PyTorch 文档。** 判定器只覆盖广播规则，einsum 的完整语义（广播、重复标签、省略标签）比三条散文规则复杂得多。要判断一个 einsum 字符串对不对，**形状断言仍然是最直接的手段**。
- **它不证明讲义错了。** 事实上讲义的广播规则、权重布局对照、`einsum` 的求和说明**全部经核对无误**。本文的增量是「让它们可验证」，不是「纠正它们」。
- **它不覆盖反向传播。** 讲义把「如何学习」留给第 3 讲，那部分另见 [反向传播与 Autograd：手写链式法则与自动微分对拍](/blog/backprop-and-autograd-explained/)。

## FAQ（六、常见问题）

### `x @ linear.weight` 和 `x @ linear.weight.T` 什么时候会静默出错？

**多数情况不会——它会直接抛异常。** `nn.Linear` 的权重是 `[out, in]`，而输入的最后一维是 `in`，所以 `x @ weight` 的两个维度对不上，matmul 会抛 `RuntimeError`。**真正静默的是形状恰好能对上的时候**：比如 `D == E`（方阵），此时转置与否都能算，且结果不同但不报错。**做法**：始终写 `linear(x)`，或者显式 `x @ linear.weight.T + linear.bias`。

### 广播判定器能替代 `torch.broadcast_shapes` 吗？

**不能，但值得写一遍。** `torch.broadcast_shapes` 给你答案，判定器给你的是**「为什么」的显式形式**——它把三条规则编码成代码，而不是让人脑对齐维度。**做法**：生产代码直接用 `torch.broadcast_shapes`；学习或调试时用判定器，因为它会告诉你两条规则在哪一步分叉。

### 多层 Linear 折叠在实践中用得上吗？

**几乎用不上，但它是理解「层」这个概念的好工具。** 真实模型的 FFN 中间有 GELU/SwiGLU（非线性），折不动；即使全是线性的，训练中的权重每步都在变，折叠只能省推理期的矩阵乘，参数还是要照样存。**做法**：把它当理解工具——**它解释了为什么「宽而浅」的线性网络可以被压成一层，也解释了非线性为什么不可压缩**。

### einsum 字符串写错了怎么防？

**加形状断言，别靠眼睛。** 实测三类最常见的笔误（输出标签集合变了、标签顺序写反、标签缺失）**全部静默通过**，只有标签大小冲突才报错。**做法**：每写一个 einsum 就紧跟一行 `assert y.shape == (...)`。讲义示例里已经有这一行，照抄。

### 为什么前向要单独一讲，反向不是一起讲？

**因为前向是「读懂别人写的模型」，反向是「自己写训练代码」。** 前向只需理解形状如何流动、运算如何组合——有明确的对错（形状对不上会报错）；反向涉及梯度如何流过、链式法则如何应用——出错往往不报错，只是训不出效果。**做法**：先把前向的形状推理变成肌肉记忆，反向的推导才有落脚点。

## 延伸阅读

- [反向传播与 Autograd：手写链式法则与自动微分对拍](/blog/backprop-and-autograd-explained/) — 同一课程的第 3 讲，反向传播的另一半
- [Attention 机制与 GQA：分组查询注意力怎么算的](/blog/attention-mechanism-and-gqa/) — 同一课程后续讲的注意力实现
- [RoPE 与输入 Embedding：位置信息怎么进模型](/blog/rope-and-input-embedding-explained/) — 第 4 讲，位置编码
- [FlashAttention：IO 感知与分块的实现代价](/blog/flashattention-io-aware-tiling/) — 第 7 讲，注意力的工程实现
- [PyTorch 官方文档：torch.nn.Module](https://pytorch.org/docs/stable/nn.html) — 讲义引用的出处

## 出处与许可

- **原始出处**：南京大学《大语言模型基础：从零到一实现之路》第 2 讲「特征空间的变换——模型如何前向执行」，主讲徐经纬。讲义幻灯片公开发布于 [njudeepengine.github.io](https://njudeepengine.github.io/llm-course-lecture/2026/lecture2.html)。
- **许可**：讲义笔记与幻灯片**未附任何明确的 LICENSE 或版权声明**。本文因此只做**方法层面的讨论与独立验证**，不转载讲义正文，不复制其幻灯片内容；引用限于概念、公式与代码片段的口径说明并逐处标明来源。
- **本文自有的增量**（占正文主体）：① **广播规则判定器**——把讲义的三条散文规则写成可执行判定程序，与 torch 在 **144 组形状对上零分歧**，并指出讲义表格未覆盖的陷阱：`[2,1]` 与 `[H,1]` 从右往左对齐到的维度不同，同一个数字写在不同位置含义完全不同，`(2,2,3)+(3,1)` 直接不可广播；讲义的两个算例数字逐位核对相等。② **多层 Linear 折叠的实测**——验证讲义的代数恒等式在浮点下**最大绝对误差 2.205e-06**（`allclose(atol=1e-5)` 通过），指出它因浮点结合律不成立而**不能用于要求数值精确一致的场景**；实测折叠的乘法累加次数与参数量在隐藏层 1024 时省 **4.00x**、4096 时省 **16.00x**（折叠后权重大小与隐藏层无关）；并实测中间夹 ReLU 后误差跳到 **1.065**（六个数量级），划清「可折叠」与「不可折叠」的边界。③ **einsum 的静默失败面**——实测四个看似笔误的 einsum 字符串（`->bhd` / `->beh` / `->bd`）**全部不报错**，因为 einsum 会把输出里缺失的标签求和掉、把操作数里缺失的标签按大小 1 广播；`->bhd` 实测等于「x 乘以 w 的行和」，形状 (2,3,4) 而非调用方要的 (2,3,5)。据此指出**形状断言是唯一能挡住这类笔误的手段**，并说明它与 `nn.Linear` 权重布局错误的区别（后者会抛异常）。
- **代码说明**：文中 `python` 代码块均为本文自写实现，三个脚本各连跑三次输出逐字节一致；固定 `torch.manual_seed(0)`，全部计算在 CPU 上以极小尺寸张量完成（不下载任何模型权重）。紧邻的 `text` 块为当次真实执行的 stdout，已逐行核对。
