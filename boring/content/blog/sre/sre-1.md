---
title: "读《SRE：Google运维解密》一点思考"
date: 2020-04-01T02:01:58+05:30
update_date: 2020-04-01T02:01:58+05:30
description: "读《SRE：Google运维解密》一点思考"
tags: [sre]
---



> 转载， 原文地址 [读《SRE：Google 运维解密》一点思考](https://zhuanlan.zhihu.com/p/97600369)



**0、为什么诞生 SRE？**
----------------

* 原因一：企业成本的增长通用户的增长不成线性变化。但是随着系统的复杂度提升，组建越来越多，用户的流量压力也越来越大，相关的变更也会越来越多，各模块之间的变更顺序也会越来越复杂。在这样的情况下，单纯的靠运维人力的数量提升无法满足业务的发展需求，而且会提升企业的成本；
* 原因二：传统的研发团队和运维团队天然具有冲突。公司的 IT 人员的配置：研发（Dev）和运维（Ops），研发部门聚焦在快速构建和快速发布；运维部门关注的是如何避免发生故障，从目标上将就是矛盾的。且随着 IT 技术的发展，对 IT 从业者的要求也越来越高，既要懂得底层系统，也要懂得数据算法，同时对主流技术还要快速追赶，满足这样要求的人才太少；
* 原因三：生产工具为适配生产力发展的必然产物。为了提高 IT 行业的整体效率和质量，使得从手工运维时代，逐渐过度到脚本工具运维，在发展到平台数据运维，再到平台软件运维，在发展到智能自动化运维。通过一系列手段、工具、理念的进步，将 Ops 技术发展到 DevOps、DataOps、AIOps 等；

一、什么是 SRE？
----------

### 1.1 SRE 的基本了解

* 那么区别于研发同学和运维同学，SRE 要做一些什么工作，又要具备什么样的能力呢？

> Google 试从解决 Dev 和 Ops 之间的矛盾出发，雇佣软件工程师，创造软件系统来维护系统运行以替代传统运维模型中的人工操作。SRE 团队和产品研发部分在学术和工作背景上非常相似，从本质上将，SRE 就是在用软件工程的思维和方法论完成以前由系统管理员团队手动完成的任务。

* Google 的 SRE 具体会负责哪些

> SRE 在 Google 不负责某个服务的上线、部署，SRE 主要是保障服务的可靠性和性能，同时负责数据中资源分配，为重要服务预留资源，SRE 并不负责某个业务逻辑的具体编写，主要负责在服务出现宕机等紧急事故时，可以快速作出响应，尽快恢复服务，减少服务掉线而造成的损失。

* SRE 日常工作和职责包含哪些

> 一般来说，SRE 团队要承担以下几类职责：可用性改进、延迟优化、性能优化、效率优化、变更管理、监控、紧急事物处理以及容量规划与管理。  
> Tools Don't create reliability. Humans do. But tools can help.

* SRE 的使命

> 在减少资源消耗的同时，从可用性和性能层面，提升用户的体验。  
> Operations should NOT be a part of SRE missions. Operation is a way to understand production.

在书中对各个职责有较为清晰的说明，感兴趣的朋友去可以翻翻原文，这里就谈一下个人的体会。

### 1.2 SRE 的技能堆栈

* 语言和工程实现
  
  * 深入理解开发语言（Java/Golang 等）
  
  * 业务部门使用开发框架
  
  * 并发、多线程和锁
  
  * 资源模型理解：网络、内存、CPU
  
  * 故障处理能力（分析瓶颈、熟悉相关工具、还原现场、提供方案）
  
  * 常见业务设计方案，多种并发模型，以及相关 Scalable 设计
  
  * 各类底层数据库和存储系统的特性和优化

* 问题定位工具
  
  * 容量管理
  
  * Tracing 链路追踪
  
  * Metrics 度量工具
  
  * Logging 日志系统

* 运维架构能力
  
  * Linux 精通，理解 Linux 负载模型，资源模型
  
  * 熟悉常规中间件（MySQL Nginx Redis Mongo ZooKeeper 等），能够调优
  
  * Linux 网络调优，网络 IO 模型以及在语言里面实现
  
  * 资源编排系统（Mesos / Kubernetes）

* 理论
  
  * 机器学习中相关理论和典型算法
  
  * 熟悉分布式理论（Paxos / Raft / BigTable / MapReduce / Spanner 等），能够为场景决策合适方案
  
  * 资源模型（比如 Queuing Theory、负载方案、雪崩问题）
  
  * 资源编排系统（Mesos / Kubernetes）

二、SRE 是如何解决问题的？
---------------

### 2.1 解耦中台系统与应用

* **研发同学为生产环境负责，而 SRE 为组件或集群的可服务能力和稳定性负责**

    SRE 工程师中大部分是标准的软件工程师，他们擅长使用系统工程的方法去解决基础系统中的问题，同时持续的、工程化的解决问题，使得运维的压力不会随着上层应用的增加而线性增加（通常 20 人的 SRE 团队，可以支持上千研发同学的应用开发）**。**同时 SRE 同学对 Unix 系统内部细节、1～3 层网络比较了解，可以同研发一起分析应用程序性能问题。

* **SRE 应该更好的进行系统元数据的管理**

    系统的元数据应该是系统的架构拓扑图，通过动态、准确的更新元数据可以将采集到的 Event、Message、Metric 等数据映射到真实环境中去，并能通过各种手段进行系统健康程度的诊断，是的自动化监控和管理成为可能。

* **SRE 通过稳定性进行抽象，可以通用的解决稳定性问题**

    为了让庞大系统的运行效率提高，要不断的优化系统中的热点，并将系统中的热点服务扩展、升级、重构成为一个组建化的服务，这也是 SRE 中解耦系统的方法。不仅如此，SRE 对各个服务的可用性进行标准化定义，将统一的标准应用到不同的服务中去，将稳定性作为各个服务的重要度量指标，通过上述操作，收拢服务治理问题，提供系统的鲁棒性。

### 2.2 明确服务之间的可用性依赖

### 2.2.1 面向 SLO 编程标准的推行

![](https://pic2.zhimg.com/v2-14807fdebf288bce52701eab67de5c4d_r.jpg)

针对 SLO，我们举一个例子来说明以下，

![](https://pic2.zhimg.com/v2-cd7bab1146c699d27cc63096b89d37e1_r.jpg)

为什么要有 SLO，设置 SLO 的好处是什么呢？

* 对于客户而言，是可预期的服务质量，可以简化客户端的系统设计

* 对于服务提供者而言

* 可预期的服务质量

* 更好的取舍成本 / 收益

* 更好的风险控制 (当资源受限的时候)

* 故障时更快的反应，采取正确措施

注：

* 关于如何来定义 SLO 是一个相当复杂的事情，这个使用往往跟用户体验有直接的关系，推荐一个实际案例来展开，如何定制自己服务的 SLO。（Case Study: Implementing SLOs for a New Service - [https://www.usenix.org/conference/srecon19americas/presentation/lawson](https://link.zhihu.com/?target=https%3A//www.usenix.org/conference/srecon19americas/presentation/lawson)）
* 推荐一篇文章，阐述请求延时的 SLO 如何指定的，具体可以参考链接《Latency SLOs Done Right》[https://www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_schlossnagle_latency_slides.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_schlossnagle_latency_slides.pdf)
* 推荐一篇文章，从请求在系统运行中阐述了一些核型的 SLO 该如何制定，《How to trade off server utilization and tail latency》[https://www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_plenz.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_plenz.pdf)

### 2.2.2 面向 SLO 监控的设计 --- SLO 结果导向的告警，而不是原因导向的告警

* **四个黄金信号**
  
  * 当平台服务不可用，或访问速度变慢时，往往会影响到产品的整体质量，目前了解到的一些基础监控指标就达到上百种，通常的做法是在这些指标当中需要选取平台或业务比较关注的指标进行监控报警；
  
  * Google 的网站可靠性工程师小组（SRE）定义了四个需要监控的关键指标。他们称之为 “四个黄金信号”：延迟（Latency），流量（Traffic），错误（Errors）和饱和度（Saturation）。这四个信号应该是服务级别非常关键部分，因为它们对于提供高可用性的服务至关重要。

* **如何定义高质量的监控：**
  
  * 明确业务服务的 SLO（应该与该业务提供给客户的期望达成一致），并采用合理的 SLI 来描述；比如计数信息（总量、成功量）、测量信息（同比、环比）；
  
  * 主观上监控应该有丰富的内部状态数据、具备高可观测性条件；客观上具备业务视角，能够快速定位是全局问题还是局部问题；系统本身的鲁棒性，不会因为某个局部问题影响监控的权威性；具备 quota 限制能力，防止出现容量的问题；
  
  * 报警清理和定期的规则优化，定期进行盘点告警，并优化掉无 SLO 影响的规则；

### 2.3 完善的场景化演练

自动化系统的建设中除了要考虑系统的能力外，还要考虑人在其中所发挥的重要作用，毕竟一旦一些突发的时事件若必须由人来处理，则这时刻人的稳定性和准确性也是需要保证的。微软在 SRE 大会中提出了一个有意思的观点：如果一个系统能够比人做的更好，那人应该知道如何监控这个系统本身。因此，在保证 SLO 的情况下，可以做一些攻防演练（关闭 SRE 系统的 UI 后，SRE 该如何操作？）；或构建一个模拟系统，让人来执行系统；并学习故障的复盘报告等。

三、浅谈 SRE 的观察
------------

### 3.1 从 SRE2019 观察

SRE CONF 2019 传送门：

* Conference Report：SRECON AMERICAS 2019 ： [https://noidea.dog/blog/srecon-americas-2019](https://link.zhihu.com/?target=https%3A//noidea.dog/blog/srecon-americas-2019)
* Conference Program：SRECON Asia/Pacific 2019 ： [https://www.usenix.org/conference/srecon19asia/program](https://link.zhihu.com/?target=https%3A//www.usenix.org/conference/srecon19asia/program)

推荐几篇不错的 Session：

* 《Using ML to Automate Dynamic Error Categorization》来自 FaceBook [https://www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_davoli.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_davoli.pdf)
* 《ML Ops and Kubeflow Pipelines》 来自 Google [https://www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_sato.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_sato.pdf)
* 《NetRadar: Monitoring the datacenter network》来自 百度 [https://www.usenix.org/sites/default/files/conference/protected-files/sre19apac_slides_chen_netradar.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/sre19apac_slides_chen_netradar.pdf)
* 《Monitoring at LinkedIn》 来自 LinkedIn [https://www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_lamba.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_lamba.pdf)
* 《Detecting service degradation and failures at scale》来自 PayPal [https://www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_narayanan.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/srecon19apac_slides_narayanan.pdf)
* 《Tracing：Fast & Slow Digging into and improving your web services's performance》[https://www.usenix.org/sites/default/files/conference/protected-files/sre19amer_slides_root.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/sre19amer_slides_root.pdf)
* 《Designing Resilient Data Pipelines》[https://www.usenix.org/sites/default/files/conference/protected-files/sre19amer_slides_bolin.pdf](https://link.zhihu.com/?target=https%3A//www.usenix.org/sites/default/files/conference/protected-files/sre19amer_slides_bolin.pdf)
* 《Practical Instrumentation for Observability》[https://www.usenix.org/conference/srecon19asia/presentation/krabbe](https://link.zhihu.com/?target=https%3A//www.usenix.org/conference/srecon19asia/presentation/krabbe)

### 3.2 几个应该多花精力关注的点

* 系统的可观测性，换句话说是你真的了解你的系统么？你真的了解你的应用么？（不仅是后台系统、还有一些移动端系统和应用）要从 Logs 中索取更多的知识，挖掘出更多的内容供 SRE 使用
* 随着观测性要求的不断提供，灵活、新颖的可视化工具被大家越来越认可，单独使用线图进行可视化指标是远远不够了，需要更加新颖和便捷的可视化方案；同时要让数据产生价值，而不是简单的可视化，越来越多的公司使用 Pipeline 来解决相关任务的创建和管理，让数据清洗和规整后变的更优价值，使得算法产生最大的效用
* SRE 不仅仅要发现系统中存在的热点问题，也要能快速解决这些热点问题，并在以后的架构演进中消除这样的问题，则系统的自愈能力应该成为每个公司都关注的问题
