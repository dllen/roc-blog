---
title: "ChaosBlade 二次开发实践"
date: 2024-08-18T12:13:32+05:30
description: "混沌工程是一门在系统上进行实验的学科，目的是建立对系统抵御生产环境中失控条件的能力以及信心。"
tags: [混沌工程]
---

- 背景与目标
  - 在企业落地混沌工程时，往往需要定制符合自身技术栈与业务场景的故障注入能力；二次开发的目标是扩展官方场景、统一 CLI/HTTP 入口，并在平台侧形成可审计、可回滚、可观测的闭环。（参考 [0]）

- 架构认知（把握扩展点）
  - 模块拆分：`chaosblade`（CLI/HTTP 管理）、`chaosblade-spec-go`（规范定义）、`chaosblade-exec-os`/`-docker`/`-cri`/`-operator`/`-jvm`/`-cplus` 等领域场景，统一由 CLI 调用，遵循混沌实验模型。（参考 [0]）
  - 统一命令：`prepare`/`revoke`（环境准备与撤销）、`create`（创建实验）、`destroy`（销毁实验）、`status`（查询状态）。示例：`blade create [TARGET] [ACTION] [FLAGS]`；Dubbo 延迟示例：`blade create dubbo delay --consumer --time 3000 --Service xxx.xxx.Service`（参考 [0]）。

- 开发准备
  - 建议环境：`Go >= 1.20`、Linux 主机（或容器/K8s 节点）、必要的系统工具（如 `tc/iptables/stress-ng`）、可选：`JDK 8+`（JVM 场景）、`GDB`（C++ 场景）。

- 设计你的场景（Spec）
  - 明确 `Target/Action/Flags` 与约束：例如目标是 `os.network`，动作是 `delay/loss`，参数含义与合法范围（单位、最小/最大值、是否必填、默认值），以及对环境的依赖与回收策略。
  - 在 `chaosblade-spec-go` 中定义规范结构，声明校验规则与示例用法；完成后在对应 `exec-*` 项目实现执行逻辑。（参考 [0]）

- 实现与注册（以 OS 场景为例）
  - 新增 Spec：在 `chaosblade-exec-os` 中增加你的场景 Spec（如 `os network delay`），补充参数校验与帮助说明。
  - 编写 Executor：根据 Spec 解析参数，调用系统工具注入与回收（例如 `tc qdisc` 注入延时、`iptables` 配合丢包、或通过 `stress-ng` 做 CPU/内存压力）。
  - 注册到 CLI/HTTP：在 `chaosblade` 工程侧暴露新场景（帮助文本、参数说明），保证 `blade create ...` 能识别并执行。
  - 编译验证：执行 `blade create ...` 获得 `uid`；用 `blade status UID` 查看状态；用 `blade destroy UID` 回收；如涉及 JVM，需先 `blade p jvm --process <app>`，结束后 `blade revoke UID`（参考 [0]）。

- 测试与工程化
  - 覆盖正/反/异常路径：非法参数、权限不足、环境缺依赖、重复注入、异常中断后的回收。
  - 幂等与回收：确保多次执行不会污染环境；任何失败都能走到回收分支；对系统资源设定超时/重试/保护阈值。
  - 可观测性：输出清晰的 `uid`、阶段日志、关键指标（延时/丢包/CPU/内存等），便于平台观测与审计。

- 实战命令片段（示例）
  - 环境准备：`blade p jvm --process business` → 返回 `uid`；撤销：`blade revoke UID`。
  - 创建实验：`blade create os network delay --time 3000 --interface eth0`；查询：`blade status UID`；销毁：`blade destroy UID`。（命令形态与参数以你的 Spec 为准，参考 [0]）

- 常见坑与排错
  - 权限与依赖：`tc/iptables` 需 root；容器内需 CAP 能力；K8s 场景需正确的 CRD 与 Operator。
  - JVM attach 失败：进程名不匹配/无权限/目标 JDK 版本不兼容；优先用 `prepare` 返回的 `uid` 做状态跟踪（参考 [0]）。
  - 资源回收不彻底：为每一步注入动作设计对称的回收；失败时也要进入回收分支。

## Chaosblade-box 平台集成实践

- 目标与价值
  - 将自定义场景在平台侧可视化、流程化管理：支持编排、权限控制、审计与留痕、统一的执行/回收闭环，并与企业现有运维与治理体系对接。（参考 [1]）

- 编译与运行（Host/K8s）
  - 打包：`mvn clean package -Dmaven.test.skip=true`。（参考 [1]）
  - MySQL（Docker 示例，需替换密码）：
    - `docker run -d -it -p 3306:3306 \
            -e MYSQL_DATABASE=chaosblade \
            -e MYSQL_ROOT_PASSWORD=[DATASOURCE_PASSWORD] \
            --name mysql-5.6 mysql:5.6 \
            --character-set-server=utf8mb4 \
            --collation-server=utf8mb4_unicode_ci \
            --default-time_zone='+8:00' \
            --lower_case_table_names=1`
  - 启动应用（Host）：
    - `nohup java -Duser.timezone=Asia/Shanghai -jar chaosblade-box-1.0.0.jar --spring.datasource.url="jdbc:mysql://DATASOURCE_HOST:3306/chaosblade?characterEncoding=utf8&useSSL=false" --spring.datasource.username=DATASOURCE_USERNAME --spring.datasource.password=DATASOURCE_PASSWORD --chaos.server.domain=BOX-HOST > chaosblade-box.log 2>&1 &`（参考 [1]）
  - Kubernetes（Helm）：
    - `helm install chaosblade-box chaosblade-box-1.0.0.tgz --namespace chaosblade --set spring.datasource.password=DATASOURCE_PASSWORD`（参考 [1]）

- 首次数据与 Agent 参数（节选）
  - `chaos.function.sync.type`：首启可用 `ALL` 预置数据；可选值 `ALL/ChaosBlade/UserApp/None/LITMUS_CHAOS`（参考 [1]）。
  - `chaos.agent.version/chaos.agent.repository/chaos.agent.url/chaos.agent.helm`：配置 Agent 包版本与仓库地址（参考 [1]）。

- 集成你的自定义场景
  - 平台端注册函数定义：绑定 CLI/Operator 场景，维护参数表单与校验；对接执行器与状态查询。
  - K8s 场景建议通过 `chaosblade-operator` 以 CRD 标准定义与编排，复用平台与 CLI 的统一模型。（参考 [0]）

- 平台化流程建议
  - 变更审批 → 预检查（依赖、权限、风险）→ 创建实验 → 观测（日志/指标）→ 回收/销毁 → 审计归档。
  - 多租户与 RBAC、白名单/黑名单、窗口期与最小化 blast radius、SLO/SLA 保护阈值。

- 常见问题与排错
  - 数据库连接与权限：确认 `DATASOURCE_HOST/USERNAME/PASSWORD` 与字符集/时区设置；容器网络与端口暴露。
  - Agent 下载与版本：仓库地址可用自建镜像；确保与目标环境（K8s/Host）兼容；首次同步完成后再执行实验。
  - Helm values：根据集群需求调整资源配额与节点亲和；服务暴露方式与域名解析（参考 [1]）。

## 大规模演练监控与稳定性保障

- 设计原则
  - 演练前-中-后三段监控闭环：容量评估、实时指标、回收确认。
  - 指标分层：资源/平台/中间件/应用四层，设置 SLO 与熔断阈值。
  - 平台联动：在 chaosblade-box 中定义“停止条件”，当触发阈值自动终止实验并回收。

- 演练熔断与降速建议
  - 触发任一核心阈值时：自动执行 `destroy`/回收，记录 `uid` 与原因。
  - 阀值分级：预警（黄）→ 降速（橙，降低并发/扩大批次间隔）→ 熔断（红）。
  - 分批策略：分域/分租户/分环境逐步推进，控制 blast radius。
  - 观测确认：回收后持续观察 5–10 分钟，指标回归正常再进入下一批。

- 实施清单
  - 在 `chaosblade-box` 配置“停止条件”与告警；对接 Alertmanager。
  - 在实验模板/表单中暴露 Redis/MySQL/K8s 指标的阈值可配置项。
  - 对关键指标设置 Dashboard 与 Runbook，确保排错路径明确。

## 参考资料

- ChaosBlade 项目与规范
  - 官方仓库与 CLI 文档：https://github.com/chaosblade-io/chaosblade
  - 规范定义（Golang）：https://github.com/chaosblade-io/chaosblade-spec-go
  - OS 场景实现：https://github.com/chaosblade-io/chaosblade-exec-os
  - Docker 场景实现：https://github.com/chaosblade-io/chaosblade-exec-docker
  - CRI 场景实现：https://github.com/chaosblade-io/chaosblade-exec-cri
  - JVM 场景实现：https://github.com/chaosblade-io/chaosblade-exec-jvm
  - C++ 场景实现：https://github.com/chaosblade-io/chaosblade-exec-cplus
  - Kubernetes Operator（CRD）：https://github.com/chaosblade-io/chaosblade-operator

- Chaosblade-box 平台
  - 平台仓库与部署说明：https://github.com/chaosblade-io/chaosblade-box

- 监控与告警（Prometheus 生态）
  - PromQL 基础与语法：https://prometheus.io/docs/prometheus/latest/querying/basics/
  - Alertmanager 文档：https://prometheus.io/docs/alerting/latest/alertmanager/
  - Redis Exporter（指标项）：https://github.com/oliver006/redis_exporter
  - MySQLd Exporter（指标项）：https://github.com/prometheus/mysqld_exporter
  - Node Exporter（节点指标）：https://github.com/prometheus/node_exporter
  - kube-state-metrics（K8s 对象指标）：https://github.com/kubernetes/kube-state-metrics

- 社区文章
  - https://zhuanlan.zhihu.com/p/598323365
  - https://mp.weixin.qq.com/s?__biz=Mzg3MzgxMjc3NA==&mid=2247484031&idx=1&sn=4bfc81c1ee268dc0c8d529a4b5fc9949
  - [混沌工程之 ChaosBlade 利刃出鞘 - 掘金](https://juejin.cn/post/7266092256372998196)
  - [ChaosBlade Tool 故障注入百宝箱 - 掘金](https://juejin.cn/post/7267919801779470397)
