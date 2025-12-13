---
title: "Why to use Hikari Connection Pool ?"
date: 2019-12-18T12:13:38+05:30
update_date: 2019-12-18T12:13:38+05:30
---

[原文连接](https://www.linqz.io/2019/03/why-to-use-hikari-connection-pool.html)



[Hikari](https://github.com/brettwooldridge/HikariCP) Connection Pooling (or Hikari CP) is the new kid on the block, though a late entrant in pooling mechanisms, it is outperforming the ones offered by [C3P0](https://github.com/swaldman/c3p0), [Apache Commons DBCP](https://commons.apache.org/proper/commons-dbcp/), [BoneCP](http://www.jolbox.com/), [Tomcat](https://tomcat.apache.org/tomcat-7.0-doc/jdbc-pool.html), [Vibur](http://www.vibur.org/) etc.



Below benchmark graph displays connection and statement ops/ms graphs:

source : [GitHub - brettwooldridge/HikariCP](https://github.com/brettwooldridge/HikariCP)

![](https://scp-net-cn.oss-cn-beijing.aliyuncs.com/blog-images/performance_benchmark_hikaricp.png)



Multiple Blogs are already written about comparison and performance of [HikariCP](https://github.com/brettwooldridge/HikariCP), so this blog tries to explore some of the internal intricacies for e.g Why it is faster in comparison with its peer connection pooling libraries ? Any special code ? etc .

Links to other resources which has improved my understanding of HikariCP are shared at the end.

* Byte code simplification: HikariCP Library has optimized the code until the compiled byte-code is at a minimum, so that the CPU cache can load more program code, this is achieved by Javassist. (JavaAssist is used to generate dynamic proxies over JDK Proxies.Since fewer bytes are generated than the JDK Proxy, negating a lot of unnecessary byte-code, thus making it faster in execution)
* Optimizations of Proxy and Interceptor: Hikari library has reduce a lot of code, e.g HikariCP’s Statement proxy has only 100 lines of code.
* [FastList](https://github.com/openbouquet/HikariCP/blob/master/src/main/java/com/zaxxer/hikari/util/FastList.java) instead of ArrayList is implemented to avoid the range check every time, since the get() call is executed also during remove() call, it avoids the complete array scan from start to end. The ArrayList’s remove(Object) method traverses the array from scratch, and the FastList is traversed from the end of the array, so it’s more efficient when the removed element is at the end which is usually the case. Excerpt below from [FastList.java](https://github.com/openbouquet/HikariCP/blob/master/src/main/java/com/zaxxer/hikari/util/FastList.java)

```java
@Override   
public T get(int index)   
{
 return elementData[index];     // no range check of ArrayList
}
```

* Remove Method Implementation:

```java
@Override
public boolean remove(Object element)
{
 for (int index = size - 1; index >= 0; index--)
 {
  if (element == elementData[index])
  {
   final int numMoved = size - index - 1;
   if (numMoved > 0)
   {
    System.arraycopy(elementData, index + 1,      elementData, index, numMoved);
   }
   elementData[--size] = null;
   return true;
  }
 }
 return false;
}}
```

* Custom collection type called as [ConcurrentBag](https://www.javadoc.io/doc/com.zaxxer/HikariCP/2.6.1/com/zaxxer/hikari/util/ConcurrentBag.html) is implemented to improve the efficiency of concurrent reading and writing.
* The ConcurrentBag implementation provides a lock-free design, ThreadLocal caching, Queue-stealing and direct hand-off optimizations resulting in a high degree of concurrency, extremely low latency, and minimized occurrences of false-sharing.
* Other optimizations relating to method calls, that take minimum CPU time slice are implemented.
* HikariCP jar size is just 135KB, due to the smaller amount of code, the efficiency of execution is higher. As per the popular saying in software coding practice “Lower the code lower the probability of bugs”, HikariCP has least no of bugs.

Check the source code of lockless and thread safe implementation of ConcurrentBag [here](https://github.com/openbouquet/HikariCP/blob/master/src/main/java/com/zaxxer/hikari/util/ConcurrentBag.java).

Further Reading Material:

* How to choose database connection pool : [https://techblog.topdesk.com/coding/choosing-a-database-connection-pool/](https://techblog.topdesk.com/coding/choosing-a-database-connection-pool/)
* [http://www.programmersought.com/article/319698001/](http://www.programmersought.com/article/319698001/)
* How to size the Pool : [https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing)
* Database Down Behaviour : [https://github.com/brettwooldridge/HikariCP/wiki/Bad-Behavior:-Handling-Database-Down](https://github.com/brettwooldridge/HikariCP/wiki/Bad-Behavior:-Handling-Database-Down)
* Performance Comparison 1 : [https://www.wix.engineering/blog/how-does-hikaricp-compare-to-other-connection-pools](https://www.wix.engineering/blog/how-does-hikaricp-compare-to-other-connection-pools)
* Performance Comparison 2 : [https://nbsoftsolutions.com/blog/the-difficulty-of-performance-evaluation-of-hikaricp-in-dropwizard](https://nbsoftsolutions.com/blog/the-difficulty-of-performance-evaluation-of-hikaricp-in-dropwizard)
* [https://blog.jooq.org/2017/02/21/jooq-tuesdays-brett-wooldridge-shows-what-it-takes-to-write-the-fastest-java-connection-pool/](https://blog.jooq.org/2017/02/21/jooq-tuesdays-brett-wooldridge-shows-what-it-takes-to-write-the-fastest-java-connection-pool/)
