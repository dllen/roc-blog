---
title: "为什么 Bloom Filter 能够这样工作（双语对照）"
date: "2026-01-31"
description: "翻译自 Michael Nielsen 的博客《Why Bloom filters work the way they do》，深入浅出地解释了 Bloom Filter 的工作原理、数学推导及其应用。"
original_url: "https://michaelnielsen.org/ddi/why-bloom-filters-work-the-way-they-do/"
---

Imagine you’re a programmer who is developing a new web browser. There are many malicious sites on the web, and you want your browser to warn users when they attempt to access dangerous sites. For example, suppose the user attempts to access `http://domain/etc`. You’d like a way of checking whether `domain` is known to be a malicious site. What’s a good way of doing this?

想象一下，你是一名正在开发新 Web 浏览器的程序员。网络上有很多恶意网站，你希望你的浏览器在用户尝试访问危险网站时发出警告。例如，假设用户尝试访问 `http://domain/etc`。你想要一种方法来检查 `domain` 是否是已知的恶意网站。有什么好的方法可以做到这一点？

An obvious naive way is for your browser to maintain a list or set data structure containing all known malicious domains. A problem with this approach is that it may consume a considerable amount of memory. If you know of a million malicious domains, and domains need (say) an average of 20 bytes to store, then you need 20 megabytes of storage. That’s quite an overhead for a single feature in your web browser. Is there a better way?

一个显而易见的朴素方法是让你的浏览器维护一个包含所有已知恶意域名的列表或集合数据结构。这种方法的一个问题是它可能会消耗大量的内存。如果你知道一百万个恶意域名，并且存储每个域名平均需要（比如说）20 个字节，那么你需要 20 兆字节的存储空间。对于 Web 浏览器中的单个功能来说，这是一个相当大的开销。有没有更好的方法？

In this post I’ll describe a data structure which provides an excellent way of solving this kind of problem. The data structure is known as a [Bloom filter](http://en.wikipedia.org/wiki/Bloom_filter). Bloom filter are much more memory efficient than the naive “store-everything” approach, while remaining extremely fast. I’ll describe both how Bloom filters work, and also some extensions of Bloom filters to solve more general problems.

在这篇文章中，我将描述一种数据结构，它为解决此类问题提供了一种极好的方法。这种数据结构被称为 [Bloom filter](http://en.wikipedia.org/wiki/Bloom_filter)（布隆过滤器）。Bloom filter 比朴素的“存储所有内容”的方法内存效率高得多，同时保持极快的速度。我将描述 Bloom filter 是如何工作的，以及 Bloom filter 的一些扩展，以解决更一般的问题。

Most explanations of Bloom filters cut to the chase, quickly explaining the detailed mechanics of how Bloom filters work. Such explanations are informative, but I must admit that they made me uncomfortable when I was first learning about Bloom filters. In particular, I didn’t feel that they helped me understand *why* Bloom filters are put together the way they are. I couldn’t fathom the mindset that would lead someone to *invent* such a data structure. And that left me feeling that all I had was a superficial, surface-level understanding of Bloom filters.

大多数关于 Bloom filter 的解释都直奔主题，快速解释 Bloom filter 工作原理的详细机制。这样的解释很有信息量，但我必须承认，当我第一次学习 Bloom filter 时，它们让我感到不舒服。特别是，我觉得它们没有帮助我理解 *为什么* Bloom filter 是这样构建的。我无法理解会导致某人 *发明* 这种数据结构的心态。这让我觉得我只对 Bloom filter 有一个肤浅的、表面层面的理解。

In this post I take an unusual approach to explaining Bloom filters. We *won’t* begin with a full-blown explanation. Instead, I’ll gradually build up to the full data structure in stages. My goal is to tell a plausible story explaining how one could invent Bloom filters from scratch, with each step along the way more or less “obvious”. Of course, hindsight is 20-20, and such a story shouldn’t be taken too literally. Rather, the benefit of developing Bloom filters in this way is that it will deepen our understanding of why Bloom filters work in just the way they do. We’ll explore some alternative directions that plausibly *could* have been taken – and see why they don’t work as well as Bloom filters ultimately turn out to work. At the end we’ll understand much better why Bloom filters are constructed the way they are.

在这篇文章中，我采用一种不寻常的方法来解释 Bloom filter。我们 *不会* 从全面的解释开始。相反，我将分阶段逐步构建完整的数据结构。我的目标是讲述一个看似合理的故事，解释人们如何从头开始发明 Bloom filter，沿途的每一步都或多或少是“显而易见”的。当然，事后诸葛亮，这样的故事不应太当真。相反，以这种方式开发 Bloom filter 的好处是，它将加深我们对 Bloom filter 为什么以这种方式工作的理解。我们将探索一些看似 *可能* 采取的替代方向——并看看为什么它们不像 Bloom filter 最终证明的那样有效。最后，我们将更好地理解为什么 Bloom filter 是这样构建的。

Of course, this means that if your goal is just to understand the mechanics of Bloom filters, then this post isn’t for you. Instead, I’d suggest looking at a more conventional introduction – the [Wikipedia article](http://en.wikipedia.org/wiki/Bloom_filter), for example, perhaps in conjunction with an interactive demo, like the nice one [here](http://www.jasondavies.com/bloomfilter/). But if your goal is to understand why Bloom filters work the way they do, then you may enjoy the post.

当然，这意味着如果你的目标仅仅是理解 Bloom filter 的机制，那么这篇文章不适合你。相反，我建议查看更传统的介绍——例如 [维基百科文章](http://en.wikipedia.org/wiki/Bloom_filter)，或许结合一个交互式演示，比如 [这里](http://www.jasondavies.com/bloomfilter/) 的那个很棒的演示。但是，如果你的目标是理解为什么 Bloom filter 会这样工作，那么你可能会喜欢这篇文章。

**A stylistic note:** Most of my posts are code-oriented. This post is much more focused on mathematical analysis and algebraic manipulation: the point isn’t code, but rather how one could come to invent a particular data structure. That is, it’s the story *behind* the code that implements Bloom filters, and as such it requires rather more attention to mathematical detail.

**风格说明：** 我的大多数文章都是面向代码的。这篇文章更侧重于数学分析和代数推导：重点不是代码，而是人们如何发明一种特定的数据结构。也就是说，这是实现 Bloom filter 的代码 *背后* 的故事，因此它需要更多地关注数学细节。

**General description of the problem:** Let’s begin by abstracting away from the “safe web browsing” problem that began this post. We want a data structure which represents a set $S$ of objects. That data structure should enable two operations: (1) the ability to `add` an extra object $x$ to the set; and (2) a `test` to determine whether a given object $x$ is a member of $S$. Of course, there are many other operations we might imagine wanting – for example, maybe we’d also like to be able to `delete` objects from the set. But we’re going to start with just these two operations of `add`ing and `test`ing. Later we’ll come back and ask whether operations such as `delete`ing objects are also possible.

**问题的一般描述：** 让我们首先从本文开头的“安全网络浏览”问题中抽象出来。我们需要一个数据结构来表示一组对象 $S$。该数据结构应支持两种操作：（1）能够向集合中 `add`（添加）一个额外的对象 $x$；（2）一个 `test`（测试）来确定给定对象 $x$ 是否是 $S$ 的成员。当然，我们可能还想要许多其他操作——例如，也许我们还希望能够从集合中 `delete`（删除）对象。但我们将仅从 `add` 和 `test` 这两个操作开始。稍后我们将回来探讨是否也可以进行诸如 `delete` 对象之类的操作。

**Idea: store a set of hashed objects:** Okay, so how can we solve the problem of representing $S$ in a way that’s more memory efficient than just storing all the objects in $S$? One idea is to store hashed versions of the objects in $S$, instead of the full objects. If the hash function is well chosen, then the hashed objects will take up much less memory, but there will be little danger of making errors when `test`ing whether an object is an element of the set or not.

**想法：存储一组哈希对象：** 好吧，那么我们如何解决以比仅仅存储 $S$ 中的所有对象更节省内存的方式表示 $S$ 的问题呢？一个想法是存储 $S$ 中对象的哈希版本，而不是完整的对象。如果哈希函数选择得当，那么哈希对象占用的内存将少得多，但在 `test` 对象是否为集合元素时出错的风险很小。

Let’s be a little more explicit about how this would work. We have a set $S$ of objects

让我们更明确一点，看看这将如何工作。我们有一组对象 $S$

$$ x_0, x_1, \ldots, x_{|S|-1} $$

, where $|S|$ denotes the number of objects in $S$. For each object we compute an $m$-bit hash function $h(x_j)$ – i.e., a hash function which takes an arbitrary object as input, and outputs $m$ bits – and the set $S$ is represented by the set

，其中 $|S|$ 表示 $S$ 中的对象数量。对于每个对象，我们计算一个 $m$ 位哈希函数 $h(x_j)$——即，一个将任意对象作为输入并输出 $m$ 位的哈希函数——并且集合 $S$ 由以下集合表示

$$ \{ h(x_0), h(x_1), \ldots, h(x_{|S|-1}) \} $$

. We can `test` whether $x$ is an element of $S$ by checking whether $h(x)$ is in the set of hashes. This basic hashing approach requires roughly $m |S|$ bits of memory.

。我们可以通过检查 $h(x)$ 是否在哈希集合中来 `test` $x$ 是否是 $S$ 的元素。这种基本的哈希方法大约需要 $m |S|$ 位内存。

(As an aside, in principle it’s possible to store the set of hashed objects more efficiently, using just

（顺便说一句，原则上可以使用仅

$$ m|S|-\log(|S|!) $$

bits, where $\log$ is to base two. The

位来更有效地存储哈希对象集，其中 $\log$ 以 2 为底。

$$ -\log(|S|!) $$

saving is possible because the ordering of the objects in a set is redundant information, and so in principle can be eliminated using a suitable encoding. However, I haven’t thought through what encodings could be used to do this in practice. In any case, the saving is likely to be minimal, since

的节省是可能的，因为集合中对象的顺序是冗余信息，因此原则上可以使用合适的编码消除。但是，我还没有想清楚在实践中可以使用什么编码来做到这一点。无论如何，节省可能微乎其微，因为

$$ \log(|S|!) \approx |S| \log |S|, $$

and $m$ will usually be quite a bit bigger than $\log |S|$ – if that weren’t the case, then hash collisions would occur all the time. So I’ll ignore the terms

并且 $m$ 通常会比 $\log |S|$ 大得多——如果情况并非如此，那么哈希冲突就会一直发生。所以我将忽略

$$ -\log(|S|!) $$

for the rest of this post. In fact, in general I’ll be pretty cavalier in later analyses as well, omitting lower order terms without comment.)

项在本文的其余部分。事实上，总的来说，我在后面的分析中也会相当随意，不加评论地省略低阶项。）

A danger with this hash-based approach is that an object $x$ outside the set $S$ might have the same hash value as an object inside the set, i.e.,

这种基于哈希的方法的一个危险是，集合 $S$ 之外的对象 $x$ 可能与集合内的对象具有相同的哈希值，即

$$ h(x) = h(x_j) $$

for some $j$. In this case, `test` will erroneously report that $x$ is in $S$. That is, this data structure will give us a *false positive*. Fortunately, by choosing a suitable value for $m$, the number of bits output by the hash function, we can reduce the probability of a false positive as much as we want. To understand how this works, notice first that the probability of `test` giving a false positive is 1 minus the probability of `test` correctly reporting that $x$ is not in $S$. This occurs when

对于某个 $j$。在这种情况下，`test` 将错误地报告 $x$ 在 $S$ 中。也就是说，这个数据结构会给我们一个 *假阳性*（误报）。幸运的是，通过为 $m$（哈希函数输出的位数）选择一个合适的值，我们可以尽可能地降低假阳性的概率。为了理解这是如何工作的，首先要注意 `test` 给出假阳性的概率是 1 减去 `test` 正确报告 $x$ 不在 $S$ 中的概率。这发生在

$$ h(x) \neq h(x_j) $$

for all $j$. If the hash function is well chosen, then the probability that

对于所有 $j$。如果哈希函数选择得当，那么

$$ h(x) \neq h(x_j) $$

is $(1-1/2^m)$ for each $j$, and these are independent events. Thus the probability of `test` failing is:

对于每个 $j$ 是 $(1-1/2^m)$，并且这些是独立事件。因此 `test` 失败的概率是：

$$ p = 1-(1-1/2^m)^{|S|}. $$

This expression involves three quantities: the probability $p$ of `test` giving a false positive, the number $m$ of bits output by the hash function, and the number of elements in the set, $|S|$. It’s a nice expression, but it’s more enlightening when rewritten in a slightly different form. What we’d really like to understand is how many bits of memory are needed to represent a set of size $|S|$, with probability $p$ of a `test` failing. To understand that we let $\#$ be the number of bits of memory used, and aim to express $\#$ as a function of $p$ and $|S|$. Observe that

这个表达式涉及三个量：`test` 给出假阳性的概率 $p$，哈希函数输出的位数 $m$，以及集合中的元素数量 $|S|$。这是一个很好的表达式，但当以稍微不同的形式重写时，它更具启发性。我们要真正想了解的是，以 `test` 失败的概率 $p$ 来表示大小为 $|S|$ 的集合需要多少位内存。为了理解这一点，我们要设 $\#$ 为使用的内存位数，并旨在将 $\#$ 表示为 $p$ 和 $|S|$ 的函数。观察到

$$ \# = |S|m $$

, and so we can substitute for

，所以我们可以代入

$$ m = \#/|S| $$

to obtain

得到

$$ p = 1-\left(1-1/2^{\#/|S|}\right)^{|S|}. $$

This can be rearranged to express $\#$ in term of $p$ and $|S|$:

这可以重新排列以用 $p$ 和 $|S|$ 表示 $\#$：

$$ \# = |S|\log \frac{1}{1-(1-p)^{1/|S|}}. $$

This expression answers the question we really want answered, telling us how many bits are required to store a set of size $|S|$ with a probability $p$ of a `test` failing. Of course, in practice we’d like $p$ to be small – say

这个表达式回答了我们要真正想要回答的问题，告诉我们存储大小为 $|S|$ 的集合且 `test` 失败概率为 $p$ 需要多少位。当然，在实践中我们希望 $p$ 很小——比如

$$ p = 0.01 $$

– and when this is the case the expression may be approximated by a more transparent expression:

——当这种情况发生时，该表达式可以用一个更透明的表达式来近似：

$$ \# \approx |S|\log \frac{|S|}{p}. $$

This makes intuitive sense: `test` failure occurs when $x$ is not in $S$, but $h(x)$ is in the hashed version of $S$. Because this happens with probability $p$, it must be that $S$ occupies a fraction $p$ of the total space of possible hash outputs. And so the size of the space of all possible hash outputs must be about $|S|/p$. As a consequence we need

这在直觉上是有道理的：当 $x$ 不在 $S$ 中，但 $h(x)$ 在 $S$ 的哈希版本中时，`test` 失败就会发生。因为这以概率 $p$ 发生，所以 $S$ 必然占据了可能的哈希输出总空间的 $p$ 分数。因此，所有可能的哈希输出的空间大小必须约为 $|S|/p$。因此，我们需要

$$ \log(|S|/p) $$

bits to represent each hashed object, in agreement with the expression above.

位来表示每个哈希对象，与上面的表达式一致。

How memory efficient is this hash-based approach to representing $S$? It’s obviously likely to be quite a bit better than storing full representations of the objects in $S$. But we’ll see later that Bloom filters can be far more memory efficient still.

这种基于哈希的表示 $S$ 的方法内存效率如何？这显然可能比存储 $S$ 中对象的完整表示要好得多。但我们稍后会看到，Bloom filter 的内存效率还可以更高。

The big drawback of this hash-based approach is the false positives. Still, for many applications it’s fine to have a small probability of a false positive. For example, false positives turn out to be okay for the safe web browsing problem. You might worry that false positives would cause some safe sites to erroneously be reported as unsafe, but the browser can avoid this by maintaining a (small!) list of safe sites which are false positives for `test`.

这种基于哈希的方法的一大缺点是假阳性。不过，对于许多应用程序来说，有一个小的假阳性概率是可以接受的。例如，对于安全网络浏览问题，假阳性是可以接受的。你可能会担心假阳性会导致一些安全站点被错误地报告为不安全，但浏览器可以通过维护一个（小的！）安全站点列表来避免这种情况，这些站点是 `test` 的假阳性。

**Idea: use a bit array:** Suppose we want to represent some subset $S$ of the integers

**想法：使用位数组：** 假设我们要表示整数的某个子集 $S$

$$ 0, 1, 2, \ldots, 999 $$

. As an alternative to hashing or to storing $S$ directly, we could represent $S$ using an array of $1000$ bits, numbered $0$ through $999$. We would set bits in the array to $1$ if the corresponding number is in $S$, and otherwise set them to $0$. It’s obviously trivial to `add` objects to $S$, and to `test` whether a particular object is in $S$ or not.

。作为哈希或直接存储 $S$ 的替代方案，我们可以使用包含 $1000$ 个位的数组来表示 $S$，编号为 $0$ 到 $999$。如果相应的数字在 $S$ 中，我们将数组中的位设置为 $1$，否则将其设置为 $0$。显然，向 $S$ 中 `add` 对象以及 `test` 特定对象是否在 $S$ 中是微不足道的。

The memory cost to store $S$ in this bit-array approach is $1000$ bits, regardless of how big or small $|S|$ is. Suppose, for comparison, that we stored $S$ directly as a list of 32-bit integers. Then the cost would be $32 |S|$ bits. When $|S|$ is very small, this approach would be more memory efficient than using a bit array. But as $|S|$ gets larger, storing $|S|$ directly becomes much less memory efficient. We could ameliorate this somewhat by storing elements of $S$ using only 10 bits, instead of 32 bits. But even if we did this, it would still be more expensive to store the list once $|S|$ got beyond one hundred elements. So a bit array really would be better for modestly large subsets.

在这种位数组方法中存储 $S$ 的内存成本是 $1000$ 位，无论 $|S|$ 是大是小。作为比较，假设我们将 $S$ 直接存储为 32 位整数列表。那么成本将是 $32 |S|$ 位。当 $|S|$ 非常小时，这种方法将比使用位数组更节省内存。但随着 $|S|$ 变大，直接存储 $|S|$ 的内存效率会变得低得多。我们可以通过仅使用 10 位而不是 32 位来存储 $S$ 的元素来稍微改善这一点。但是，即使我们这样做，一旦 $|S|$ 超过一百个元素，存储列表仍然会更昂贵。所以对于中等大小的子集，位数组确实会更好。

**Idea: use a bit array where the indices are given by hashes:** A problem with the bit array example described above is that we needed a way of numbering the possible elements of $S$,

**想法：使用索引由哈希给出的位数组：** 上面描述的位数组示例的一个问题是，我们需要一种方法来对 $S$ 的可能元素进行编号，

$$ 0,1,\ldots,999 $$

. In general the elements of $S$ may be complicated objects, not numbers in a small, well-defined range.

。通常，$S$ 的元素可能是复杂的对象，而不是在一个小的、定义明确的范围内的数字。

Fortunately, we can use hashing to number the elements of $S$. Suppose $h(\cdot)$ is an $m$-bit hash function. We’re going to represent a set

幸运的是，我们可以使用哈希来对 $S$ 的元素进行编号。假设 $h(\cdot)$ 是一个 $m$ 位哈希函数。我们将表示一个集合

$$ S = \{x_0,\ldots,x_{|S|-1}\} $$

using a bit array containing $2^m$ elements. In particular, for each $x_j$ we set the $h(x_j)$th element in the bit array, where we regard $h(x_j)$ as a number in the range

使用包含 $2^m$ 个元素的位数组。特别是，对于每个 $x_j$，我们设置位数组中的第 $h(x_j)$ 个元素，其中我们将 $h(x_j)$ 视为范围在

$$ 0,1,\ldots,2^m-1 $$

. More explicitly, we can `add` an element $x$ to the set by setting bit number $h(x)$ in the bit array. And we can `test` whether $x$ is an element of $S$ by checking whether bit number $h(x)$ in the bit array is set.

内的数字。更明确地说，我们可以通过设置位数组中的位号 $h(x)$ 来向集合 `add` 元素 $x$。我们可以通过检查位数组中的位号 $h(x)$ 是否被设置来 `test` $x$ 是否是 $S$ 的元素。

This is a good scheme, but the `test` can fail to give the correct result, which occurs whenever $x$ is not an element of $S$, yet

这是一个很好的方案，但 `test` 可能无法给出正确的结果，这发生在 $x$ 不是 $S$ 的元素，但

$$ h(x) = h(x_j) $$

for some $j$. This is exactly the same failure condition as for the basic hashing scheme we described earlier. By exactly the same reasoning as used then, the failure probability is

对于某个 $j$。这与我们之前描述的基本哈希方案的失败条件完全相同。通过使用当时完全相同的推理，失败概率为

$$ [*] \,\,\,\, p = 1-(1-1/2^m)^{|S|}. $$

As we did earlier, we’d like to re-express this in terms of the number of bits of memory used, $\#$. This works differently than for the basic hashing scheme, since the number of bits of memory consumed by the current approach is

正如我们之前所做的那样，我们要想用使用的内存位数 $\#$ 来重新表达这一点。这与基本哈希方案不同，因为当前方法消耗的内存位数为

$$ \# = 2^m $$

, as compared to

，相比之下

$$ \# = |S|m $$

for the earlier scheme. Using

是早期方案的。使用

$$ \# = 2^m $$

and substituting for $m$ in Equation [*], we have:

并代入方程 [*] 中的 $m$，我们有：

$$ p = 1-(1-1/\#)^{|S|}. $$

Rearranging this to express $\#$ in term of $p$ and $|S|$ we obtain:

重新排列以用 $p$ 和 $|S|$ 表示 $\#$，我们得到：

$$ \# = \frac{1}{1-(1-p)^{1/|S|}}. $$

When $p$ is small this can be approximated by

当 $p$ 很小时，这可以近似为

$$ \# \approx \frac{|S|}{p}. $$

This isn’t very memory efficient! We’d like the probability of failure $p$ to be small, and that makes the $1/p$ dependence bad news when compared to the

这不是很节省内存！我们希望失败概率 $p$ 很小，与基本哈希方案的

$$ \log(|S|/p) $$

dependence of the basic hashing scheme described earlier. The only time the current approach is better is when $|S|$ is very, very large. To get some idea for just how large, if we want

依赖关系相比，这使得 $1/p$ 依赖关系成为坏消息。当前方法唯一更好的时候是当 $|S|$ 非常非常大时。为了了解有多大，如果我们想要

$$ p = 0.01 $$

, then $1/p$ is only better than

，那么 $1/p$ 只有在 $|S|$ 超过大约

$$ \log(|S|/p) $$

when $|S|$ gets to be more than about

时才比 $\log(|S|/p)$ 更好。

$$ 1.27 * 10^{28} $$

. That’s quite a set! In practice, the basic hashing scheme will be much more memory efficient.

。那真是一个巨大的集合！在实践中，基本哈希方案将更节省内存。

Intuitively, it’s not hard to see why this approach is so memory inefficient compared to the basic hashing scheme. The problem is that with an $m$-bit hash function, the basic hashing scheme used $m|S|$ bits of memory, while hashing into a bit array uses $2^m$ bits, but doesn’t change the probability of failure. That’s exponentially more memory!

直观地说，不难看出为什么这种方法与基本哈希方案相比内存效率如此之低。问题在于，对于 $m$ 位哈希函数，基本哈希方案使用 $m|S|$ 位内存，而哈希到位数组中使用 $2^m$ 位，但不会改变失败的概率。那是指数级更多的内存！

At this point, hashing into bit arrays looks like a bad idea. But it turns out that by tweaking the idea just a little we can improve it a lot. To carry out this tweaking, it helps to name the data structure we’ve just described (where we hash into a bit array). We’ll call it a *filter*, anticipating the fact that it’s a precursor to the Bloom filter. I don’t know whether “filter” is a standard name, but in any case it’ll be a useful working name.

此时，哈希到位数组看起来像个坏主意。但事实证明，通过稍微调整这个想法，我们可以对其进行很大改进。为了进行这种调整，有助于命名我们刚刚描述的数据结构（我们在其中哈希到位数组中）。我们将称之为 *filter*（过滤器），预示着它是 Bloom filter 的前身。我不知道“filter”是否是标准名称，但无论如何它将是一个有用的工作名称。

**Idea: use multiple filters:** How can we make the basic filter just described more memory efficient? One possibility is to try using multiple filters, based on independent hash functions. More precisely, the idea is to use $k$ filters, each based on an (independent) $m$-bit hash function,

**想法：使用多个过滤器：** 我们如何使刚刚描述的基本过滤器更节省内存？一种可能性是尝试使用基于独立哈希函数的多个过滤器。更准确地说，这个想法是使用 $k$ 个过滤器，每个过滤器基于一个（独立的）$m$ 位哈希函数，

$$ h_0, h_1, \ldots, h_{k-1} $$

. So our data structure will consist of $k$ separate bit arrays, each containing $2^m$ bits, for a grand total of

。所以我们的数据结构将包含 $k$ 个单独的位数组，每个包含 $2^m$ 位，总共

$$ \# = k 2^m $$

bits. We can `add` an element $x$ by setting the $h_0(x)$th bit in the first bit array (i.e., the first filter), the $h_1(x)$th bit in the second filter, and so on. We can `test` whether a candidate element $x$ is in the set by simply checking whether all the appropriate bits are set in each filter. For this to fail, each individual filter must fail. Because the hash functions are independent of one another, the probability of this is the $k$th power of any single filter failing:

位。我们可以通过在第一个位数组（即第一个过滤器）中设置第 $h_0(x)$ 位，在第二个过滤器中设置第 $h_1(x)$ 位，依此类推，来 `add` 元素 $x$。我们可以通过简单地检查每个过滤器中是否设置了所有相应的位来 `test` 候选元素 $x$ 是否在集合中。如果这失败了，每个单独的过滤器都必须失败。因为哈希函数彼此独立，所以这种概率是任何单个过滤器失败的 $k$ 次方：

$$ p = \left(1-(1-1/2^m)^{|S|}\right)^k. $$

The number of bits of memory used by this data structure is

此数据结构使用的内存位数为

$$ \# = k 2^m $$

and so we can substitute

所以我们可以代入

$$ 2^m = \#/k $$

and rearrange to get

并重新排列得到

$$ [**] \,\,\,\, \# = \frac{k}{1-(1-p^{1/k})^{1/|S|}}. $$

Provided $p^{1/k}$ is much smaller than $1$, this expression can be simplified to give

如果 $p^{1/k}$ 远小于 $1$，这个表达式可以简化为

$$ \# \approx \frac{k|S|}{p^{1/k}}. $$

Good news! This repetition strategy is much more memory efficient than a single filter, at least for small values of $k$. For instance, moving from

好消息！这种重复策略比单个过滤器更节省内存，至少对于较小的 $k$ 值而言。例如，从

$$ k = 1 $$

repetitions to

次重复变为

$$ k = 2 $$

repititions changes the denominator from $p$ to $\sqrt{p}$ – typically, a huge improvement, since $p$ is very small. And the only price paid is doubling the numerator. So this is a big win.

次重复将分母从 $p$ 变为 $\sqrt{p}$——通常，这是一个巨大的改进，因为 $p$ 非常小。付出的唯一代价是分子翻倍。所以这是一个巨大的胜利。

Intuitively, and in retrospect, this result is not so surprising. Putting multiple filters in a row, the probability of error drops exponentially with the number of filters. By contrast, in the single filter scheme, the drop in the probability of error is roughly linear with the number of bits. (This follows from considering Equation [*] in the limit where $1/2^m$ is small.) So using multiple filters is a good strategy.

直观地说，回想起来，这个结果并不那么令人惊讶。将多个过滤器排成一排，错误的概率随过滤器的数量呈指数下降。相比之下，在单过滤器方案中，错误概率的下降与位数大致呈线性关系。（这来自于考虑方程 [*] 在 $1/2^m$ 很小的极限情况。）所以使用多个过滤器是一个很好的策略。

Of course, a caveat to the last paragraph is that this analysis requires that

当然，对上一段的一个警告是，这个分析要求

$$ p^{1/k} \ll 1 $$

, which means that $k$ can’t be too large before the analysis breaks down. For larger values of $k$ the analysis is somewhat more complicated. In order to find the optimal value of $k$ we’d need to figure out what value of $k$ minimizes the exact expression [**] for $\#$. We won’t bother – at best it’d be tedious, and, as we’ll see shortly, there is in any case a better approach.

，这意味着在分析崩溃之前 $k$ 不能太大。对于较大的 $k$ 值，分析稍微复杂一些。为了找到 $k$ 的最佳值，我们需要弄清楚什么 $k$ 值使 $\#$ 的精确表达式 [**] 最小化。我们不麻烦了——充其量这很乏味，而且，正如我们将很快看到的，无论如何都有更好的方法。

**Overlapping filters:** This is a variation on the idea of repeating filters. Instead of having $k$ separate bit arrays, we use just a single array of $2^m$ bits. When `add`ing an object $x$, we simply set all the bits

**重叠过滤器：** 这是重复过滤器想法的一个变体。我们不使用 $k$ 个单独的位数组，而是仅使用一个包含 $2^m$ 位的数组。当 `add` 对象 $x$ 时，我们只需设置所有位

$$ h_0(x), h_1(x),\ldots, h_{k-1}(x) $$

in the same bit array. To `test` whether an element $x$ is in the set, we simply check whether all the bits

在同一个位数组中。为了 `test` 元素 $x$ 是否在集合中，我们只需检查是否所有位

$$ h_0(x), h_1(x),\ldots, h_{k-1}(x) $$

are set or not.

都已设置。

What’s the probability of the `test` failing? Suppose

`test` 失败的概率是多少？假设

$$ x \not \in S $$

. Failure occurs when

。失败发生在

$$ h_0(x) = h_{i_0}(x_{j_0}) $$

for some $i_0$ and $j_0$, and also

对于某个 $i_0$ 和 $j_0$，并且

$$ h_1(x) = h_{i_1}(x_{j_1}) $$

for some $i_1$ and $j_1$, and so on for all the remaining hash functions,

对于某个 $i_1$ 和 $j_1$，以此类推对于所有剩余的哈希函数，

$$ h_2, h_3,\ldots, h_{k-1} $$

. These are independent events, and so the probability they all occur is just the product of the probabilities of the individual events. A little thought should convince you that each individual event will have the same probability, and so we can just focus on computing the probability that

。这些是独立事件，所以它们全部发生的概率只是单个事件概率的乘积。稍加思考就会让你相信每个单独的事件都具有相同的概率，所以我们可以只专注于计算

$$ h_0(x) = h_{i_0}(x_{j_0}) $$

for some $i_0$ and $j_0$. The overall probability $p$ of failure will then be the $k$th power of that probability, i.e.,

对于某个 $i_0$ 和 $j_0$ 的概率。失败的总概率 $p$ 将是该概率的 $k$ 次方，即

$$ p = p(h_0(x) = h_{i_0}(x_{j_0}) \mbox{ for some } i_0,j_0)^k $$

The probability that

概率

$$ h_0(x) = h_{i_0}(x_{j_0}) $$

for some $i_0$ and $j_0$ is one minus the probability that

对于某个 $i_0$ 和 $j_0$ 是 1 减去概率

$$ h_0(x) \neq h_{i_0}(x_{j_0}) $$

for all $i_0$ and $j_0$. These are independent events for the different possible values of $i_0$ and $j_0$, each with probability $1-1/2^m$, and so

对于所有 $i_0$ 和 $j_0$。这些是对于 $i_0$ 和 $j_0$ 的不同可能值的独立事件，每个概率为 $1-1/2^m$，所以

$$ p(h_0(x) = h_{i_0}(x_{j_0}) \mbox{ for some } i_0,j_0) = 1-(1-1/2^m )^{k|S|}, $$

since there are $k|S|$ different pairs of possible values $(i_0, j_0)$. It follows that

因为有 $k|S|$ 个不同的可能值对 $(i_0, j_0)$。由此可见

$$ p = \left(1-(1-1/2^m )^{k|S|}\right)^k. $$

Substituting

代入

$$ 2^m = \# $$

we obtain

我们得到

$$ p = \left(1-(1-1/\# )^{k|S|}\right)^k $$

which can be rearranged to obtain

这可以重新排列得到

$$ \# = \frac{1}{1-(1-p^{1/k})^{1/k|S|}}. $$

This is remarkably similar to the expression [**] derived above for repeating filters. In fact, provided $p^{1/k}$ is much smaller than $1$, we get

这与上面为重复过滤器推导的表达式 [**] 非常相似。事实上，如果 $p^{1/k}$ 远小于 $1$，我们得到

$$ \# \approx \frac{k|S|}{p^{1/k}}, $$

which is exactly the same as [**] when $p^{1/k}$ is small. So this approach gives quite similar outcomes to the repeating filter strategy.

当 $p^{1/k}$ 很小时，这与 [**] 完全相同。所以这种方法给出的结果与重复过滤器策略非常相似。

Which approach is better, repeating or overlapping filters? In fact, it can be shown that

哪种方法更好，重复过滤器还是重叠过滤器？事实上，可以证明

$$ \frac{1}{1-(1-p^{1/k})^{1/k|S|}} \leq \frac{k}{1-(1-p^{1/k})^{1/|S|}}, $$

and so the overlapping filter strategy is more memory efficient than the repeating filter strategy. I won’t prove the inequality here – it’s a straightforward (albeit tedious) exercise in calculus. The important takeaway is that overlapping filters are the more memory-efficient approach.

所以重叠过滤器策略比重复过滤器策略更节省内存。我不会在这里证明这个不等式——这是微积分中一个简单（虽然乏味）的练习。重要的结论是重叠过滤器是更节省内存的方法。

How do overlapping filters compare to our first approach, the basic hashing strategy? I’ll defer a full answer until later, but we can get some insight by choosing

重叠过滤器与我们的第一种方法，即基本哈希策略相比如何？我稍后再给出完整的答案，但我们可以通过选择

$$ p = 0.0001 $$

and

和

$$ k=4 $$

. Then for the overlapping filter we get

来获得一些见解。那么对于重叠过滤器，我们得到

$$ \# \approx 40|S| $$

, while the basic hashing strategy gives

，而基本哈希策略给出

$$ \# = |S| \log( 10000 |S|) $$

. Basic hashing is worse whenever $|S|$ is more than about 100 million – a big number, but also a big improvement over the

。当 $|S|$ 超过大约 1 亿时，基本哈希会更差——这是一个很大的数字，但也比单个过滤器所需的

$$ 1.27 * 10^{28} $$

required by a single filter. Given that we haven’t yet made any attempt to optimize $k$, this ought to encourage us that we’re onto something.

有很大的改进。鉴于我们还没有尝试优化 $k$，这应该鼓励我们，我们正在取得进展。

### Problems for the author

### 给作者的问题

- I suspect that there’s a simple intuitive argument that would let us see upfront that overlapping filters will be more memory efficient than repeating filters. Can I find such an argument?

- 我怀疑有一个简单的直观论点可以让我们预先看到重叠过滤器比重复过滤器更节省内存。我能找到这样的论点吗？

**Bloom filters:** We’re finally ready for Bloom filters. In fact, Bloom filters involve only a few small changes to overlapping filters. In describing overlapping filters we hashed into a bit array containing $2^m$ bits. We could, instead, have used hash functions with a range

**Bloom filter：** 我们终于准备好介绍 Bloom filter 了。事实上，Bloom filter 只涉及对重叠过滤器的一些小改动。在描述重叠过滤器时，我们哈希到一个包含 $2^m$ 位的位数组中。相反，我们可以使用范围为

$$ 0,\ldots,M-1 $$

and hashed into a bit array of $M$ (instead of $2^m$) bits. The analysis goes through unchanged if we do this, and we end up with

的哈希函数并哈希到 $M$（而不是 $2^m$）位的位数组中。如果我们这样做，分析将保持不变，我们最终得到

$$ p = \left(1-(1-1/\# )^{k|S|}\right)^k $$

and

和

$$ \# = \frac{1}{1-(1-p^{1/k})^{1/k|S|}}, $$

exactly as before. The only reason I didn’t do this earlier is because in deriving Equation [*] above it was convenient to re-use the reasoning from the basic hashing scheme, where $m$ (not $M$) was the convenient parameter to use. But the exact same reasoning works.

与以前完全一样。我之前没有这样做的唯一原因是因为在推导上面的方程 [*] 时，重用基本哈希方案的推理很方便，其中 $m$（而不是 $M$）是方便使用的参数。但完全相同的推理也是有效的。

What’s the best value of $k$ to choose? Put another way, what value of $k$ should we choose in order to minimize the number of bits, $\#$, given a particular value for the probability of error, $p$, and a particular size $|S|$? Equivalently, what value of $k$ will minimize $p$, given $\#$ and $|S|$? I won’t go through the full analysis here, but with calculus and some algebra you can show that choosing

选择 $k$ 的最佳值是多少？换句话说，给定特定的错误概率 $p$ 和特定的大小 $|S|$，我们应该选择什么值的 $k$ 来最小化位数 $\#$？等价地，给定 $\#$ 和 $|S|$，什么值的 $k$ 将最小化 $p$？我不会在这里进行完整的分析，但通过微积分和一些代数，你可以证明选择

$$ k \approx \frac{\#}{|S|} \ln 2 $$

minimizes the probability $p$. (Note that $\ln$ denotes the natural logarithm, not logarithms to base 2.) By choosing $k$ in this way we get:

可以最小化概率 $p$。（注意 $\ln$ 表示自然对数，而不是以 2 为底的对数。）通过以这种方式选择 $k$，我们得到：

$$ [***] \,\,\,\, \# = \frac{|S|}{\ln 2} \log \frac{1}{p}. $$

This really is good news! Not only is it better than a bit array, it’s actually (usually) much better than the basic hashing scheme we began with. In particular, it will be better whenever

这真是个好消息！它不仅比位数组好，而且实际上（通常）比我们开始的基本哈希方案好得多。特别是，当

$$ \frac{1}{\ln 2} \log \frac{1}{p} \leq \log \frac{|S|}{p}, $$

which is equivalent to requiring

时，它会更好，这等价于要求

$$ |S| \geq p^{1-1/\ln 2} \approx \frac{1}{p^{0.44}}. $$

If we want (say)

如果我们想要（比如说）

$$ p=0.01 $$

this means that Bloom filter will be better whenever $|S| \geq 8$, which is obviously an extremely modest set size.

这意味着只要 $|S| \geq 8$，Bloom filter 就会更好，这显然是一个非常小的集合大小。

Another way of interpreting [***] is that a Bloom filter requires

解释 [***] 的另一种方式是 Bloom filter 需要

$$ \frac{1}{\ln 2} \log \frac{1}{p} \approx 1.44 \log \frac{1}{p} $$

bits per element of the set being represented. In fact, it’s possible to prove that any data structure supporting the `add` and `test` operations will require at least

位来表示集合中的每个元素。事实上，可以证明任何支持 `add` 和 `test` 操作的数据结构将至少需要

$$ \log \frac{1}{p} $$

bits per element in the set. This means that Bloom filters are near-optimal. Futher work has been done finding even more memory-efficient data structures that actually meet the

位来表示集合中的每个元素。这意味着 Bloom filter 接近最优。已经做了进一步的工作来寻找甚至更节省内存的数据结构，这些数据结构实际上满足

$$ \log \frac{1}{p} $$

bound. See, for example, the paper by [Anna Pagh, Rasmus Pagh, and S. Srinivasa Rao](http://scholar.google.ca/scholar?cluster=13031359803369786500&hl=en&as_sdt=0,5).

界限。例如，参见 [Anna Pagh, Rasmus Pagh, and S. Srinivasa Rao](http://scholar.google.ca/scholar?cluster=13031359803369786500&hl=en&as_sdt=0,5) 的论文。

### Problems for the author

### 给作者的问题

- Are the more memory-efficient algorithms practical? Should we be using them?

- 更节省内存的算法实用吗？我们应该使用它们吗？

In actual applications of Bloom filters, we won’t know $S$ in advance, nor $|S|$. So the way we usually specify a Bloom filter is to specify the *maximum* size $n$ of set that we’d like to be able to represent, and the maximal probability of error, $p$, that we’re willing to tolerate. Then we choose

在 Bloom filter 的实际应用中，我们不会预先知道 $S$，也不知道 $|S|$。所以我们通常指定 Bloom filter 的方式是指定我们希望能够表示的集合的 *最大* 大小 $n$，以及我们愿意容忍的最大错误概率 $p$。然后我们选择

$$ \# = \frac{n}{\ln 2} \log \frac{1}{p} $$

and

和

$$ k = \ln \frac{1}{p}. $$

This gives us a Bloom filter capable of representing any set up to size $n$, with probability of error guaranteed to be at most $p$. The size $n$ is called the *capacity* of the Bloom filter. Actually, these expressions are slight simplifications, since the terms on the right may not be integers – to be a little more pedantic, we choose

这给了我们一个能够表示最大为 $n$ 的任何集合的 Bloom filter，错误概率保证最多为 $p$。大小 $n$ 称为 Bloom filter 的 *容量*。实际上，这些表达式稍微简化了一些，因为右边的项可能不是整数——稍微迂腐一点，我们选择

$$ \# = \lceil \frac{n}{\ln 2} \log \frac{1}{p} \rceil $$

and

和

$$ k = \lceil \ln \frac{1}{p} \rceil. $$

One thing that still bugs me about Bloom filters is the expression for the optimal value for $k$. I don’t have a good intuition for it – why is it logarithmic in $1/p$, and why does it not depend on $|S|$? There’s a tradeoff going on here that’s quite strange when you think about it: bit arrays on their own aren’t very good, but if you repeat or overlap them just the right number of times, then performance improves a lot. And so you can think of Bloom filters as a kind of compromise between an overlap strategy and a bit array strategy. But it’s really not at all obvious (a) why choosing a compromise strategy is the best; or (b) why the right point at which to compromise is where it is, i.e., why $k$ has the form it does. I can’t quite answer these questions at this point – I can’t see that far through Bloom filters. I suspect that understanding the

关于 Bloom filter，仍然困扰我的一件事是 $k$ 的最佳值的表达式。我对此没有很好的直觉——为什么它是 $1/p$ 的对数，为什么它不依赖于 $|S|$？这里有一个权衡，当你仔细思考时会觉得很奇怪：位数组本身并不是很好，但如果你重复或重叠它们恰当的次数，性能就会提高很多。所以你可以把 Bloom filter 看作是重叠策略和位数组策略之间的一种折衷。但实际上一点也不明显（a）为什么选择折衷策略是最好的；或者（b）为什么折衷的正确点就在那里，即为什么 $k$ 具有它所具有的形式。我在这一点上还不能完全回答这些问题——我无法透过 Bloom filter 看得那么远。我怀疑理解

$$ k = 2 $$

case really well would help, but haven’t put in the work. Anyone with more insight is welcome to speak up!

的情况真的会有所帮助，但我还没有投入工作。欢迎任何有更多见解的人畅所欲言！

**Summing up Bloom filters:** Let’s collect everything together. Suppose we want a Bloom filter with capacity $n$, i.e., capable of representing any set $S$ containing up to $n$ elements, and such that `test` produces a false positive with probability at most $p$. Then we choose

**总结 Bloom filter：** 让我们把所有东西收集在一起。假设我们需要一个容量为 $n$ 的 Bloom filter，即能够表示包含最多 $n$ 个元素的任何集合 $S$，并且 `test` 产生假阳性的概率最多为 $p$。那么我们选择

$$ k = \lceil \ln \frac{1}{p} \rceil $$

independent hash functions,

个独立的哈希函数，

$$ h_0, h_1, \ldots, h_{k-1} $$

. Each hash function has a range

。每个哈希函数都有一个范围

$$ 0,\ldots,\#-1 $$

, where $\#$ is the number of bits of memory our Bloom filter requires,

，其中 $\#$ 是我们的 Bloom filter 需要的内存位数，

$$ \# = \lceil \frac{n}{\ln 2} \log \frac{1}{p} \rceil. $$

We number the bits in our Bloom filter from

我们将 Bloom filter 中的位编号为

$$ 0,\ldots,\#-1 $$

. To `add` an element $x$ to our set we set the bits

。为了向我们的集合 `add` 一个元素 $x$，我们设置位

$$ h_0(x), h_1(x), \ldots, h_{\#-1}(x) $$

in the filter. And to `test` whether a given element $x$ is in the set we simply check whether bits

在过滤器中。为了 `test` 给定元素 $x$ 是否在集合中，我们只需检查位

$$ h_0(x), h_1(x), \ldots, h_{\#-1}(x) $$

in the bit array are all set.

在位数组中是否都已设置。

That’s all there is to the mechanics of how Bloom filters work! I won’t give any sample code – I usually provide code samples in Python, but the Python standard library lacks bit arrays, so nearly all of the code would be concerned with defining a bit array class. That didn’t seem like it’d be terribly illuminating. Of course, it’s not difficult to find libraries implementing Bloom filters. For example, [Jason Davies](http://www.jasondavies.com/) has written a javascript Bloom filter which has a fun and informative [online interactive visualisation](http://www.jasondavies.com/bloomfilter/). I recommend checking it out. And I’ve personally used [Mike Axiak](http://mike.axiak.net/) ‘s fast C-based Python library [pybloomfiltermmap](https://github.com/axiak/pybloomfiltermmap) – the documentation is clear, it took just a few minutes to get up and running, and I’ve generally had no problems.

这就是 Bloom filter 工作原理的所有机制！我不会提供任何示例代码——我通常提供 Python 代码示例，但 Python 标准库缺乏位数组，所以几乎所有的代码都将涉及定义一个位数组类。这似乎不会很有启发性。当然，找到实现 Bloom filter 的库并不难。例如，[Jason Davies](http://www.jasondavies.com/) 编写了一个 javascript Bloom filter，它有一个有趣且信息丰富的 [在线交互式可视化](http://www.jasondavies.com/bloomfilter/)。我建议去看看。我个人使用过 [Mike Axiak](http://mike.axiak.net/) 的快速基于 C 的 Python 库 [pybloomfiltermmap](https://github.com/axiak/pybloomfiltermmap)——文档很清晰，只花了几分钟就运行起来了，而且我通常没有遇到任何问题。

### Problems

### 问题

- Suppose we have two Bloom filters, corresponding to sets $S_1$ and $S_2$. How can we construct the Bloom filters corresponding to the sets

- 假设我们有两个 Bloom filter，分别对应集合 $S_1$ 和 $S_2$。我们如何构建对应于集合

$$ S_1 \cup S_2 $$

and

和

$$ S_1 \cap S_2 $$

?

的 Bloom filter？

**Applications of Bloom filters:** Bloom filters have been used to solve many different problems. Here’s just a few examples to give the flavour of how they can be used. An early idea was Manber and Wu’s 1994 [proposal](http://scholar.google.ca/scholar?cluster=2662095141699171069) to use Bloom filters to store lists of weak passwords. Google’s [BigTable](http://research.google.com/archive/bigtable.html) storage system uses Bloom filters to speed up queries, by avoiding disk accesses for rows or columns that don’t exist. Google Chrome uses Bloom filters to do [safe web browsing](http://src.chromium.org/viewvc/chrome/trunk/src/chrome/browser/safe_browsing/bloom_filter.h?view=markup) – the opening example in this post was quite real! More generally, it’s useful to consider using Bloom filters whenever a large collection of objects needs to be stored. They’re not appropriate for all purposes, but at the least it’s worth thinking about whether or not a Bloom filter can be applied.

**Bloom filter 的应用：** Bloom filter 已被用于解决许多不同的问题。这里只是几个例子，让你了解它们是如何被使用的。一个早期的想法是 Manber 和 Wu 在 1994 年 [提议](http://scholar.google.ca/scholar?cluster=2662095141699171069) 使用 Bloom filter 来存储弱密码列表。Google 的 [BigTable](http://research.google.com/archive/bigtable.html) 存储系统使用 Bloom filter 来加速查询，通过避免对不存在的行或列进行磁盘访问。Google Chrome 使用 Bloom filter 进行 [安全网络浏览](http://src.chromium.org/viewvc/chrome/trunk/src/chrome/browser/safe_browsing/bloom_filter.h?view=markup)——这篇文章开头的例子是非常真实的！更一般地说，每当需要存储大量对象集合时，考虑使用 Bloom filter 是很有用的。它们并不适用于所有目的，但至少值得思考是否可以应用 Bloom filter。

**Extensions of Bloom filters:** There’s many clever ways of extending Bloom filters. I’ll briefly describe one, just to give you the flavour, and provide links to several more.

**Bloom filter 的扩展：** 有许多巧妙的方法可以扩展 Bloom filter。我将简要描述一种，只是为了让你体验一下，并提供更多链接。

**A delete operation:** It’s possible to modify Bloom filters so they support a `delete` operation that lets you remove an element from the set. You can’t do this with a standard Bloom filter: it would require unsetting one or more of the bits

**删除操作：** 可以修改 Bloom filter，使其支持 `delete` 操作，让你从集合中移除一个元素。你不能用标准的 Bloom filter 做到这一点：这将需要取消设置一个或多个位

$$ h_0(x), h_1(x), \ldots $$

in the bit array. This could easily lead us to accidentally `delete` *other* elements in the set as well.

在位数组中。这很容易导致我们也意外地 `delete` 集合中的 *其他* 元素。

Instead, the `delete` operation is implemented using an idea known as a *counting Bloom filter*. The basic idea is to take a standard Bloom filter, and replace each bit in the bit array by a bucket containing several bits (usually 3 or 4 bits). We’re going to treat those buckets as counters, initially set to $0$. We `add` an element $x$ to the counting Bloom filter by *incrementing* each of the buckets numbered

相反，`delete` 操作是使用一种称为 *counting Bloom filter*（计数布隆过滤器）的想法来实现的。基本思想是采用标准的 Bloom filter，并将位数组中的每个位替换为包含几个位（通常是 3 或 4 位）的桶。我们将把这些桶视为计数器，初始设置为 $0$。我们通过 *增加* 每个编号为

$$ h_0(x), h_1(x), \ldots $$

. We `test` whether $x$ is in the counting Bloom filter by looking to see whether each of the corresponding buckets are non-zero. And we `delete` $x$ by decrementing each bucket.

的桶来向 counting Bloom filter `add` 元素 $x$。我们通过查看每个对应的桶是否非零来 `test` $x$ 是否在 counting Bloom filter 中。我们通过递减每个桶来 `delete` $x$。

This strategy avoids the accidental deletion problem, because when two elements of the set $x$ and $y$ hash into the same bucket, the count in that bucket will be at least $2$. `delete`ing one of the elements, say $x$, will still leave the count for the bucket at least $1$, so $y$ won’t be accidentally deleted. Of course, you could worry that this will lead us to erroneously conclude that $x$ is still in the set after it’s been deleted. But that can only happen if other elements in the set hash into every single bucket that $x$ hashes into. That will only happen if $|S|$ is very large.

这种策略避免了意外删除问题，因为当集合中的两个元素 $x$ 和 $y$ 哈希到同一个桶时，该桶中的计数将至少为 $2$。`delete` 其中一个元素，比如 $x$，仍然会留下桶的计数至少为 $1$，所以 $y$ 不会被意外删除。当然，你可能会担心这会导致我们错误地得出结论，认为 $x$ 在删除后仍然在集合中。但这只有在集合中的其他元素哈希到 $x$ 哈希到的每一个桶中时才会发生。这只有在 $|S|$ 非常大时才会发生。

Of course, that’s just the basic idea behind counting Bloom filters. A full analysis requires us to understand issues such as bucket overflow (when a counter gets incremented too many times), the optimal size for buckets, the probability of errors, and so on. I won’t get into that, but you there’s details in the further reading, below.

当然，这只是 counting Bloom filter 背后的基本思想。完整的分析需要我们理解诸如桶溢出（当计数器增加太多次时）、桶的最佳大小、错误概率等问题。我不会深入探讨这些，但在下面的进一步阅读中有详细信息。

**Other variations and further reading:** There are many more variations on Bloom filters. Just to give you the flavour of a few applications: (1) they can be modified to be used as lookup dictionaries, associating a value with each element `add`ed to the filter; (2) they can be modified so that the capacity scales up dynamically; and (3) they can be used to quickly approximate the number of elements in a set. There are many more variations as well: Bloom filters have turned out to be a very generative idea! This is part of why it’s useful to understand them deeply, since even if a standard Bloom filter can’t solve the particular problem you’re considering, it may be possible to come up with a variation which does. You can get some idea of the scope of the known variations by looking at the [Wikipedia article](http://en.wikipedia.org/wiki/Bloom_filter). I also like the [survey article](http://scholar.google.ca/scholar?cluster=7837240630058449829&hl=en&as_sdt=0,5) by [Andrei Broder](http://en.wikipedia.org/wiki/Andrei_Broder) and [Michael Mitzenmacher](http://mybiasedcoin.blogspot.ca/). It’s a little more dated (2004) than the Wikipedia article, but nicely written and a good introduction. For a shorter introduction to some variations, there’s also a recent [blog post](http://matthias.vallentin.net/blog/2011/06/a-garden-variety-of-bloom-filters/) by [Matthias Vallentin](http://matthias.vallentin.net/). You can get the flavour of current research by looking at some of the papers citing Bloom filters [here](http://academic.research.microsoft.com/Publication/772630/space-time-trade-offs-in-hash-coding-with-allowable-errors). Finally, you may enjoy reading the [original paper on Bloom filters](http://scholar.google.ca/scholar?cluster=11454588508174765009&hl=en&as_sdt=0,5), as well as the [original paper on counting Bloom filters](http://scholar.google.ca/scholar?cluster=18066790496670563714&hl=en&as_sdt=0,5).

**其他变体和进一步阅读：** Bloom filter 还有更多变体。只是为了让你体验一些应用：（1）它们可以修改为用作查找字典，将值与 `add` 到过滤器的每个元素相关联；（2）它们可以修改为容量动态扩展；（3）它们可以用于快速近似集合中的元素数量。还有更多的变体：Bloom filter 已被证明是一个非常有生成力的想法！这也是为什么深入理解它们很有用的部分原因，因为即使标准 Bloom filter 无法解决你正在考虑的特定问题，也有可能提出一个可以解决该问题的变体。你可以通过查看 [维基百科文章](http://en.wikipedia.org/wiki/Bloom_filter) 来了解已知变体的范围。我也喜欢 [Andrei Broder](http://en.wikipedia.org/wiki/Andrei_Broder) 和 [Michael Mitzenmacher](http://mybiasedcoin.blogspot.ca/) 的 [综述文章](http://scholar.google.ca/scholar?cluster=7837240630058449829&hl=en&as_sdt=0,5)。它比维基百科文章稍微陈旧（2004 年），但写得很好，是一个很好的介绍。对于一些变体的更短介绍，还有 [Matthias Vallentin](http://matthias.vallentin.net/) 最近的一篇 [博客文章](http://matthias.vallentin.net/blog/2011/06/a-garden-variety-of-bloom-filters/)。你可以通过查看一些引用 Bloom filter 的论文 [这里](http://academic.research.microsoft.com/Publication/772630/space-time-trade-offs-in-hash-coding-with-allowable-errors) 来了解当前研究的风味。最后，你可能会喜欢阅读 [关于 Bloom filter 的原始论文](http://scholar.google.ca/scholar?cluster=11454588508174765009&hl=en&as_sdt=0,5)，以及 [关于 counting Bloom filter 的原始论文](http://scholar.google.ca/scholar?cluster=18066790496670563714&hl=en&as_sdt=0,5)。

**Understanding data structures:** I wrote this post because I recently realized that I didn’t understand any complex data structure in any sort of depth. There are, of course, a huge number of striking data structures in computer science – just look at [Wikipedia’s amazing list](http://en.wikipedia.org/wiki/List_of_data_structures)! And while I’m familiar with many of the simpler data structures, I’m ignorant of most complex data structures. There’s nothing wrong with that – unless one is a specialist in data structures there’s no need to master a long laundry list. But what bothered me is that I hadn’t *thoroughly* mastered even a single complex data structure. In some sense, I didn’t know what it means to understand a complex data structure, at least beyond surface mechanics. By trying to reinvent Bloom filters, I’ve found that I’ve deepened my own understanding and, I hope, written something of interest to others.

**理解数据结构：** 我写这篇文章是因为我最近意识到我没有深入理解任何复杂的数据结构。当然，计算机科学中有大量惊人的数据结构——看看 [维基百科的惊人列表](http://en.wikipedia.org/wiki/List_of_data_structures)！虽然我熟悉许多简单的数据结构，但我对大多数复杂的数据结构一无所知。这并没有什么错——除非你是数据结构专家，否则不需要掌握长长的清单。但困扰我的是，我甚至没有 *彻底* 掌握哪怕一个复杂的数据结构。在某种意义上，我不知道理解一个复杂的数据结构意味着什么，至少在表面机制之外。通过尝试重新发明 Bloom filter，我发现我加深了自己的理解，并且我希望，写了一些令他人感兴趣的东西。

*Interested in more? Please [subscribe to this blog](https://michaelnielsen.org/ddi/feed/), or [follow me on Twitter](http://twitter.com/\#!/michael_nielsen). You may also enjoy reading my new book about open science, [Reinventing Discovery](http://www.amazon.com/Reinventing-Discovery-New-Networked-Science/dp/product-description/0691148902).*

*有兴趣了解更多吗？请 [订阅此博客](https://michaelnielsen.org/ddi/feed/)，或 [在 Twitter 上关注我](http://twitter.com/\#!/michael_nielsen)。你可能也会喜欢阅读我关于开放科学的新书，[Reinventing Discovery](http://www.amazon.com/Reinventing-Discovery-New-Networked-Science/dp/product-description/0691148902)。*
