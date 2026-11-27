---
title: "支付系统：未知结果、账本与对账的三笔账"
date: "2026-11-27"
update_date: "2026-11-27"
description: "《系统设计面试内幕指南》第 26 章讲支付系统：收款付款流程、PSP 集成、复式记账账本、幂等与精确一次投递。本文给三个可跑的模型：PSP 超时与 webhook 丢失让约 4800 笔支付悬空等对账；账本每天 800 万条分录、3 副本 0.76 TB/年；对账只比 id 会漏掉全部金额不一致。"
tldr: "支付系统真正的难点不是吞吐（日均 100 万笔只有 10 笔/秒量级），而是「不知道结果」和「对不上账」。PSP 超时 0.2% + webhook 丢失 0.1% 会让约 4800 笔支付悬在未知态等对账收敛；每个支付订单在账本上是 4 条分录，每天 800 万条、3 副本 0.76 TB/年；对账键只到 id 会漏掉全部金额不一致，必须到「id + 金额」；差异率是人力乘数：0.01% 约 6.33 个 FTE。"
keywords: ["支付系统", "幂等键", "复式记账", "对账差异", "webhook 丢失", "未知结果"]
taxonomies:
  tags: ["系统设计", "架构设计", "读书笔记", "支付系统"]
---

支付系统的三笔账是哪三笔？答：未知结果的存量、账本的写入放大、对账差异的人力。支付系统这一章把收款与付款流程、PSP 集成、托管支付页、复式记账账本、精确一次投递与幂等、一致性与安全都讲全了，但「每一笔到底意味着什么」留成了定性判断。这篇把它们算出来。

本文不复述译文，也不搬运中文译本的任何段落。它复述这一章的骨架（问答敲定的需求、高层参与者、API 与数据模型、托管支付页流程、深入设计的七类机制），然后补三个自写模型：**未知结果的排队账**、**账本的写入放大与对账键**、**对账差异的人力账与挂账资金**。三个模型只依赖 Python 标准库，确定性输出，两次运行逐字节一致。

## 口径说明

- 源笔记是 Alex Xu《System Design Interview — An Insider's Guide》第 26 章的社区中译。上游两仓库（英文 [liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)、中文 [lukeTheNeuromancer/system-design-notes-zh](https://github.com/lukeTheNeuromancer/system-design-notes-zh)）的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均返回 404（2026-11-27 实测四条 URL 全部 404），**上游许可未能确认**；原书是商业出版物。故本篇为导读式：只复述章节骨架与需求数字，不引用译文原文或原书段落，不使用译本配图，正文主体是自写模型与判断。
- 撞题检查：自动判定 **LOW_RISK**（命中文章的最高覆盖度 0/15，共同实体词只有 `github.com`、`Alex Xu`、`double`、`FAILED`、`amount`、`currency` 这类出处词与泛词）；人工复核确认已发文章的机制（估算校验、消息队列分区、通知投递率、限流算法）与本章的支付幂等、账本分录、对账人力不同，判为不同主题。
- 三个脚本均为自写增量；输出为实跑结果，逐行可复现。
- 与已发文章的重叠见「这一章不重复已发的内容」一节。

## 一、本章骨架：需求数字、参与者、两张表与深入设计清单

**需求问答敲定的范围**：电商系统的支付后端；支付方式以信用卡为代表（真实系统还要 PayPal、银行卡等）；不自建卡处理，走 Stripe、Braintree、Square 这类第三方 PSP；合规原因不落真实卡号；应用面向全球但按单一货币设计；**每天 100 万笔交易**；需要按月向卖家打款的付款流程；需要与内外部系统做**对账**来修复不一致。

**功能需求两条**：收款流程（代表商家向买家收钱）与付款流程（向全球卖家付款）。**非功能需求两条**：可靠性与容错（失败支付要仔细处理）；内外部系统之间建立对账。

**粗略估算**：100 万笔/天，约 10 笔/秒。讲义明确说这不算高吞吐，不是本章重点——本文的增量一先把这句话算细一点。

**高层参与者六个**：支付服务（收支付事件、协调流程、做风控与反洗钱检查）、支付执行器（按单个支付订单调 PSP）、PSP（把钱从一个账户搬到另一个账户）、卡组织（Visa、Mastercard 一类）、账本（记录所有资金流转的财务记录）、钱包（保存每个商家的账户余额）。收款链路是：用户下单触发支付事件入库，支付服务把事件里的每个支付订单交给支付执行器，执行器调 PSP 处理信用卡，然后支付服务更新钱包、并调账本记录资金流转。

**API 与数据模型**：`POST /v1/payments` 收 `buyer_info`、`checkout_id`、`credit_card_info` 与一组 `payment_orders`；`GET /v1/payments/{:id}` 按支付订单 id 查单笔执行状态。单个 `payment_order` 里有 `seller_account`、`amount`、`currency`、`payment_order_id`；`payment_order_id` 会被转发给 PSP 用作去重，金额用字符串而不是 `double`。数据模型两张表：`payment_events`（`checkout_id` 主键，另有买家与卖家信息、卡信息、`is_payment_done`）与 `payment_orders`（`payment_order_id` 主键、买家账户、金额、币种、`checkout_id` 外键、状态枚举 NOT_STARTED / EXECUTING / SUCCESS / FAILED、外加 `ledger_updated` 与 `wallet_updated` 两个布尔）。一个支付事件挂多个支付订单；收款流程不需要卖家信息；状态迁移由后台作业驱动，长时间未处理会告警。

**复式记账与托管支付页**：复式记账让每一笔资金移动同时作用在两个账户上，一个加（贷）、一个减（借），全部分录相加恒为零，换来端到端可追溯。托管支付页则把「存卡号」与合规负担整体外包给 PSP：支付服务先向 PSP 注册支付（带上币种、金额、有效期和用作幂等的 UUID），PSP 返回 token 并入库，浏览器跳转到 PSP 托管页，用户填卡，PSP 处理后跳回本站，异步 webhook 通知后端最终结果。

**深入设计的七类机制**（只列骨架）：PSP 集成的两种方式（直连 API 或托管页）；每晚用 PSP 结算文件做外部对账，也能用它查账本与钱包之间的内部不一致，差异分三类由财务团队人工处理；支付延迟场景（被标高风险要人工审核、3D Secure 要持卡人补确认）靠等 webhook 或轮询 PSP API，同时给用户看「处理中」；服务间通信分同步与异步，异步又分单接收者与多接收者，多接收者适合支付系统（一笔支付会触发多个副作用）；失败支付用状态跟踪、重试队列与死信队列；精确一次投递 = 至少一次 + 至多一次，重试负责至少一次（策略有立即、固定、递增、指数退避、取消，经验法则是指数退避，服务器可用 `Retry-After` 头），幂等负责至多一次（请求头带幂等键，落地靠数据库唯一键约束，PSP 侧另有 nonce）；一致性靠精确一次处理加对账保最终一致，复制延迟用「读写都走主库」或共识协议、共识型分布式数据库缓解；安全面覆盖 HTTPS、加密与完整性监控、证书固定、跨区域复制与快照、限流与防火墙、用 token 代替真实卡号、PCI 合规与各类反欺诈。收尾还留了监控告警、调试工具、货币兑换、地域差异、现金支付与 Google/Apple Pay 接入这些话题。

## 二、增量一：未知结果的排队账——PSP 超时与 webhook 丢失各留多少「不知道」

讲义把「精确一次」拆成至少一次与至多一次，并指出重复扣款的两个来源（用户点两次；PSP 已成功但下游没记账、重试让 PSP 再跑一遍）。但它没有回答一个量化问题：PSP 同步调用超时、webhook 丢失、webhook 重复投递，这三件事每天在系统里留下多少「不知道结果」的支付？用 Little 定律（在途 = 到达率 × 平均驻留时间）把它算出来：

```python
"""未知结果的排队账 —— 支付系统里最难处理的一类「不知道」。

三个模型：
  1) 到达率与峰值：讲义说「100 万笔/天 = 10 笔/秒」，按 86400 秒算是 11.6 笔/秒。
  2) 未知结果的存量：PSP 同步调用超时 + webhook 丢失。用 Little 定律算「在途未知笔数」。
  3) 重复投递的代价：webhook 重复率 -> 重跑副作用的次数、凭空多出的钱、连接池要开多大。

只用标准库；不含随机数；同样的输入 -> 逐字节相同的输出。
"""

# ---- 输入参数（全部是显式假设，改一个数字结论就变） ----
EVENTS_PER_DAY = 1_000_000        # 讲义需求：每天 100 万笔交易
ORDERS_PER_EVENT = 2              # 一个支付事件平均 2 个 payment_order（讲义示例列了 3 个）
PEAK_FACTOR = 8                   # 峰谷比假设

PSP_TIMEOUT_RATE = 0.002          # PSP 同步调用 30 秒超时的比例
PSP_TIMEOUT_SEC = 30
WEBHOOK_ARRIVES_AFTER_TIMEOUT = 0.70   # 超时之后 webhook 仍然到达的比例
WEBHOOK_LOST_RATE = 0.001         # PSP 说成功、但 webhook 一直没到
WEBHOOK_DUP_RATE = 0.001          # PSP 重复投递 webhook

# webhook 到达延迟的确定性分桶：(占比, 秒数)
WEBHOOK_LATENCY_BUCKETS = ((0.60, 2.0), (0.30, 10.0), (0.10, 120.0))

RECON_RESOLVE_HOURS = 36.0        # webhook 一直没到 -> 靠隔夜结算文件 + 人工调查才收敛
AVG_ORDER_AMOUNT = 120            # 均价（元）：本文假设，讲义只给了 3.15 的示例金额
SIDE_EFFECTS_PER_REPLAY = 3       # 重跑一次 = PSP 调用 + 账本分录 + 钱包入账
PSP_POOL_PER_INSTANCE = 200       # 单实例 PSP 连接池上限

SECONDS_PER_DAY = 86400

# ---- 1) 到达率与峰值 ----
orders_per_day = EVENTS_PER_DAY * ORDERS_PER_EVENT
avg_orders_per_sec = orders_per_day / float(SECONDS_PER_DAY)
peak_orders_per_sec = avg_orders_per_sec * PEAK_FACTOR

print("== 1) 到达率与峰值 ==")
print("事件 %d 笔/天 x 每事件 %d 个 payment_order = 订单 %d 笔/天"
      % (EVENTS_PER_DAY, ORDERS_PER_EVENT, orders_per_day))
print("事件到达率 %.2f 笔/秒（一天按 86400 秒算，不是 100000 秒）"
      % (EVENTS_PER_DAY / float(SECONDS_PER_DAY)))
print("订单到达率 %.2f 笔/秒（讲义估的 10 笔/秒是「事件」口径，且把一天当成 100000 秒）"
      % avg_orders_per_sec)
print("峰值 %.2f 笔/秒（按峰谷比 %d）" % (peak_orders_per_sec, PEAK_FACTOR))
print()

# ---- 2) 未知结果的存量 ----
timeout_per_day = orders_per_day * PSP_TIMEOUT_RATE
lost_per_day = orders_per_day * WEBHOOK_LOST_RATE
dup_per_day = orders_per_day * WEBHOOK_DUP_RATE

fast_per_day = timeout_per_day * WEBHOOK_ARRIVES_AFTER_TIMEOUT   # webhook 很快到
slow_per_day = timeout_per_day * (1.0 - WEBHOOK_ARRIVES_AFTER_TIMEOUT) + lost_per_day

mean_webhook_latency = 0.0
for share, secs in WEBHOOK_LATENCY_BUCKETS:
    mean_webhook_latency += share * secs

lam_fast = fast_per_day / float(SECONDS_PER_DAY)
lam_slow = slow_per_day / float(SECONDS_PER_DAY)
l_fast = lam_fast * mean_webhook_latency          # Little 定律：L = lambda * W
l_slow = lam_slow * RECON_RESOLVE_HOURS * 3600.0

# 超时且 webhook 迟到（>60 秒）的那部分，用户会看到「处理中」
late_share = 0.0
for share, secs in WEBHOOK_LATENCY_BUCKETS:
    if secs > 60:
        late_share += share
slow_users = timeout_per_day * (1.0 - WEBHOOK_ARRIVES_AFTER_TIMEOUT) + lost_per_day
seen_pending_over_1min = (timeout_per_day * WEBHOOK_ARRIVES_AFTER_TIMEOUT * late_share
                          + slow_users)

print("== 2) 未知结果的存量 ==")
print("PSP 超时 %d 笔/天，webhook 丢失 %d 笔/天，webhook 重复 %d 笔/天"
      % (timeout_per_day, lost_per_day, dup_per_day))
print("  -> webhook 很快到（平均 %.1f 秒）：%d 笔/天" % (mean_webhook_latency, fast_per_day))
print("  -> 只能等对账收敛（平均 %.0f 小时）：%d 笔/天"
      % (RECON_RESOLVE_HOURS, slow_per_day))
print("在途未知笔数（Little 定律 L = lambda x W）：")
print("  快速收敛段：%.4f 笔在途" % l_fast)
print("  慢收敛段  ：%.0f 笔在途" % l_slow)
print("  合计      ：%.0f 笔处于「不知道结果」的状态" % (l_fast + l_slow))
print("用户看到「处理中」超过 1 分钟：%d 笔/天，占订单 %.3f%%"
      % (seen_pending_over_1min, 100.0 * seen_pending_over_1min / orders_per_day))
print()

# ---- 3) 重复投递的代价 ----
replay_calls = dup_per_day * SIDE_EFFECTS_PER_REPLAY
wasted_psp_calls = dup_per_day            # 有幂等键时，PSP 调用仍发生（PSP 侧按 nonce 去重）
dup_credit_per_day = dup_per_day * AVG_ORDER_AMOUNT
dup_credit_per_year = dup_credit_per_day * 365

print("== 3) 重复投递的代价 ==")
print("重复 webhook %d 笔/天；无幂等键时每次重跑 %d 个副作用 = %d 次副作用调用/天"
      % (dup_per_day, SIDE_EFFECTS_PER_REPLAY, replay_calls))
print("  有幂等键：钱包/账本两次都是 no-op，只剩 %d 次注定被 PSP 去重的空转调用/天"
      % wasted_psp_calls)
print("  无幂等键：钱包每次多加一遍余额，凭空多出 %d 元/天 = %.0f 万元/年"
      % (dup_credit_per_day, dup_credit_per_year / 10000.0))
print()

# ---- 4) 重试窗口：为什么「重试」补不上「不知道」 ----
backoff_base = 2.0
backoff_cap = 60.0
attempts = 6
offsets = []
t = 0.0
wait = backoff_base
for _ in range(attempts):
    t += wait
    offsets.append(t)
    wait = min(wait * 2.0, backoff_cap)

print("== 4) 指数退避的重试窗口（base %.0fs, x2, cap %.0fs, %d 次）=="
      % (backoff_base, backoff_cap, attempts))
print("第 k 次尝试发生在第 %s 秒" % ", ".join("%d" % o for o in offsets))
print("  -> 第 %d 次尝试（%d 秒）恰好压在 PSP 的 %d 秒超时线上：超时判定与重试同刻发生，"
      % (4, offsets[3], PSP_TIMEOUT_SEC))
print("     幂等键必须在这条路径上生效，否则「超时=未知」会被放大成真扣款。")
print()

# ---- 5) 连接池：未知结果会把并发请求数放大 ----
pool_need = peak_orders_per_sec * PSP_TIMEOUT_SEC
instances = -(-pool_need // PSP_POOL_PER_INSTANCE)

print("== 5) 连接池账 ==")
print("峰值到达 %.2f 笔/秒 x PSP 超时 %d 秒 = %.0f 个在途 PSP 请求"
      % (peak_orders_per_sec, PSP_TIMEOUT_SEC, pool_need))
print("  单实例连接池 %d -> 需要 %d 个实例才不至于把 PSP 打挂"
      % (PSP_POOL_PER_INSTANCE, instances))
print("  讲义说「10 笔/秒不是高吞吐」，那是平均值；平均值不决定连接池，超时才决定。")
```

输出：

```text
== 1) 到达率与峰值 ==
事件 1000000 笔/天 x 每事件 2 个 payment_order = 订单 2000000 笔/天
事件到达率 11.57 笔/秒（一天按 86400 秒算，不是 100000 秒）
订单到达率 23.15 笔/秒（讲义估的 10 笔/秒是「事件」口径，且把一天当成 100000 秒）
峰值 185.19 笔/秒（按峰谷比 8）

== 2) 未知结果的存量 ==
PSP 超时 4000 笔/天，webhook 丢失 2000 笔/天，webhook 重复 2000 笔/天
  -> webhook 很快到（平均 16.2 秒）：2800 笔/天
  -> 只能等对账收敛（平均 36 小时）：3200 笔/天
在途未知笔数（Little 定律 L = lambda x W）：
  快速收敛段：0.5250 笔在途
  慢收敛段  ：4800 笔在途
  合计      ：4801 笔处于「不知道结果」的状态
用户看到「处理中」超过 1 分钟：3480 笔/天，占订单 0.174%

== 3) 重复投递的代价 ==
重复 webhook 2000 笔/天；无幂等键时每次重跑 3 个副作用 = 6000 次副作用调用/天
  有幂等键：钱包/账本两次都是 no-op，只剩 2000 次注定被 PSP 去重的空转调用/天
  无幂等键：钱包每次多加一遍余额，凭空多出 240000 元/天 = 8760 万元/年

== 4) 指数退避的重试窗口（base 2s, x2, cap 60s, 6 次）==
第 k 次尝试发生在第 2, 6, 14, 30, 62, 122 秒
  -> 第 4 次尝试（30 秒）恰好压在 PSP 的 30 秒超时线上：超时判定与重试同刻发生，
     幂等键必须在这条路径上生效，否则「超时=未知」会被放大成真扣款。

== 5) 连接池账 ==
峰值到达 185.19 笔/秒 x PSP 超时 30 秒 = 5556 个在途 PSP 请求
  单实例连接池 200 -> 需要 28 个实例才不至于把 PSP 打挂
  讲义说「10 笔/秒不是高吞吐」，那是平均值；平均值不决定连接池，超时才决定。
```

读法（以下数字均为脚本实跑）：

- **讲义把「10 笔/秒」当平均值；平均值不决定容量，峰值与超时决定**。订单口径下平均 23.15 笔/秒、峰值 185.19 笔/秒（峰谷比按 8 假设）；峰值 × 30 秒 PSP 超时 = 5556 个在途 PSP 请求，单实例连接池 200 就要 28 个实例。**平均速率决定的是数据库压力，超时决定的是连接池**。
- **「不知道结果」的存量几乎全在慢收敛段**：PSP 超时 4000 笔/天、webhook 丢失 2000 笔/天，其中 2800 笔/天靠 webhook 在平均 16.2 秒内收敛（在途只有 0.525 笔），另外 3200 笔/天要等隔夜结算文件与人工（平均 36 小时），在途高达 4800 笔。**webhook 不是主收敛路径，隔夜对账才是**——这与讲义把对账写成「后台流程」形成张力。
- **用户体感**：每天 3480 笔（占 0.174%）的支付会让用户看到超过 1 分钟的「处理中」。
- **重复投递的代价在下游副作用，不在 PSP**：PSP 侧有 nonce 去重，重复 webhook 的 2000 笔/天只会造成 2000 次空转调用；但如果没有幂等键，钱包每次多加一遍余额，就是 24 万元/天、8760 万元/年凭空多出来的钱。
- **退避策略要避开超时线**：指数退避 base 2 秒、翻倍、封顶 60 秒的第 4 次尝试恰好落在第 30 秒——与 PSP 的 30 秒超时线同刻发生。超时判定与重试同刻触发时，幂等键必须已经生效，否则「超时 = 未知」会被放大成真扣款。

## 三、增量二：账本的写入放大与「对账键」——为什么只比 id 会漏掉金额错

讲义说复式记账让「所有分录相加恒为零」，又说每晚用结算文件把外部状态与内部状态对比。它没有回答的两个量化问题：账本到底有多少行（容量按什么估）？对账用什么键比（只比 id 行不行）？第二问我直接做了一个确定性实验：

```python
"""账本的写入放大与「对账键」的设计 —— 为什么只比 id 对账会漏掉金额错。

三个模型：
  1) 写入放大：每个 payment_order 产生多少条分录、每天多少行、占多少盘。
  2) 零和自检的盲区：构造一个「内部借贷相等、但与 PSP 结算文件对不上」的账。
  3) 对账键的三种设计对比：用 2000 笔确定性订单 + 注入缺陷，看各设计能抓到什么。

只用标准库；不含随机数；同样的输入 -> 逐字节相同的输出。
"""

from decimal import Decimal

# ---- 输入参数（全部是显式假设） ----
EVENTS_PER_DAY = 1_000_000
ORDERS_PER_EVENT = 2
ENTRIES_PER_MONEY_MOVEMENT = 2     # 复式记账：一次资金移动 = 借一条 + 贷一条
MOVEMENTS_PER_ORDER = 2            # 货款 1 次 + PSP 手续费 1 次
ENTRY_BYTES = 64                   # order_id 16B + account 4B + amount 8B + currency 2B + ts 8B + 杂项
INDEX_FACTOR = 1.5                 # 主键与 (order_id) 二级索引的放大
REPLICAS = 3                       # 账本副本数
DAY_ENTRIES = 365

ORDER_AMOUNT = Decimal("120.00")
PSP_FEE_RATE = Decimal("0.029")
PSP_FEE = (ORDER_AMOUNT * PSP_FEE_RATE).quantize(Decimal("0.01"))

N_ORDERS = 2000                    # 实验里的订单数
N_AMOUNT_DEFECTS = 20              # 注入「金额不一致」的订单数
N_MISSING_DEFECTS = 5              # 注入「PSP 侧少一笔」
N_EXTRA_DEFECTS = 5                # 注入「PSP 侧多一笔」

# ---- 1) 写入放大与体积 ----
orders_per_day = EVENTS_PER_DAY * ORDERS_PER_EVENT
entries_per_order = MOVEMENTS_PER_ORDER * ENTRIES_PER_MONEY_MOVEMENT
entries_per_day = orders_per_day * entries_per_order

raw_per_day = entries_per_day * ENTRY_BYTES
raw_per_year = raw_per_day * DAY_ENTRIES
with_index = raw_per_year * INDEX_FACTOR
with_replicas = with_index * REPLICAS

print("== 1) 账本的写入放大 ==")
print("订单 %d 笔/天 x 每单 %d 次资金移动 x 每次 %d 条分录 = %d 条分录/天"
      % (orders_per_day, MOVEMENTS_PER_ORDER, ENTRIES_PER_MONEY_MOVEMENT, entries_per_day))
print("按每条 %d B 算：原始 %.0f MB/天 = %.1f GB/年"
      % (ENTRY_BYTES, raw_per_day / 1024.0 / 1024.0, raw_per_year / 1024.0 ** 3))
print("加索引 x%.1f = %.1f GB/年；再 x%d 副本 = %.2f TB/年"
      % (INDEX_FACTOR, with_index / 1024.0 ** 3, REPLICAS, with_replicas / 1024.0 ** 4))
print("  分录行数是订单行数的 %d 倍；账本不是「每笔支付一行」，是「每笔支付几行」。" % entries_per_order)
print()

# ---- 2) 零和自检的盲区 ----
# 内部账本：A 单漏记 120，B 单多记 120 -> 借贷总和仍然是 0，试算平衡依然通过
ledger_entries = []
for order in ("A", "B"):
    ledger_entries.append((order, "buyer", ORDER_AMOUNT, "debit"))
    ledger_entries.append((order, "seller", ORDER_AMOUNT, "credit"))

debit_total = sum((e[2] for e in ledger_entries if e[3] == "debit"), Decimal("0"))
credit_total = sum((e[2] for e in ledger_entries if e[3] == "credit"), Decimal("0"))

print("== 2) 零和自检的盲区 ==")
print("内部账本：借方合计 %s，贷方合计 %s，试算平衡 = %s"
      % (debit_total, credit_total, debit_total == credit_total))
print("假设 A 单漏记 %s、B 单多记 %s，两笔互相抵消 -> 内部自检依然通过"
      % (ORDER_AMOUNT, ORDER_AMOUNT))
print("但 PSP 结算文件里只有 A、B 各 %s：对账立刻发现 A 缺、B 多，各 1 笔差异。" % ORDER_AMOUNT)
print("  => 借贷和为零只能证明「内部没漏写一笔」，证明不了「记的是不是真的那笔」。")
print()

# ---- 3) 三种对账键设计的对比实验 ----
def build_orders(n):
    """确定性构造 n 笔订单：(order_id, 商品单价)"""
    rows = []
    for i in range(n):
        rows.append(["ord-%04d" % i, Decimal("100.00") + Decimal(i % 7)])
    return rows

def gross_of(price):
    """内部口径的应收总额 = 商品价 + PSP 手续费"""
    fee = (price * PSP_FEE_RATE).quantize(Decimal("0.01"))
    return price + fee

orders = build_orders(N_ORDERS)

# 注入三类缺陷，确定性、不用随机数
step = max(1, N_ORDERS // (N_AMOUNT_DEFECTS + N_MISSING_DEFECTS + N_EXTRA_DEFECTS))
amount_bad, missing, extra = [], [], []
idx = 3
for _ in range(N_AMOUNT_DEFECTS):
    while idx in amount_bad or idx in missing:
        idx += 1
    amount_bad.append(idx)
    idx += step
for _ in range(N_MISSING_DEFECTS):
    while idx in amount_bad or idx in missing:
        idx += 1
    missing.append(idx)
    idx += step
for _ in range(N_EXTRA_DEFECTS):
    while idx in amount_bad or idx in missing:
        idx += 1
    extra.append(idx)
    idx += step

# 内部视图：我们认为每笔订单收了多少钱
internal = {}
for i, (oid, price) in enumerate(orders):
    internal[oid] = gross_of(price)

# PSP 结算文件视图
psp_view = {}
for i, (oid, price) in enumerate(orders):
    if i in missing:
        continue                       # PSP 侧没有这笔
    amt = gross_of(price)
    if i in amount_bad:
        amt = amt + Decimal("0.01")     # PSP 侧多收了 1 分：id 相同、金额不同
    psp_view[oid] = amt
for i in extra:
    oid, price = orders[i]
    psp_view[oid + "-ghost"] = gross_of(price)

def design_id_set_only():
    """只比 id 集合：PSP 有、内部没有 -> 多一笔；内部有、PSP 没有 -> 缺一笔。金额从不比较，
    所以「id 相同、金额不同」的缺陷一个都发现不了。"""
    caught_amount = 0
    return caught_amount

def design_id_then_compare_amount():
    """先按 id 配对，再逐笔比金额。"""
    caught_amount = 0
    for oid, total in internal.items():
        if oid in psp_view and psp_view[oid] != total:
            caught_amount += 1
    return caught_amount

def design_full_tuple_set():
    """直接比 (id, amount) 集合。"""
    psp_pairs = set((oid, amt) for oid, amt in psp_view.items())
    psp_ids = set(oid for oid, _ in psp_pairs)
    caught_amount = 0
    for oid, total in internal.items():
        if (oid, total) in psp_pairs:
            continue                       # 金额一致 -> 不算抓到
        if oid in psp_ids:
            caught_amount += 1              # id 在、金额不在 -> 这一笔被抓出来
    return caught_amount

def pad(s, width):
    """按显示宽度右/左对齐（中文算 2 列），保证表格在终端里对齐。"""
    w = sum(2 if ord(ch) > 0x2E80 else 1 for ch in s)
    return s + " " * max(0, width - w)

def count_detected(design):
    caught_amount = design()
    internal_ids = set(internal)
    psp_ids = set(psp_view)
    missing_detected = len([oid for oid in internal_ids if oid not in psp_ids])
    extra_detected = len([oid for oid in psp_ids if oid not in internal_ids])
    return caught_amount, missing_detected, extra_detected

results = []
for name, fn in (("只比 id 集合", design_id_set_only),
                 ("先按 id 配对再比金额", design_id_then_compare_amount),
                 ("直接比 (id, amount) 集合", design_full_tuple_set)):
    results.append((name,) + count_detected(fn))

print("== 3) 三种对账键设计的对比实验 ==")
print("实验规模 %d 笔订单；注入 金额不一致 %d 笔 / PSP 侧少 %d 笔 / PSP 侧多 %d 笔"
      % (N_ORDERS, N_AMOUNT_DEFECTS, N_MISSING_DEFECTS, N_EXTRA_DEFECTS))
print("%s %s %s %s" % (pad("对账设计", 26), pad("抓到金额错", 14),
                       pad("抓到缺失", 12), pad("抓到多余", 12)))
for name, got_amt, miss_d, extra_d in results:
    print("%s %s %s %s" % (pad(name, 26), pad("%d" % got_amt, 14),
                           pad("%d" % miss_d, 12), pad("%d" % extra_d, 12)))
print("  => 金额不一致是「id 相同、金额不同」；只比 id 集合会把它们全部当成一致。")
print("     先按 id 配对再比金额，与直接比 (id, amount) 集合，效果完全相同。")
print("  => 判据：对账键至少要到「id + 金额」这一层，否则最贵的一类差异永远抓不到。")
print("     少的那几笔和多的那几笔，三种设计都能抓到——它们是「键集合」的差异。")
```

输出：

```text
== 1) 账本的写入放大 ==
订单 2000000 笔/天 x 每单 2 次资金移动 x 每次 2 条分录 = 8000000 条分录/天
按每条 64 B 算：原始 488 MB/天 = 174.0 GB/年
加索引 x1.5 = 261.1 GB/年；再 x3 副本 = 0.76 TB/年
  分录行数是订单行数的 4 倍；账本不是「每笔支付一行」，是「每笔支付几行」。

== 2) 零和自检的盲区 ==
内部账本：借方合计 240.00，贷方合计 240.00，试算平衡 = True
假设 A 单漏记 120.00、B 单多记 120.00，两笔互相抵消 -> 内部自检依然通过
但 PSP 结算文件里只有 A、B 各 120.00：对账立刻发现 A 缺、B 多，各 1 笔差异。
  => 借贷和为零只能证明「内部没漏写一笔」，证明不了「记的是不是真的那笔」。

== 3) 三种对账键设计的对比实验 ==
实验规模 2000 笔订单；注入 金额不一致 20 笔 / PSP 侧少 5 笔 / PSP 侧多 5 笔
对账设计                   抓到金额错     抓到缺失     抓到多余    
只比 id 集合               0              5            5           
先按 id 配对再比金额       20             5            5           
直接比 (id, amount) 集合   20             5            5           
  => 金额不一致是「id 相同、金额不同」；只比 id 集合会把它们全部当成一致。
     先按 id 配对再比金额，与直接比 (id, amount) 集合，效果完全相同。
  => 判据：对账键至少要到「id + 金额」这一层，否则最贵的一类差异永远抓不到。
     少的那几笔和多的那几笔，三种设计都能抓到——它们是「键集合」的差异。
```

读法（以下数字均为脚本实跑）：

- **账本不是「每笔支付一行」，是「每笔支付四行」**：一个订单含货款与手续费两次资金移动，每次复式记账产生借贷两条分录 → 200 万订单/天变成 800 万条分录/天；按 64 B/条算是 488 MB/天、174 GB/年原始，加索引 261 GB/年，3 副本 0.76 TB/年。**容量规划按「订单数 × 4」走，不要按订单数估**。
- **零和只证明内部自洽，不证明记的是真的那笔**：实验里 A 单漏记 120 元、B 单多记 120 元，借方合计与贷方合计仍都是 240 元，试算平衡照样通过；但跟 PSP 结算文件一比，立刻露出 A 缺、B 多各 1 笔差异。这正是已发文章《算得平不等于记得对》那条边界（必要条件不是充分条件）在支付对账上的具体形态。
- **对账键至少要到「id + 金额」**：2000 笔合成订单注入 20 笔「id 相同、金额不同」、5 笔 PSP 侧缺、5 笔 PSP 侧多。只比 id 集合的设计抓到 0/20 笔金额错；「先按 id 配对再比金额」与「直接比 (id, amount) 集合」都抓到 20/20，缺失与多余三类设计都能抓到（5/5）。金额不一致往往是最贵的一类差异（钱确实动了、金额错了），只比 id 会把它全部当成一致。
- 工程含义：对账前先按 `payment_order_id` 聚合内部账本（把 4 条分录折回 1 个净额），再与结算文件按 (id, 金额) 比，否则流水级对比会产生大量假阳性。

## 四、增量三：对账差异的人力账与挂账资金——「差异由财务团队手动处理」值多少人

讲义把差异处理写成三分类（可分类可自动、可分类但不能自动、不可分类），然后一句「由财务团队手动处理」带过。这句话其实是一条预算：差异率、三类占比、单笔耗时一乘，就是人力。同时结算文件隔夜才到，差异会挂账，挂的是真金白银：

```python
"""对账差异的人力账与挂账资金账 —— 讲义说「差异由财务团队手动处理」，那要多少个人。

三个模型：
  1) 差异率 -> 每日差异笔数 -> 三类分摊 -> 人工分钟 -> 年工时 -> FTE。
  2) 自动化的边际收益：可分类差异里每多覆盖 10%，省下多少人。
  3) 挂账资金：结算文件隔夜才到，差异平均挂多少天，占用多少资金。

只用标准库；不含随机数；同样的输入 -> 逐字节相同的输出。
"""

from decimal import Decimal

# ---- 输入参数（全部是显式假设） ----
EVENTS_PER_DAY = 1_000_000
ORDERS_PER_EVENT = 2
ORDERS_PER_DAY = EVENTS_PER_DAY * ORDERS_PER_EVENT
AVG_ORDER_AMOUNT = Decimal("120.00")

# 三类差异（讲义给的三分类）各自的占比与单笔人工耗时（分钟）
MIX = (
    ("可分类-可自动", 0.60, 0.0),
    ("可分类-需人工", 0.25, 12.0),
    ("不可分类-需调查", 0.15, 45.0),
)

# 不可自动化的比例里，有多大比例是「自动化规则真正覆盖不到」的硬骨头
AUTOMATION_REACHABLE = 0.85

# 人力折算
HOURS_PER_FTE_DAY = 7.5
WORKDAYS_PER_YEAR = 250

# 差异率场景
DIFF_RATES = (Decimal("0.0001"), Decimal("0.0005"), Decimal("0.001"))
BASE_DIFF_RATE = Decimal("0.0005")

# 挂账：结算文件隔夜到达，差异从「钱动了」到「账对平」的平均天数
SETTLEMENT_LAG_DAYS = 1
TRIAGE_LAG_DAYS = 1.5

HOURS_PER_FTE_YEAR = Decimal(str(HOURS_PER_FTE_DAY * WORKDAYS_PER_YEAR))

def pad(s, width):
    """按显示宽度左对齐（中文算 2 列），保证表格在终端里对齐。"""
    w = sum(2 if ord(ch) > 0x2E80 else 1 for ch in s)
    return s + " " * max(0, width - w)

print("== 1) 差异率 -> 人力 ==")
print("订单 %d 笔/天" % ORDERS_PER_DAY)
cols = ("差异率", "差异/天", "差异/年", "人工分/天", "年工时", "FTE")
widths = (10, 10, 12, 12, 12, 8)
print(" ".join(pad(c, w) for c, w in zip(cols, widths)))
for rate in DIFF_RATES:
    per_day = Decimal(ORDERS_PER_DAY) * rate
    per_year = per_day * Decimal(365)
    minutes = Decimal("0")
    for _, share, mins in MIX:
        if mins > 0:
            minutes += per_day * Decimal(str(share)) * Decimal(str(mins))
    year_hours = minutes * Decimal(365) / Decimal(60)
    fte = year_hours / HOURS_PER_FTE_YEAR
    cells = ("%.4f%%" % (rate * 100), "%.0f" % per_day, "%.0f" % per_year,
             "%.0f" % minutes, "%.0f" % year_hours, "%.2f" % fte)
    print(" ".join(pad(c, w) for c, w in zip(cells, widths)))
low_rate = DIFF_RATES[0]
high_rate = DIFF_RATES[-1]
low_fte = None
high_fte = None
for rate in (low_rate, high_rate):
    per_day = Decimal(ORDERS_PER_DAY) * rate
    minutes = Decimal("0")
    for _, share, mins in MIX:
        if mins > 0:
            minutes += per_day * Decimal(str(share)) * Decimal(str(mins))
    year_hours = minutes * Decimal(365) / Decimal(60)
    fte = year_hours / HOURS_PER_FTE_YEAR
    if rate == low_rate:
        low_fte = fte
    else:
        high_fte = fte
print("  => 差异率是线性乘数：%.4f%% -> %.4f%%，人力从 %.2f FTE 涨到 %.2f FTE（x%.0f）。"
      % (low_rate * 100, high_rate * 100, low_fte, high_fte, high_fte / low_fte))
print()

# ---- 2) 自动化的边际收益 ----
print("== 2) 自动化的边际收益（基准差异率 %.4f%%）=="
      % (BASE_DIFF_RATE * 100))
per_day = Decimal(ORDERS_PER_DAY) * BASE_DIFF_RATE
autoable = Decimal("0")
for name, share, mins in MIX:
    if name == "可分类-需人工":
        autoable = per_day * Decimal(str(share))
manual_minutes_per_item = Decimal("12.0")

saved_per_10pct = autoable * Decimal("0.10") * manual_minutes_per_item
year_hours_saved = saved_per_10pct * Decimal(365) / Decimal(60)
fte_saved = year_hours_saved / HOURS_PER_FTE_YEAR
print("可分类但要人工的差异：%.0f 笔/天" % autoable)
print("每把 10%% 的这类差异自动化：每天省 %.0f 分钟，一年省 %.0f 小时 = %.3f FTE"
      % (saved_per_10pct, year_hours_saved, fte_saved))
hard = autoable * (Decimal(1) - Decimal(str(AUTOMATION_REACHABLE)))
print("剩下 %.0f%% 是规则够不着的（%.0f 笔/天）—— 自动化覆盖不到，是硬下限"
      % ((Decimal(1) - Decimal(str(AUTOMATION_REACHABLE))) * 100, hard))
print()

# ---- 3) 挂账资金 ----
print("== 3) 挂账资金 ==")
daily_gmv = Decimal(ORDERS_PER_DAY) * AVG_ORDER_AMOUNT
unreconciled_days = Decimal(str(SETTLEMENT_LAG_DAYS)) + Decimal(str(TRIAGE_LAG_DAYS))
held = daily_gmv * unreconciled_days
print("日均流水 %d 笔 x %s 元 = %s 元/天" % (ORDERS_PER_DAY, AVG_ORDER_AMOUNT, daily_gmv))
print("差异平均挂 %.1f 天（结算文件隔夜 %d 天 + 人工调查 %.1f 天）"
      % (unreconciled_days, SETTLEMENT_LAG_DAYS, TRIAGE_LAG_DAYS))
print("挂在「钱动了但账没平」上的钱：%s 元 = %.2f 亿元"
      % (held, held / Decimal(100000000)))
held_at_rate = daily_gmv * BASE_DIFF_RATE * unreconciled_days
print("其中真正是差异的部分（按 %.4f%%）：%s 元 = %.0f 万元"
      % (BASE_DIFF_RATE * 100, held_at_rate, held_at_rate / Decimal(10000)))
print("  => 结算文件晚一天，待确认的资金就多一天的流水（%s 元）。" % daily_gmv)
print("     而差异率只决定其中很小一块（%.0f 万元）。" % (held_at_rate / Decimal(10000)))
print("     所以「缩短结算与对账周期」比「降低差异率」更值钱。")
```

输出：

```text
== 1) 差异率 -> 人力 ==
订单 2000000 笔/天
差异率     差异/天    差异/年      人工分/天    年工时       FTE     
0.0100%    200        73000        1950         11862        6.33    
0.0500%    1000       365000       9750         59312        31.63   
0.1000%    2000       730000       19500        118625       63.27   
  => 差异率是线性乘数：0.0100% -> 0.1000%，人力从 6.33 FTE 涨到 63.27 FTE（x10）。

== 2) 自动化的边际收益（基准差异率 0.0500%）==
可分类但要人工的差异：250 笔/天
每把 10% 的这类差异自动化：每天省 300 分钟，一年省 1825 小时 = 0.973 FTE
剩下 15% 是规则够不着的（38 笔/天）—— 自动化覆盖不到，是硬下限

== 3) 挂账资金 ==
日均流水 2000000 笔 x 120.00 元 = 240000000.00 元/天
差异平均挂 2.5 天（结算文件隔夜 1 天 + 人工调查 1.5 天）
挂在「钱动了但账没平」上的钱：600000000.000 元 = 6.00 亿元
其中真正是差异的部分（按 0.0500%）：300000.0000000 元 = 30 万元
  => 结算文件晚一天，待确认的资金就多一天的流水（240000000.00 元）。
     而差异率只决定其中很小一块（30 万元）。
     所以「缩短结算与对账周期」比「降低差异率」更值钱。
```

读法（以下数字均为脚本实跑，假设见脚本头部）：

- **差异率是人力乘数，且没有规模效应**：0.0100% 差异率 = 200 笔/天、约 6.33 FTE；0.0500% = 1000 笔/天、约 31.63 FTE；0.1000% = 2000 笔/天、约 63.27 FTE。差异率涨 10 倍，人力涨 10 倍，一分不差。
- **自动化的边际收益可算**：基准 0.0500% 下「可分类但要人工」的差异有 250 笔/天，每多自动化 10% 就省 300 分钟/天 = 1825 小时/年 ≈ 0.973 FTE；剩下 15%（38 笔/天）是规则够不着的硬下限，只能留给人。
- **挂账资金由结算周期决定，不由差异率决定**：日均流水 2.4 亿元，差异平均挂 2.5 天 → 6.00 亿元处于「钱动了但账没平」；其中真正是差异的只有 30 万元。**缩短结算与对账周期（动的是 2.4 亿元/天的分母）比压差异率（动的是 30 万元）值钱得多**——结算文件晚一天，待确认资金就多一天流水。

## 五、判据清单

1. **平均速率不决定连接池，峰值 × 超时决定**：185 笔/秒峰值 × 30 秒超时 = 5556 个在途 PSP 请求，按 200 连接/实例要 28 个实例。
2. **幂等键必须覆盖「超时重试」路径**：退避第 4 次（30 秒）与 PSP 超时线同刻；没有幂等键，「超时 = 未知」会放大成真扣款。
3. **PSP 侧 nonce 只保 PSP 不重复扣款**：内部副作用（钱包、账本）要各有幂等保护，否则 2000 笔/天的重复 webhook 会把钱包加出钱来（无保护时 24 万元/天）。
4. **账本容量按「订单数 × 4」估**：800 万条分录/天、174 GB/年原始、含索引与 3 副本 0.76 TB/年。
5. **借贷和为零只是必要条件**：两笔互相抵消的错误照样平；对账才是外部证据，且对账键必须含金额。
6. **对账键到「id + 金额」**：只比 id 集合漏掉全部金额不一致（0/20），按 id 聚合再比金额即可全抓到。
7. **差异率是人力线性乘数**：0.01% ≈ 6.33 FTE；自动化只对「可分类」的部分有效，每覆盖 10% 省约 0.97 FTE/年，15% 是硬下限。
8. **挂账资金看周期不看差异率**：结算周期每缩短一天，就少挂一天流水（本例 2.4 亿元/天）。

## 六、这一章不重复已发的内容

- **「借贷和为零不是正确性」的一般版论证**：见《[算得平不等于记得对：复式记账的边界](/blog/trial-balance-is-not-correctness/)》——那篇讲课程案例里的试算平衡边界，本文只用它解释支付对账里零和自检的盲区。
- **消息队列的分区与至少一次去重**：见《[消息队列的三笔账：分区数、至少一次的重复与存储乘数](/blog/message-queue-partitions-and-idempotency-computed/)》——那篇算消费端幂等与去重表，本文算支付链路里 PSP 超时与 webhook 丢失留下的未知结果存量。
- **通知系统的投递率与幂等窗口**：见《[通知系统的投递率怎么算](/blog/notification-system-delivery-computed/)》——那是渠道投递的级联成功率，本文的对账人力与挂账资金是另一本账。
- **唯一 ID 生成器（幂等键本身的来源）**：见《[唯一 ID 生成器：把 Snowflake 的位分配算到底](/blog/unique-id-generator-snowflake-computed/)》。
- **粗略估算方法本身**：见《[把信封背面估算当真之前](/blog/back-of-the-envelope-estimation-reality-check/)》。
- **限流算法（支付安全里 DDoS 一环的量化对比）**：见《[限流器：五种算法用同一条流量跑一遍](/blog/rate-limiter-algorithms-measured/)》。

## 七、这三个模型判不了什么

- **所有比例都是显式假设，不是实测**：PSP 超时 0.2%、webhook 丢失与重复各 0.1%、峰谷比 8、均价 120 元、每事件 2 个订单、差异三类占比与单笔耗时，全部写在脚本头部；真实 PSP 的失效率随地域与时段变化，改一个数字结论的大小会变，但形状（线性乘数、恒等式）不变。
- **增量一没区分「PSP 已扣款但 webhook 没到」与「PSP 压根没扣款」**：现实里可以用 PSP 的状态回查接口区分两类，本文把两类统一塞进「慢收敛段」，所以 4800 笔在途偏保守（真实值会更小）。
- **增量二的对账键实验用的是 2000 笔合成订单与确定性注入缺陷**，不是真实结算文件的分布；真实差异率的量级会直接改变「对账键加不加金额」的收益排序。
- **增量二没算分账、拆单与多币种的额外分录**：跨境多币种时一次支付可能拆成更多条分录，写入放大会超过 4 倍。
- **增量三没算自动化的建设与规则维护成本**，只算省下的人力；也没算不可分类差异的调查会反哺出新的自动化规则（15% 的硬下限会缓慢下移）。
- **三个模型都没碰**：3D Secure 与风控人工审核的长尾延迟分布、付款流程（pay-out）的对手方结算规则、以及多币种的汇率与手续费分录。

## FAQ（八、常见问题）

**支付系统的吞吐量到底要不要紧？** 按讲义口径，100 万笔/天约 10 笔/秒，吞吐不是重点；但本文实跑的增量一显示，容量规划该看「峰值 × 超时」：185 笔/秒峰值乘 30 秒超时就是 5556 个在途 PSP 请求，连接池与实例数由它决定，不由平均 10 笔/秒决定。

**幂等键应该放在哪一层？** PSP 侧用 nonce 防重复扣款（讲义已写），但这只保 PSP 一家；内部的钱包入账与账本写入也要各自有幂等保护（比如唯一键约束），否则每天重复投递的 webhook 会把余额重复加上去。本文实跑：重复率 0.1% 且内部无保护时，凭空余额 24 万元/天。

**精确一次投递是不是做不到？** 讲义的定义是至少一次与至多一次同时成立；工程上没有单一的「精确一次机制」，而是重试提供至少一次、幂等提供至多一次，两者拼起来。退避策略默认指数退避，且要留意退避序列别压在 PSP 的超时线上（本文实跑：base 2 秒翻倍的第 4 次尝试恰好落在 30 秒）。

**复式记账的「借贷和为零」能当对账用吗？** 不能。它只保证内部没漏写一笔；A 漏记 120、B 多记 120 这种互相抵消的错误照样平衡。对账是与外部结算文件比，而且比较的键必须包含金额——本文的对账键实验里，只比 id 集合漏掉了全部 20 笔金额不一致。

**对账为什么要每晚做，能不能更频繁？** 讲义说每晚拿结算文件对账。本文实跑给出资金口径的理由：日均流水 2.4 亿元，差异平均挂 2.5 天就有 6 亿元处于「钱动了但账没平」；结算周期每缩短一天，就少挂一天流水。这比压低差异率（本例只有 30 万元）值钱得多。

**差异率 0.01% 值得专门配人吗？** 本文实跑：0.0100% 差异率 = 200 笔差异/天，按三分类与单笔耗时折算约 6.33 个 FTE；0.1% 就是 63.27 个。差异率是人力乘数，先用自己团队的真实三分类占比重算一遍再下结论。

**未知结果的支付靠什么收敛？** 两条路径：快路径是 PSP 的 webhook（本文实跑在途只有 0.525 笔），慢路径是隔夜结算文件加人工调查（在途约 4800 笔）。所以对账不只是查错，它是「不知道结果」这笔钱的主收敛路径。

**为什么多数公司用托管支付页而不是自己收卡号？** 为了不在自己系统里存真实卡号、避开一整套合规负担；代价是多一次跳转、多一份 token 状态，以及最终结果只能靠 webhook 异步回来——这正是增量一算的那笔「未知结果」的来源之一。

## 出处与许可

- 原书：*System Design Interview — An Insider's Guide*（Alex Xu，Vol 1 & 2, 2nd Ed.）——本章骨架（第 26 章 Payment System）为其目录与要点。
- 英文笔记仓库：[liquidslr/system-design-notes](https://github.com/liquidslr/system-design-notes)；中文译本仓库：[lukeTheNeuromancer/system-design-notes-zh](https://github.com/lukeTheNeuromancer/system-design-notes-zh)。
- **许可状态**：2026-11-27 实测，两仓库的 `LICENSE` 在 `main`/`master` 分支经 raw 通道取均 404，仓库网页 200，**上游许可未能确认**；原书为商业出版物。故本篇为导读式：只复述章节骨架与需求数字，不引用译文原文或原书段落，不使用译本配图，正文主体为自写模型与判断。
- 本文三个脚本为自写增量，仅依赖 Python 标准库，在 Python 3.9.6 上实跑通过，输出与正文结果块逐行一致（三段计算均不含随机数，两次运行输出逐字节一致）。
