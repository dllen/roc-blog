---
title: "第 14 讲：发布与运维的四层环境规格"
date: 2026-11-25
description: "南京大学《生成式软件工程》第 14 讲把发布与运维拆成四层环境规格：别人的机器、别人的网络、昨天的数据、全校同一分钟。本文用可运行的 SQLite 演练把三步在线迁移变成每步都要成立的不变量，并给出事件重放副作用检测器与灰度放量判定规则。"
tldr: "环境也是规格的一部分。三步在线迁移的次序不是风格问题而是可执行约束：历史数据没补齐就收紧 NOT NULL 会直接失败；重放路径带上副作用，全班会再收一次通知。"
keywords: ["软件发布与运维", "在线迁移", "事件溯源重放", "灰度发布", "生成式软件工程"]
taxonomies:
  tags: ["软件工程", "生成式 AI", "课程笔记", "发布运维"]
---

测试全绿、作者在自己电脑上能把一局游戏打通，离「发布成功」还有多远？《生成式软件工程》第 14 讲的回答是：从这一刻起，你既要让程序在别人的环境里运行，还得想办法在有人使用它的时候修改它。

这一讲用四个递进的场景回答它：把游戏发给室友（别人的机器）、把 localhost 发给群友（别人的网络）、教务系统不停机怎么加校区字段（昨天的数据）、选课同一分钟全校点击（所有人的同一分钟）。我把它读成一句话：**环境也是规格的一部分**——课程此前的三道缝隙是 Intent→Spec→Impl，这一讲补上了第四段 Impl→Deployment。

四个场景本身是讲义的；这篇想做的是把其中三处定性断言变成**可机械检查的规则**：迁移的步骤次序、事件重放的副作用、灰度放量的判定。三个脚本都用 Python 标准库写成，可以直接跑。

## 一、别人的机器：发行物不只是程序

第一位群友双击就报错：缺少 `libSDL2-2.0.so.0`。游戏用了 SDL，你机器上恰好装着，收到文件的群友没有——操作系统的加载器找不到动态库，还没运行到你写的第一行游戏逻辑就停了。

讲义随后用三个历史片段说明「发行物」从来不只是程序本身：《101 BASIC Computer Games》把程序印在纸上，读者逐行敲进机器；《DOOM》第一章的共享版附带 `ORDER.FRM`，发行者顺手安排了玩家如何发现游戏、如何得到下一部分；Windows 3.0a 的发行介质用了 15 张 360 KB 软盘，而用户手里可能是 8086、286 或 386——判断机器条件、选择启动模式是 `WIN.COM` 的工作。共同的点是：**发行者交付的不只是程序，还包括玩家如何拿到并开始使用它。**

今天这件事由 CI/CD 承担。讲义举的实物是 Codex 的一次预发布：打上版本标签 `rust-v0.173.0-alpha.4`，GitHub Actions 为 Linux、macOS、Windows 与多种架构构建、打包、签名、验证，最后分发到 GitHub 和 npm，讲义说那次发布页列出 **196 个文件**。

这一页我核了一遍：GitHub API 对该 tag 返回 **194 个 asset**，加上 GitHub 自动生成的两份源码归档（zip 与 tar.gz），页面上才是 196 项。这 2 项之差本身就是提醒——**发行物的大小由发行者事先安排妥当，而不是由用户在自己机器上碰运气。**

讲义在节末把话头拉回架构：老板说「Android、iOS、鸿蒙也一起上吧」，哪些该交给流水线、哪些得回去改设计？账很好算：把「按空格开火」改成「点屏幕开火」，命中判定要改几处？若键盘和触屏都只向游戏规则提交同一个动作，加一种输入设备很便宜；要是键盘事件里顺手写了命中、计分和存档，再能写打包脚本的 Agent 也得钻回去拆依赖。一句值得单独记的话：

> 发布时才提出来的需求，考的可能是写第一条 prompt 时做的架构决定。

## 二、别人的网络：能回答不等于能办事

游戏能装了，室友点开你发的地址——他点的是 `localhost`，浏览器忠实地去他自己电脑上找排行榜。应用可以每人复制一份各自跑，但大家要看同一张榜，就得约定到哪里交成绩、由谁保存、从哪里读。

讲义列了三种部署方式（传统 LAMP、客户端渲染加容器化接收、Serverless），并指出**平台接手的部分各不相同，不变的是设计者仍然要回答的那部分**：成绩存在哪里、哪个玩家有权改哪条记录。验收方式也很具体：听到 Agent 说「部署好了」，就切到手机移动网络，加入室友的房间打完一局，再看两个人的榜单是否一致。

讲义用 GPT Store 划出了「能回答」与「能办事」的分界：选课助手能回答「这门课算几学分」，而「帮我选上这门课」只多说了几个字，背后却需要教务接口、学生授权和一次真正成功的选课回执。至于证书——南大图书馆那个站点证书在有效期内、浏览器却不认可——讲义把它变成一组可检查的假设：服务器发了哪些中间证书？用户设备能不能沿着这条链走到自己信任的根？

这一节的方法论落点是把「群友也能玩」收紧成可检查的规格：一台没装开发工具的目标机器，能从发布页下载安装、与室友打完一局，升级后还能读出昨晚的存档。**目标明确，手段发散，最后让室友按真正的使用路径验收。**这条路径上的另一个约束来自 [第 12 讲的形式化验证](/blog/formal-verification-testing-to-proof/)：验收靠的是接收方自己的检查机制，而不是产物的来源。

## 三、昨天的数据：三步在线迁移是可执行约束

场景是苏州校区落成：数据库加一个「校区」字段看着简单，麻烦在于昨天的程序还在开课，昨天的数据还要出现在今天的课表上。讲义给的解法分三步——**先加允许为空的字段让新旧程序共用数据库；先教会所有读者再开放教务员写入；最后所有写入口都退场了，才补齐数据并加上 `NOT NULL`。**

这三步读起来像流程建议，其实是能跑的约束：每一步之后，「旧程序还能写入」和「新程序还能读出」必须同时成立，否则那个中间状态就没法给学生服务。下面这段演练在真 SQLite 上走一遍三步，并在每步之后检查这两个不变量：

```python
"""三步在线迁移：真 SQLite 上逐步断言「旧程序能写、新程序能读」，并枚举被漏掉的中间状态。

旧程序只会 INSERT (id, name)，不知道 campus 列；新程序读 campus。
"""
import itertools
import sqlite3

OLD_INSERT = "INSERT INTO courses (id, name) VALUES (?, ?)"
NEW_SELECT = "SELECT id, name, campus FROM courses"


def fresh_db():
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT)")
    con.execute("INSERT INTO courses VALUES (1, '操作系统')")
    return con


def old_app_write(con, cid, name):
    """旧程序：不带 campus。"""
    con.execute(OLD_INSERT, (cid, name))


def new_app_read(con):
    """新程序：读 campus。"""
    return con.execute(NEW_SELECT).fetchall()


def step1_add_nullable_column(con):
    con.execute("ALTER TABLE courses ADD COLUMN campus TEXT")


def step2_teach_readers(con):
    """先教会所有读者：新程序必须能处理 campus 为空（显示「校区待确认」），不能默认指派。"""
    rows = new_app_read(con)
    assert all(r[2] is None for r in rows), "老课程的 campus 应为空"
    return len(rows)


def tighten_without_backfill(con):
    """错误次序：直接收紧，不先补齐历史数据。"""
    con.execute("CREATE TABLE courses_new (id INTEGER PRIMARY KEY, name TEXT, campus TEXT NOT NULL)")
    con.execute("INSERT INTO courses_new SELECT id, name, campus FROM courses")
    con.execute("DROP TABLE courses")
    con.execute("ALTER TABLE courses_new RENAME TO courses")


def step3_backfill_and_tighten(con):
    """最后才收紧：先补齐历史数据，再给 campus 加 NOT NULL（SQLite 只能重建表）。"""
    con.execute("UPDATE courses SET campus = '南京' WHERE campus IS NULL")
    con.execute("CREATE TABLE courses_new (id INTEGER PRIMARY KEY, name TEXT, campus TEXT NOT NULL)")
    con.execute("INSERT INTO courses_new SELECT id, name, campus FROM courses")
    con.execute("DROP TABLE courses")
    con.execute("ALTER TABLE courses_new RENAME TO courses")


_next_id = [100]


def check_invariants(con, label, expect_old_writable=True):
    """每一步之后都要成立：旧程序还能写入，新程序还能读出。"""
    try:
        _next_id[0] += 1
        old_app_write(con, _next_id[0], "操作系统(2)")
        old_ok = "旧程序可写"
    except sqlite3.Error as e:
        old_ok = "旧程序写入失败: %s" % e
    try:
        rows = new_app_read(con)
        new_ok = "新程序可读 %d 行" % len(rows)
    except sqlite3.Error as e:
        new_ok = "新程序读取失败: %s" % e
    tag = "" if expect_old_writable else "（预期如此：旧写入入口已退场）"
    print("%s -> %s%s | %s" % (label, old_ok, tag, new_ok))
    return old_ok, new_ok


print("== 正确次序 ==")
con = fresh_db()
step1_add_nullable_column(con)
check_invariants(con, "第 1 步 加可空 campus 列后")
n = step2_teach_readers(con)
print("第 2 步 教会读者后：新程序读到 %d 行老课程，campus 全为空（须显示「校区待确认」）" % n)
check_invariants(con, "第 2 步 教会读者后")
step3_backfill_and_tighten(con)
check_invariants(con, "第 3 步 补齐并收紧 NOT NULL 后", expect_old_writable=False)
con.close()

print()
print("== 错误次序 A：历史数据没补齐就先收紧 NOT NULL ==")
con2 = fresh_db()
step1_add_nullable_column(con2)
try:
    tighten_without_backfill(con2)
    print("收紧成功")
except sqlite3.Error as e:
    print("收紧时失败: %s" % e)
con2.close()

print()
print("== 错误次序 B：schema 还没加列就先上新程序 ==")
con3 = fresh_db()
try:
    new_app_read(con3)
    print("新程序读到了课表")
except sqlite3.Error as e:
    print("新程序读取失败: %s" % e)
con3.close()

print()
print("== 上线现场有多少个「当前版本」 ==")
SCHEMAS = ["pre", "nullable", "notnull"]
APPS = ["old_only", "both", "new_only"]
BACKFILL = ["none", "partial", "full"]


def classify(schema, app, backfill):
    if app in ("old_only", "both") and schema == "notnull":
        return "crash", "旧程序 INSERT 不带 campus -> NOT NULL 约束失败"
    if app in ("both", "new_only") and schema == "pre":
        return "crash", "新程序 SELECT campus -> no such column"
    if app in ("both", "new_only") and schema == "nullable" and backfill != "full":
        return "risk", "老课程 campus 为空：新程序必须显式处理，默认指派就是静默错"
    return "ok", "可服务"


rows = [(s, a, b) + classify(s, a, b) for s, a, b in itertools.product(SCHEMAS, APPS, BACKFILL)]
endpoints = {("pre", "old_only", "none"), ("notnull", "new_only", "full")}
print("组合总数 =", len(rows), "= 3 schema x 3 app x 3 backfill")
for kind in ("crash", "risk", "ok"):
    print("  %-5s = %d" % (kind, len([r for r in rows if r[3] == kind])))
print("测试只试的两个端点：", ", ".join("%s/%s/%s->%s" % (r[0], r[1], r[2], r[3]) for r in rows if (r[0], r[1], r[2]) in endpoints))
print("端点之外会崩的组合数 =", len([r for r in rows if r[3] == "crash" and (r[0], r[1], r[2]) not in endpoints]))
```

```text
== 正确次序 ==
第 1 步 加可空 campus 列后 -> 旧程序可写 | 新程序可读 2 行
第 2 步 教会读者后：新程序读到 2 行老课程，campus 全为空（须显示「校区待确认」）
第 2 步 教会读者后 -> 旧程序可写 | 新程序可读 3 行
第 3 步 补齐并收紧 NOT NULL 后 -> 旧程序写入失败: NOT NULL constraint failed: courses.campus（预期如此：旧写入入口已退场） | 新程序可读 3 行

== 错误次序 A：历史数据没补齐就先收紧 NOT NULL ==
收紧时失败: NOT NULL constraint failed: courses_new.campus

== 错误次序 B：schema 还没加列就先上新程序 ==
新程序读取失败: no such column: campus

== 上线现场有多少个「当前版本」 ==
组合总数 = 27 = 3 schema x 3 app x 3 backfill
  crash = 12
  risk  = 4
  ok    = 11
测试只试的两个端点： pre/old_only/none->ok, notnull/new_only/full->ok
端点之外会崩的组合数 = 12
```

输出里有三处值得停下来看。

第一，第 3 步之后旧程序的写入失败了，报 `NOT NULL constraint failed: courses.campus`。这不是 bug，而是**这条约束的真正含义**：一旦收紧，旧写入入口就必须已经退场；两者不能共存。讲义里那句「等所有写入入口都会填校区、旧写法确实退场」，落到代码上就是这一行错误。

第二，两个错误次序各自给出了具体的失败点：历史数据还没补齐就收紧，拷贝旧行时直接 `NOT NULL constraint failed: courses_new.campus`；schema 还没加列就先上新程序，则是 `no such column: campus`。**次序不是风格问题，它对应着具体的异常。**

第三，脚本最后数了一遍「上线现场到底有几个当前版本」：把 schema 阶段（无列 / 可空 / 已收紧）、运行中的应用（只有旧 / 新旧都在 / 只有新）、历史数据回填程度（无 / 部分 / 全量）三个维度组合起来，一共 27 种组合，其中 12 种会崩、4 种需要新程序显式处理空值、11 种可服务。而测试通常只试的两个端点——全旧与全新——恰好都落在可服务的那 11 种里。

讲义的原话是：

> 上线的几小时里，「当前版本」其实有好几个。数据库、新旧应用以及已经写入的数据都有各自的进度。

把这句话展开成状态空间之后，它的含义变得可以核对：**系统版本不是全序而是偏序**，而只测全序两端的测试，恰好漏掉了现场真实跑过的那批中间状态。讲义在同一段还提到旧数据不能擅自补成同一个校区——这对应枚举结果里那 4 种「需要显式处理」的状态：新程序必须把空值显示成「校区待确认」，一旦图省事默认指派，就会把全校老课程派去同一个校区，这是静默错，比崩溃更难发现。

### 重放路径不能有副作用

有些系统在架构上多留了一条路：开课时记下「开设操作系统课」，调整地点再追加「上课地点改到苏州」，课表是依次应用这些事件算出来的结果。旧版继续提供原来的课表，新版在旁边从头重放同一串事件，生成按校区展示的另一张新表；等新版追平最新事件、比对两边本该一致的选课记录，再把查询切过去。讲义在这里留了一个精彩的警告：

> 重放「地点变更」是为了重建课表，要是顺手又给全班发了一次通知，同学们会很快帮你发现这个架构问题。

这句话可以直接写成检查器：重放期间产生的外部副作用条数必须为 0。

```python
"""事件溯源做迁移：重放路径上不能有副作用。

重放只是把事件流再算一遍；通知属于「命令」，只能在首次处理时发一次。
"""
EVENTS = [
    {"op": "开设", "course": "操作系统", "campus": "南京"},
    {"op": "改地点", "course": "操作系统", "campus": "苏州"},
]


def reduce_events(events):
    """纯函数：课表 = 依次应用事件的结果。"""
    table = {}
    for e in events:
        table[e["course"]] = e["campus"]
    return table


def first_pass(events):
    """首次处理：改地点是一次命令，顺带发一条通知。"""
    table = reduce_events(events)
    sent = ["通知：%s 地点改为 %s" % (e["course"], e["campus"]) for e in events if e["op"] == "改地点"]
    return table, sent


def replay_with_commands(events):
    """反面实现：命令混在事件流里，重放会再执行一次。"""
    sent = ["通知：%s 地点改为 %s" % (e["course"], e["campus"]) for e in events if e["op"] == "改地点"]
    return reduce_events(events), sent


def replay_pure(events):
    """正确实现：重放只算状态，不执行命令。"""
    return reduce_events(events), []


def side_effects_on_replay(events, replay_fn):
    """检查器：重放期间产生的外部副作用条数。"""
    _, sent = replay_fn(events)
    return len(sent)


table, sent = first_pass(EVENTS)
print("首次处理后的课表 =", table)
print("首次处理发出的通知 =", sent)
print("重放（纯函数）的副作用数 =", side_effects_on_replay(EVENTS, replay_pure))
print("重放（命令混进事件流）的副作用数 =", side_effects_on_replay(EVENTS, replay_with_commands))
n = side_effects_on_replay(EVENTS, replay_with_commands)
print("检查器判定 =", "FAIL：重放路径上有副作用，全班会再收到一次通知" if n > 0 else "PASS：重放路径无副作用")
```

```text
首次处理后的课表 = {'操作系统': '苏州'}
首次处理发出的通知 = ['通知：操作系统 地点改为 苏州']
重放（纯函数）的副作用数 = 0
重放（命令混进事件流）的副作用数 = 1
检查器判定 = FAIL：重放路径上有副作用，全班会再收到一次通知
```

注意「重放（纯函数）的副作用数 = 0」与「重放（命令混进事件流）的副作用数 = 1」的区别：两种实现算出的课表完全一样，差别只在一条通知发了几次。**重放路径和命令路径必须分开**——这与 [第 7 讲的事件溯源](/blog/event-sourcing-and-explainable-conclusions/) 里「状态 = 依次应用事件的结果」是同一条约束，只是这次它有了一个能跑的判据。

## 四、全校同一分钟：源代码只描述了服务行为的一部分

开学第一天，全校学生在同一分钟点「提交」。平时一个人跑得飞快的程序，现在究竟在哪里排队？

讲义给了两个案例。第一个是 Nginx 的线程池实验：一批客户反复下载同一个 4 MB 热门文件，虽然它已经在内存缓存里，负责接待他们的工作进程却可能正卡在前一笔读盘上——实验中热门文件平均要等 **7.42 秒**；打开 `aio threads`，把可能阻塞的磁盘工作交给线程池后，同一个热门文件的平均响应时间降到约 **226 毫秒**。讲义照例给了限定：这两个数字属于那组混合负载，放回教务系统，得先测出学生在等什么，才知道哪个开关值得动。

第二个案例是 Amazon 的建连超时：一项远程调用把超时设在约 20 毫秒，平时复用已建好的安全连接绰绰有余；新机器刚接流量时，计时器却把第一次建立安全连接也算了进去，有的请求还没办正事就超时。解法从「放宽建连时的限制」演进为「进程启动、接收流量之前就把连接建好」。区别只在什么时候开始接客，而用户看到的是升级后的头几笔业务究竟成不成功。

方法论层面讲义引入了 SRE（站点可靠性工程），逐词拆开：Site 是让真实站点持续提供服务；Reliability 得从用户的角度量——在多少比例的选课请求里，学生按下提交后能在约定时间内拿到正确结果，刷新课表还能看见刚选上的课；Engineering 则要求把保障这个结果的经验写进工具和流程。讲义那句对照很扎人：检查服务器进程是否还活着很容易，确认刚选上的课确实留在了学生的课表里，值得专门去测。

灰度发布是这套方法的落地动作：先让少量选课请求走新版，观察新旧版本的提交成功率、等得最久的那批请求，以及「提示成功、课表里却没有」的次数；指标恶化就暂停放量，切回仍能读写现有数据的版本；指标稳定再逐步扩大。这条规则也可以直接写成代码：

```python
"""灰度发布：把「指标恶化就暂停放量」写成可判定的规则。

阈值是拍出来的示例值，不是权威 SLO；检查器只回答「按这套阈值要不要停」。
"""
MIN_SAMPLES = 100
THRESHOLDS = {"success_rate": 0.99, "p99_ms": 800, "silent_mismatch": 0}


def decide(metrics):
    if metrics["samples"] < MIN_SAMPLES:
        return "样本不足，继续观察", "样本 %d < %d，噪声压不住结论" % (metrics["samples"], MIN_SAMPLES)
    reasons = []
    if metrics["success_rate"] < THRESHOLDS["success_rate"]:
        reasons.append("新版成功率 %.3f < %.2f" % (metrics["success_rate"], THRESHOLDS["success_rate"]))
    if metrics["p99_ms"] > THRESHOLDS["p99_ms"]:
        reasons.append("p99 %dms > %dms" % (metrics["p99_ms"], THRESHOLDS["p99_ms"]))
    if metrics["silent_mismatch"] > THRESHOLDS["silent_mismatch"]:
        reasons.append("提示成功但未落库 %d 次 > %d" % (metrics["silent_mismatch"], THRESHOLDS["silent_mismatch"]))
    if reasons:
        return "暂停放量并切回", "; ".join(reasons)
    return "继续放量", "三个指标都在阈值内"


cases = [
    ("稳定", {"samples": 500, "success_rate": 0.998, "p99_ms": 420, "silent_mismatch": 0}),
    ("恶化", {"samples": 500, "success_rate": 0.961, "p99_ms": 1900, "silent_mismatch": 7}),
    ("样本不足", {"samples": 12, "success_rate": 0.700, "p99_ms": 3000, "silent_mismatch": 4}),
]
for name, m in cases:
    action, why = decide(m)
    print("%s -> %s（%s）" % (name, action, why))
```

```text
稳定 -> 继续放量（三个指标都在阈值内）
恶化 -> 暂停放量并切回（新版成功率 0.961 < 0.99; p99 1900ms > 800ms; 提示成功但未落库 7 次 > 0）
样本不足 -> 样本不足，继续观察（样本 12 < 100，噪声压不住结论）
```

第三组用例是这个检查器最该被记住的部分：成功率 0.700、p99 3000 毫秒、静默不一致 4 次，指标已经很难看，但因为样本只有 12 条，判据给出的结论是**继续观察**而不是立刻切回——**样本量不足时，指标本身就是噪声**。真实系统里这条尤其重要：刚放量时前几十个请求失败，未必说明新版有问题。

## 五、谁来判断 AI 把事情做成了

这一讲的开篇其实是一笔账，最后要还回去。2026 年 11 月，Levent Alpöge 公布了与 Claude 合作完成的黎曼猜想证明。讲义关心的不是猜想本身，而是：**究竟是谁验收的？**

验收分两层。证明层：多位复核者从源代码导出相同的证明，Lean 内核和其他独立实现的检查器分别检查其中的推理——如果检查器接受了一份证明，我们就有理由相信它写下的命题。命题层：数论专家审视数学库里的命题，两种独立工具比较作者所证的定理和这个命题，确认二者一致——至于那个命题说的究竟是不是「黎曼猜想」，还得由熟悉数论的人来判断。

这正是 [第 12 讲](/blog/formal-verification-testing-to-proof/) 说的信任架构换轴在现实中的样子，而且更细：机械层管「证明对不对」，人层管「证的是不是那道题」，**规格作弊是内核发现不了的**。讲义顺手留了一个转述陷阱——Anthropic 公布的 VP ≠ VNP 论文针对的是计算多项式的算术电路，读者若顺手把标题写成 P ≠ NP，就已经在转述时换了一道题。

同一段里还有两件关于「工具变便宜之后人干什么」的事。其一是 Alpöge 被戏称为「Prompt 大师」：他先在一个简化问题里发现两种方法可以配合，再认出大问题里哪一步有同样的结构，把模型带到那里，而这样的提示词很难从一句通用的「请深度思考」里搜出来——**写下那句话的人，得先看见两个问题之间的联系**。其二是欧拉与 Galois 的两个例子：欧拉不逐个生成素数去逼近，而是把整数的乘法结构翻译成无穷级数；Galois 若有语言模型，也许拿到五次方程的五个近似根就收工，但人还会追问「哪些方程的根可以用根式写出来」，群论是在那个追问里出现的。

讲义最后落到 Lab3「蒸馏你自己」：把自己纠正过的回答留下来、遮住参考答案，让 Agent 用改过的提示词重做——一次改动也许治好了今天的毛病，却让它把昨天做对的题做错了。**人很难每次都把旧题重判一遍，Agent 却可以。**这就是课程说的递归式自我改进的动手版（实验笔记见[课程地图](/blog/generative-software-engineering-course-map/)）。

## 六、这三条检查器判不了什么

自检工具不是评分标准，这一篇的三个脚本同样有明确边界：

- **迁移演练判不了并发问题。** 它检查的是「每一步之后旧程序能写、新程序能读」，用的是单线程的内存数据库；真实上线里新旧程序同时写入的竞争、锁、以及「刚好在补齐数据的瞬间来了新写入」这类窗口，都不在它的覆盖范围内。枚举出的 27 种状态是维度组合，不是时序交错。
- **副作用检查器只认外部可观测的副作用。** 它能抓住通知、邮件这类会发出去的东西，抓不住「悄悄改了别处的配置」——那需要为每类副作用单独写探针。
- **灰度阈值的数字是拍的。** 0.99 的成功率、800 毫秒的 p99、100 的最小样本量，都只是示例值，不是任何 SLO 的替代品。检查器能回答的只有一句：**按这套阈值，现在要不要停。**阈值该定多少，是要和业务一起量的另一件事。

这三条加起来，其实就是讲义在部署那一节的老话：**先测出用户在等什么，再决定动哪个开关**——先明确目标，再让手段发散。

## FAQ（七、常见问题）

**Q：在线迁移的三步为什么不能压缩成两步，比如直接加列并一次性补齐？**

A：因为「一次性补齐」这个动作本身需要旧程序停下来。讲义设定的是「选课期间全天可用」，此时旧程序还在往同一张表里写新记录；任何一次补齐都可能在补完后又被旧程序插进一条空校区行，于是 `NOT NULL` 永远加不上。上面脚本里「错误次序 A」那一组失败（`NOT NULL constraint failed: courses_new.campus`）就是这条的直接体现。

**Q：那停机窗口不是最省事吗？**

A：是，讲义也承认能约定停机当然省事（12306 就公布办理时段）。三步法解决的是**不能停机**时的次序问题，不是比停机更优的方案。有停机窗口就用停机窗口。

**Q：事件溯源重放时到底哪些算「副作用」？**

A：凡是在重放路径上做、且在真实用户那里会产生第二次效果的动作：发通知、发邮件、扣款、调用外部 API。重放路径只应该做纯计算——把事件流折叠成状态。看脚本里的判定方式：两种实现算出的课表一模一样，差别只在通知发了几次。

**Q：灰度为什么先看「提示成功但课表里没有」这种指标？**

A：因为它是唯一一类「用户已经拿到成功提示、但系统其实没写进去」的故障。它不会体现在服务端的错误率或延迟里，却会直接变成学生的投诉。用讲义的原话：检查服务器进程是否还活着很容易，确认刚选上的课确实留在了学生的课表里，值得专门去测。

## 延伸阅读

- [《生成式软件工程》2026 秋第 14 讲：软件发布与运维](https://jyywiki.cn/GSE/2026/lect14.md) —— 本文整理自这一讲（主讲：jyy）；讲义与幻灯片以 CC BY-NC 4.0 协议发布
- [课程地图：13 讲骨架与三个实验](/blog/generative-software-engineering-course-map/) —— 这一讲是 14 讲版本的续篇
- [第 12 讲：从测试到证明](/blog/formal-verification-testing-to-proof/) —— 证明便宜之后，问题前移到「规格是否符合意图」
- [第 11 讲：错误如何传播与暴露](/blog/fault-error-failure-testing/) —— 「架构决定了质量」与 CS:GO 案例
- [第 7 讲：让结论可解释](/blog/event-sourcing-and-explainable-conclusions/) —— 事件溯源与状态 = 依次应用事件的结果
- [第 8 讲：Agent Native 开发](/blog/agent-native-development-practices/) —— 把开发者当成不可信来源重新设计流程
- [Lean 与 Mathlib 社区的联合说明](https://leanprover-community.github.io/blog/posts/riemann-hypothesis/) —— 黎曼猜想证明的两层验收
- [Alpöge 的研究手记](https://alpo.ge/remark.pdf) —— 「Prompt 大师」：先在简化问题里发现两种方法可配合
- [Codex 这次发布的文件](https://github.com/openai/codex/releases/tag/rust-v0.173.0-alpha.4) —— 194 个 asset 加两份源码归档，共 196 项
- [Nginx 团队的压测过程](https://www.f5.com/company/blog/nginx/thread-pools-boost-performance-9x) —— `aio threads` 把热门文件平均等待从 7.42 秒降到约 226 毫秒
- [Amazon 工程师的复盘：Timeouts, Retries and Backoff with Jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) —— 20 毫秒超时把首次建连算了进去
- [Google SRE 手册导言](https://sre.google/sre-book/introduction/) —— Site / Reliability / Engineering 三个词

本文的三个脚本为自写增量，仅依赖 Python 标准库（sqlite3、itertools），在 Python 3.9.6 上实跑通过，输出与正文中的结果块逐行一致。
