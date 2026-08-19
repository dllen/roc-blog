---
title: "HikariCP: Down the Rabbit Hole"
date: 2023-12-18T12:13:38+05:30
update_date: 2023-12-18T12:13:38+05:30
---

[原文连接](https://github.com/brettwooldridge/HikariCP/wiki/Down-the-Rabbit-Hole)

> Simplicity is prerequisite for reliability.
> 
> Perfection is Achieved Not When There Is Nothing More to Add, But When There Is Nothing Left to Take Away.

> 本文只是做一下简单的翻译和讲解；

This is where we give away the recipe to the secret sauce. When you come in with benchmarks like ours there is a certain amount of skepticism that must be addressed. If you think of performance, and of connection pools, you might be tempted into thinking that the *pool* is the most important part of the performance equation. Not so clearly so. The number of `getConnection()` operations in comparison to other JDBC operations is small. A large amount of performance gains come in the optimization of the "delegates" that wrap `Connection`, `Statement`, etc.

本文讲解一下该项目的底层实现原理。当你看到该项目的基准测试结果，如果你心中有疑虑，我们必须给你解释清楚。如果考虑到性能和连接池，你可能会认为连接池是性能中最重要的影响因素。但是并不是如此。与其他JDBC操作相比，`getConnection()`操作的数量非常少。大量的性能优化是在对

`Connection`、`Statement` 等的包装和委托。

### 🧠 We're in your bytecodez

In order to make HikariCP as fast as it is, we went down to bytecode-level engineering, and beyond. We pulled out every trick we know to help the JIT help you. We studied the bytecode output of the compiler, and even the assembly output of the JIT to limit key routines to less than the JIT inline-threshold. We flattened inheritance hierarchies, shadowed member variables, eliminated casts.

为了使 HikariCP 尽可能快，我们深入研究了字节码级工程，以及更多内容。我们使出浑身解数来帮助 JIT 帮助你。我们研究了编译器的字节码输出，甚至JIT的汇编输出，以将关键例程限制在小于JIT内联阈值的范围内。我们平化了继承层次结构，隐藏了成员变量，消除了强制类型转换。

### 🔬 Micro-optimizations

HikariCP contains many micro-optimizations that individually are barely measurable, but together combine as a boost to overall performance. Some of these optimizations are measured in fractions of a millisecond amortized over millions of invocations.

HikariCP 包含许多微观优化，这些优化单独来说几乎无法衡量，但是结合在一起可以提高整体性能。其中一些优化是以毫秒级的，只有在数百万次调用中才能体现优化结果。

#### ArrayList

One non-trivial (performance-wise) optimization was eliminating the use of an `ArrayList<Statement>` instance in the `ConnectionProxy` used to track open `Statement` instances. When a `Statement` is closed, it must be removed from this collection, and when the `Connection` is closed it must iterate the collection and close any open `Statement` instances, and finally must clear the collection. The Java `ArrayList`, wisely for general purpose use, performs a *range check* upon every `get(int index)` call. However, because we can provide guarantees about our ranges, this check is merely overhead.

一个重要的(性能方面的)优化是在 `ConnectionProxy` 中取消使用 `ArrayList` 实例来跟踪 open `Statement` 实例。`Statement`关闭时，必须从集合中删除该`Statement`，关闭 `Connection` 时，必须迭代该集合并关闭任何打开的 `Statement` 实例，最后必须清理集合。Java `ArrayList` 为了适用于大多数场景，对每个 `get(int index)` 调用进行索引检查。但是，因为我们可以提供对索引的范围的保证，所以这个检查只是开销。

Additionally, the `remove(Object)` implementation performs a scan from head to tail, however common patterns in JDBC programming are to close *Statements* immediately after use, or in reverse order of opening. For these cases, a scan that starts at the tail will perform better. Therefore, `ArrayList<Statement>` was replaced with a custom class `FastList` which eliminates range checking and performs removal scans from tail to head.

此外，`remove(Object)` 会从头到尾的扫描列表元素，但是 JDBC 编程中的常见模式是在使用语句后立即关闭 *Statements*，或者以相反的打开顺序关闭*Statements*。对于这些情况，从尾部开始的扫描将执行得更好。因此，`ArrayList<Statement>` 被替换为一个自定义类 `FastList`，它消除了范围检查并执行从尾部到头部的删除扫描。

#### ConcurrentBag

HikariCP contains a custom lock-free collection called a *ConcurrentBag*. The idea was borrowed from the C# .NET ConcurrentBag class, but the internal implementation quite different. The *ConcurrentBag* provides...

HikariCP 包含一个称为 `ConcurrentBag` 的自定义无锁集合。这个想法是从 C# 中借用的。NET ConcurrentBag 类，但内部实现有很大的不同。ConcurrentBag 支持以下特性：

- A lock-free design *无锁设计*
- ThreadLocal caching *ThreadLocal缓存*
- Queue-stealing *队列窃取*
- Direct hand-off optimizations *直接切换优化*

...resulting in a high degree of concurrency, extremely low latency, and minimized occurrences of [false-sharing](http://en.wikipedia.org/wiki/False_sharing)

支持高度的并发性，极低的延迟，最小化了 [False sharing](https://en.wikipedia.org/wiki/False_sharing) 的发生。

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/v2-a9557dcd20f2d034d8f2a28c643e7974_b.jpg)

> 上图中`thread0`位于`core0`，而`thread1`位于`core1`，二者均想更新彼此独立的两个变量，但是由于两个变量位于同一个`cache line`中，此时可知的是两个`cache line`的状态应该都是`Shared`，而对于`cache line`的操作`core`间必须争夺主导权`（ownership）`，如果`core0`抢到了，`thread0`因此去更新`cache line`，会导致`core1`中的`cache line`状态变为`Invalid`，随后`thread1`去更新时必须通知`core0`将`cache line`刷回主存，然后它再从主从中`load`该`cache line`进高速缓存之后再进行修改，但令人抓狂的是，该修改又会使得`core0`的`cache line`失效，重复上演历史，从而高速缓存并未起到应有的作用，反而影响了性能。

#### Invocation: `invokevirtual` vs `invokestatic`

In order to generate proxies for *Connection*, *Statement*, and *ResultSet* instances HikariCP was initially using a singleton factory, held in the case of `ConnectionProxy` in a *static* field (*PROXY_FACTORY*).

为了给 `Connection`，`Statement` 和 `ResultSet` 实例生成代理，HikariCP 最初使用了一个单例工厂，例如 `ConnectionProxy` ，保存在一个静态字段(*PROXY_FACTORY*)中。

There was a dozen or so methods resembling the following:

有十几种类似的方法:

```java
public final PreparedStatement prepareStatement(String sql, String[] columnNames) throws SQLException
{    
    return PROXY_FACTORY.getProxyPreparedStatement(this, delegate.prepareStatement(sql, columnNames));
}
```

Using the original singleton factory, the generated bytecode looked like this:

使用最初的单例工厂，生成的字节码如下所示：

```java
    public final java.sql.PreparedStatement prepareStatement(java.lang.String, java.lang.String[]) throws java.sql.SQLException;    
    flags: ACC_PRIVATE, ACC_FINAL
    Code:      
    stack=5, locals=3, args_size=3
         0: getstatic     #59                 // Field PROXY_FACTORY:Lcom/zaxxer/hikari/proxy/ProxyFactory;
         3: aload_0
         4: aload_0
         5: getfield      #3                  // Field delegate:Ljava/sql/Connection;
         8: aload_1
         9: aload_2
        10: invokeinterface #74,  3           // InterfaceMethod java/sql/Connection.prepareStatement:(Ljava/lang/String;[Ljava/lang/String;)Ljava/sql/PreparedStatement;
        15: invokevirtual #69                 // Method com/zaxxer/hikari/proxy/ProxyFactory.getProxyPreparedStatement:(Lcom/zaxxer/hikari/proxy/ConnectionProxy;Ljava/sql/PreparedStatement;)Ljava/sql/PreparedStatement;
        18: return
```

You can see that first there is a `getstatic` call to get the value of the static field `PROXY_FACTORY`, as well as (lastly) the `invokevirtual` call to `getProxyPreparedStatement()` on the `ProxyFactory` instance.

可以看到，首先有一个 `getstatic` 的调用获取静态字段 `PROXY_FACTORY` 的值，以及（最后）在 `ProxyFactory` 实例上 `invokevirtual` 调用指向 `getProxyPreparedStatement()`。

We eliminated the singleton factory (which was generated by Javassist) and replaced it with a final class having `static` methods (whose *bodies* are generated by Javassist). The Java code became:

我们消除了单例工厂(由 Javassist 类库生成) ，替换最后一个有`static`方法的`final`类 (方法体由Javassist生成)。

Java 代码变成:

```java
public final PreparedStatement prepareStatement(String sql, String[] columnNames) throws SQLException
{       
     return ProxyFactory.getProxyPreparedStatement(this, delegate.prepareStatement(sql, columnNames));   
}
```

Where `getProxyPreparedStatement()` is a `static` method defined in the `ProxyFactory` class. The resulting bytecode is:

其中 `getProxyPreparedStatement()` 是在 `ProxyFactory` 类中定义的静态方法:

```java
    private final java.sql.PreparedStatement prepareStatement(java.lang.String, java.lang.String[]) throws java.sql.SQLException;    
    flags: ACC_PRIVATE, ACC_FINAL
    Code:      
    stack=4, locals=3, args_size=3
         0: aload_0
         1: aload_0
         2: getfield      #3                  // Field delegate:Ljava/sql/Connection;
         5: aload_1
         6: aload_2
         7: invokeinterface #72,  3           // InterfaceMethod java/sql/Connection.prepareStatement:(Ljava/lang/String;[Ljava/lang/String;)Ljava/sql/PreparedStatement;
        12: invokestatic  #67                 // Method com/zaxxer/hikari/proxy/ProxyFactory.getProxyPreparedStatement:(Lcom/zaxxer/hikari/proxy/ConnectionProxy;Ljava/sql/PreparedStatement;)Ljava/sql/PreparedStatement;
        15: areturn
```

There are three things of note here:

这里有三件值得注意的事情:

- The `getstatic` call is gone. *
  - 没有`getstatic` 调用了*
- The `invokevirtual` call is replaced with a `invokestatic` call that is more easily optimized by the JVM.
  - `invokevirtual` 调用被替换为 `invokestatic` 调用，`invokestatic` 容易被JVM优化。
- Lastly, possibly not noticed at first glance is that the stack size is reduced from 5 elements to 4 elements. This is because in the case of `invokevirtual` there is an implicit passing of the instance of ProxyFactory on the stack (i.e `this`), and there is an additional (unseen) *pop* of that value from the stack when `getProxyPreparedStatement()` was called.
  - 最后，一开始可能没有注意到的是堆栈大小从5个元素减少到4个元素。这是因为在 `invokevirtal` 的情况下，在堆栈上隐式传递了 `ProxyFactory` 的实例(即 `This`) ，并且在调用 `getProxyPreparedStatement()` 时，从堆栈中有一个额外的(不可见的)弹出值。

In all, this change removed a static field access, a push and pop from the stack, and made the invocation easier for the JIT to optimize because the *callsite* is guaranteed not to change.

总之，这个更改删除了静态字段访问、栈中的推送和弹出操作，并使 JIT 更容易优化调用，因为减少了隐式转换。

> invokevirtal 不容易内联

---

### `¯\_(ツ)_/¯` Yeah, but still...

In our benchmark, we are obviously running against a stub JDBC driver implementation, so the JIT is doing a lot of inlining. However, the same inlining at the stub-level is occurring for other pools in the benchmark. So, no inherent advantage to us.

我们的基准测试，使用 stub JDBC 驱动，JIT 会做大量的内联优化。同样，使用其他连接池做基准测试时 JIT 产生同样的优化，所以，对我们来说没有先天优势。

But inlining is certainly a big part of the equation even when real drivers are in use, which brings us to another topic...

但是，即使在使用真正的驱动程序时，内联也肯定是很大一部分因素，这就把我们带到了另一个话题...

 参考：[what‘s the purpose to generate HikariProxyConnection by javaassist since you already write ProxyConnection ?](https://github.com/brettwooldridge/HikariCP/issues/1198)

> The proxies delegate to the real driver classes. Some proxies, like the one for ResultSet, only intercept a few methods. Without the code generation, the proxy would have to implement all 50+ methods which simply delegate to the wrapped instance.
> 
> Code generation, based on reflection, also means that nothing needs to be done when a new JDK version introduces new JDBC methods to existing interfaces.
> 
> 代理委托给真正的驱动类。有些代理，比如ResultSet的代理，只截取几个方法。如果没有代码生成，代理将不得不实现所有50多个方法，这些方法只是委托给包装的实例。 
> 
> 基于反射的代码生成还意味着，当新的JDK版本向现有接口引入新的JDBC方法时，不需要做任何事情。

#### ⏱ Scheduler quanta

Some [light reading](http://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/5_CPU_Scheduling.html).

**TL;DR** Obviously, when you're running 400 threads "at once", you aren't really running them "at once" unless you have 400 cores. The operating system, using N CPU cores, switches between your threads giving each a small "slice" of time to run called a *quantum*.

With a lot of threads running, as in many applications, when your time-slice runs out (as a thread) it may be a "long time" before the scheduler gives you a chance to run again. It is therefore crucial that a thread get as much as possible done during its time-slice, and avoid locks that force it to give up that time-slice, otherwise there is a performance penalty to be paid. And not a small one.

Which brings us to...

#### 🐌 CPU Cache-line Invalidation

Another big hit incurred when you can't get your work done in a quanta is CPU cache-line invalidation. If your thread is preempted by the scheduler, when it does get a chance to run again all of the data it *was* frequently accessing is likely no longer in the core's L1 or core-pair L2 cache. Even more likely because you have no control over which core you will be scheduled on next.

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/cache.architecture.png)

> 在多核处理器上，缓存遇到了一个问题——一致性。不同的处理器拥有完全或部分分离的缓存。L1缓存是分离的（这很普遍），而我有多个处理器，每一个处理器共享一个L2缓存。这随着具体情况而不同，如果一个现代多核机器上拥有多级缓存，那么快速小型的缓存将被处理器独占。

> **当一个处理器改变了属于它自己缓存中的一个值，其它处理器就再也无法使用它自己原来的值，因为其对应的内存位置将被刷新(invalidate)到所有缓存。而且由于缓存操作是以缓存行而不是字节为粒度，所有缓存中整个缓存行将被刷新！**

> 关于 CPU缓存知识 可以参考以下文档：
> 
> * [与程序员相关的CPU缓存知识](https://coolshell.cn/articles/20793.html)
> 
> * [7个示例科普CPU Cache](https://coolshell.cn/articles/10249.html)
> 
> * [代码执行的效率](https://coolshell.cn/articles/7886.html)
> 
> * [性能调优攻略](https://coolshell.cn/articles/7490.html)

### 参考文档：

- [https://www.linqz.io/2019/03/why-to-use-hikari-connection-pool.html](https://www.linqz.io/2019/03/why-to-use-hikari-connection-pool.html)

- How to choose database connection pool : [https://techblog.topdesk.com/coding/choosing-a-database-connection-pool/](https://techblog.topdesk.com/coding/choosing-a-database-connection-pool/)

- [http://www.programmersought.com/article/319698001/](http://www.programmersought.com/article/319698001/)

- How to size the Pool : [https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing)

- Database Down Behaviour : [https://github.com/brettwooldridge/HikariCP/wiki/Bad-Behavior:-Handling-Database-Down](https://github.com/brettwooldridge/HikariCP/wiki/Bad-Behavior:-Handling-Database-Down)

- Performance Comparison 1 : [https://www.wix.engineering/blog/how-does-hikaricp-compare-to-other-connection-pools](https://www.wix.engineering/blog/how-does-hikaricp-compare-to-other-connection-pools)

- Performance Comparison 2 : [https://nbsoftsolutions.com/blog/the-difficulty-of-performance-evaluation-of-hikaricp-in-dropwizard](https://nbsoftsolutions.com/blog/the-difficulty-of-performance-evaluation-of-hikaricp-in-dropwizard)

- [https://blog.jooq.org/2017/02/21/jooq-tuesdays-brett-wooldridge-shows-what-it-takes-to-write-the-fastest-java-connection-pool/](https://blog.jooq.org/2017/02/21/jooq-tuesdays-brett-wooldridge-shows-what-it-takes-to-write-the-fastest-java-connection-pool/)
