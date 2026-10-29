---
title: "Impeccable：给 AI 编码助手装上设计品味"
date: 2026-10-27
update_date: 2026-10-27
description: "90k stars 的开源项目，用一个 Skill + 24 条命令 + 62 条确定性检测规则 + 浏览器内变体迭代，专治 AI 生成界面的「AI 味」。讲清它怎么用、62 条规则抓什么、以及哪几条局限必须提前知道。"
tldr: "「AI 味」不是模型的审美问题，而是「缺少可执行约束」+「缺少可验证反馈」——Impeccable 的做法是软约束写进 Skill、硬验证跑成确定性规则，再把结果通过钩子甩回 agent 循环。"
keywords: ["Impeccable", "AI slop", "AI 生成界面", "前端设计规范", "Claude 设计 skill", "设计检测规则"]
taxonomies:
  tags: ["AI编码", "前端", "设计系统", "开源项目"]
---

# Impeccable：给 AI 编码助手装上设计品味

用 AI 生成前端的人都有同一段经历：页面能用，但一眼就是 AI 做的——Inter 字体一把梭、紫到蓝的渐变、卡片套卡片、彩色底上放灰字、每个标题上方顶一个圆角方块图标。

[Impeccable](https://github.com/pbakaus/impeccable) 就是冲这套「AI 味」来的。作者 Paul Bakaus 是前端元老（Gmail 拖拽、Closure Compiler、Angular 早期作者），仓库 90.7k stars、5,379 fork，Apache-2.0。

它的立论写得很锋利：**「AI 味」不是模型的审美问题，而是「缺少可执行的约束」+「缺少可验证的反馈」这两个工程问题的叠加。** 所以解法是两头同时补：

- **约束端（软）**：把设计判断写进 Skill 的「工艺底线」和「拒绝清单」，给 LLM 读的自然语言规约；
- **验证端（硬）**：62 条**确定性**检测规则，跑在 CLI、浏览器扩展和 CI 里，**不需要 LLM、不需要 API key**，结果可复现。

这个「软约束 + 硬验证」的组合，是它最值得抄的地方。

```mermaid
flowchart LR
    A[Skill 里的软约束<br/>Craft Floor / Refuse] --> B[模型生成界面]
    B --> C[62 条确定性规则<br/>无需 LLM 与 API key]
    C --> D[findings 回灌<br/>钩子直接甩回 agent 循环]
    D --> B
```

## 一、三大支柱

### 支柱一：一个 Skill，24 条命令

安装后所有能力通过一个入口调用：

```bash
/impeccable <command> [target]
```

命令按用途分六组：

| 分类 | 命令 | 作用 |
|---|---|---|
| **Build** | `init` | 一次性设置：采集「持久产品真相」写入 `PRODUCT.md` |
| | `shape` | 写代码前先规划 UX/UI |
| | `document` | 从现有代码反向生成 `DESIGN.md` |
| | `extract` | 抽出可复用组件与 design token |
| **Evaluate** | `critique` | UX 设计评审：层次、清晰度、情绪共鸣 |
| | `audit` | 技术质量：a11y、性能、响应式 |
| **Refine** | `polish` / `bolder` / `quieter` | 收尾打磨 / 放大平庸 / 收敛过火 |
| | `distill` / `harden` / `onboard` | 做减法 / 边界与 i18n / 首跑与空状态 |
| **Enhance** | `animate` / `colorize` / `typeset` / `layout` / `delight` / `overdrive` | 动效、配色、排版、布局、细节、极限效果 |
| **Fix** | `clarify` / `adapt` / `optimize` | 文案澄清、多设备适配、性能 |
| **Iterate** | `live` / `generate` | 浏览器内点选元素热切换变体 / 批量生成 N 个变体 |

两个小机制：`/impeccable pin <command>` 把常用命令做成独立快捷方式（如 `/audit`）；`/impeccable doctor` 报告并修复项目内产物漂移（`PRODUCT.md`、`DESIGN.md`、config、surface brief、hook 版本不一致）。

### 支柱二：62 条确定性规则

同一份规则同时编译进 CLI、浏览器扩展和页面内 WASM——规则本体写在 Rust 里，JS 侧只负责 DOM 探针和 overlay 绘制。

规则分两类（`crates/live/assets/antipatterns.json`）：

- **`slop`（31 条）**：AI 生成界面的「体征」——`side-tab`（卡片单侧粗彩色边框，AI 味最明显的标志）、`ai-color-palette`（紫渐变 + 青黑）、`nested-cards`、`overused-font`（Inter / Roboto / Geist / Space Grotesk 用滥）、`gradient-text`、`icon-tile-stack`、`dark-glow`、`monotonous-spacing`、`flat-type-hierarchy`、`kicker-above-heading`、`hero-eyebrow-chip`、`marketing-buzzword`、`em-dash-overuse`……
- **`quality`（31 条）**：通用设计质量——`line-length`（>80 字符难读）、`cramped-padding`、`tight-leading`、`tiny-text`、`low-contrast`（WCAG AA 4.5:1，大字 3:1）、`gray-on-color`、`skipped-heading`、`heading-rhythm`、`text-occlusion`、`broken-image`、`text-overflow`……

严重度三档：44 条常规、16 条 `advisory`（仅提醒，人类正常设计也会出现，不判错）、2 条 `error`（`script-error`、`content-hidden-at-rest`）。另有一条 `IMMEDIATE_TIER_RULES`——「改动现场就值得立刻修」的那一档，设计钩子每次编辑后跑的就是这个子集。

### 支柱三：Live mode，在浏览器里换变体

原来的流程是：你说「把它做得更大胆」→ 读 diff → 刷新页面 → 再问一轮。慢且割裂。

Live mode 改成：浏览器里点选元素 → 选一个设计动作 → 立刻热切换出 N 个真实 HTML+CSS 变体 → 循环看 → 接受或丢弃。四个关键决策：

1. **改源码，不 patch DOM**。变体写进真实源文件，走框架自己的 HMR 渲染管线，React/Vue 状态不丢；「接受」天然 trivial——赢的那个变体本来就在源码里；变体是可读、可 diff、可提交的真代码。
2. **SSE + fetch，不用 WebSocket**。服务器零依赖纯 Node，因为脚本要随 skill 塞进用户项目里跑，不能要求装包。
3. **能力自包含在 skill 内**：`live-server.mjs`、`live-poll.mjs`、`live-wrap.mjs`、`live-browser.js` 四个文件。
4. **agent 侧用 HTTP 长轮询**，所有 harness 都会跑 shell 命令读 stdout，所以零 harness 特定集成。

还有个巧思：用 `display: contents` 包裹变体容器，wrapper 对 CSS 布局完全透明，被选元素在 flex/grid 里的位置关系原样保留。

## 二、怎么用

### 安装

```bash
# 项目根目录
npx impeccable install      # 探测已装的 harness，可选 provider / project|global
npx impeccable update       # 刷新已有安装
```

装完在 AI 工具里跑一次初始化：

```bash
/impeccable init
```

其他安装方式：Git submodule 供团队 vendor（`git submodule add ... .impeccable` + `npx impeccable link`）、Claude Code 插件市场、VS Code 扩展、Grok Build 插件、官网下载、手动 `cp -r dist/claude-code/.claude your-project/`。

> 各 harness 有自己的启用步骤：Cursor 要 Nightly + Agent Skills，Gemini 要 preview 版并打开 Skills，Codex 要在 `/hooks` 里批准项目钩子，Trae 要重启 IDE，Hermes 项目级安装要跑 `hermes skills trust`。能力矩阵在 `docs/HARNESSES.md`。

### 设计钩子：最值得先开的功能

在 Claude Code、GitHub Copilot、Codex、Cursor、Grok Build 上，安装会顺带装上原生钩子：

| Harness | 清单文件 | 行为 |
|---|---|---|
| Claude Code | `.claude/settings.local.json`（gitignored） | 编辑后返回 findings，Stop 时再跑一遍深度检查 |
| GitHub Copilot | `.github/hooks/impeccable.json`（committed） | 同上，CLI 与云端 agent 共用 |
| Cursor | `.cursor/hooks.json` | `postToolUse` 写文件后触发 |
| Codex | `.codex/hooks.json` | 需在 `/hooks` 里批准 |
| Grok Build | `.grok/hooks/impeccable.json` | 编辑后扫描预热，Stop 时把 findings 回给模型 |

效果：AI 改完 UI 文件，检测器当场把问题甩回 agent 流程里——不是攒成一份给人看的报告，而是形成闭环。

> 安全提示：Claude Code 里已安装的命令钩子**独立于模型工具审批**运行，第一次编辑就可能下载并缓存引擎，即便本次会话拒绝了模型的启动器命令。无人值守环境跑之前先审钩子；要整体关掉用 `--settings '{"disableAllHooks": true}'`。

### 独立 CLI（不需要任何 AI harness）

```bash
npx impeccable detect src/                   # 扫目录
npx impeccable detect index.html             # 扫单个 HTML
npx impeccable detect https://example.com    # 扫线上 URL（需本机 Chrome/Chromium/Edge）
npx impeccable detect --json .               # CI 友好的 JSON（stdout）
npx impeccable detect --github src/          # GitHub Actions annotations
npx impeccable detect --list-rules           # 打印 62 条规则目录
npx impeccable detect --no-config src/       # 忽略项目配置的裸扫
```

人类可读的 findings 写 stderr（`2> findings.txt`），机器可读走 stdout。退出码：`0` 无主要问题、`2` 有主要问题、`1` 有目标扫不了。

豁免三档：仓库级 `detector.ignoreRules/ignoreFiles/ignoreValues`、文件级行内注释（`<!-- impeccable-disable overused-font: 导出品牌文档 -->`，支持 `-line` / `-next-line` 精确定位）、`--no-config` / `--no-inline-ignores` 整体绕过。

### 别把工作文件提交进仓库

```gitignore
# impeccable-ignore-start
**/.impeccable/config.local.json
**/.impeccable/hook.cache.json
**/.impeccable/hook.pending.json
**/.impeccable/*.png
**/.impeccable/review/
**/.impeccable/live/sessions/
**/.impeccable/live/previews/
# impeccable-ignore-end
```

要保留在版本库的是共享产物：`config.json`、`live/config.json`、`design.json`、`surfaces/*.md`、`critique/*.md`。

## 三、四条立刻能用的设计理念

规则是工具，理念才是能迁移的部分。

**1. 四种访客模式，按界面选不按产品选。** Persuade（决定并行动，落地页/定价页）、Operate（完成任务，App/仪表盘/设置）、Read（理解内容，文档/文章/changelog）、Experience（置身作品，作品集/画廊）。规则很硬：**从「请求的那个界面」选模式，不是从「产品是什么」选**——工具的落地页仍是 Persuade，时尚公司的文档仍是 Read。这一条治的是 AI 最常见的病：把运营后台也做成 hero 大标题落地页。

**2. `PRODUCT.md` 与 `DESIGN.md` 分家。** 前者是持久产品真相（受众、目的、场景、约束、语气、证据），后者是视觉世界。分离的意义是不要把「谁在用、干什么用」和「长什么样」混为一谈；访客模式与视觉方向是每个界面各自选的，不是全局一次定死。

**3. Craft Floor 是写代码前必须加载的底线。** 对比度（彩色底上的次级文字从同色相调色，**永远不要用灰**）、纵深（阴影必须有偏移 + 柔和模糊，零偏移彩色光晕是装饰）、排版（正文 65–75ch，display 最大 6rem）、动效（**一个被设计过的瞬间**，不是散落的特效）、五个状态（hover/disabled/loading/error/empty）、以及最容易漏的**浏览器原生表面**（选中文本、光标、滚动条、焦点环、下划线偏移、表格数字）——「这些不属于任何设计系统，是你页面被『构建』而非『拼装』的最便宜信号」。

**4. Refuse 清单不是审美偏好，是把「默认」和「决定」区分开。** 一段话值得抄进团队规范：「在这些轴还自由的时候就去拿默认，说明你其实没做决定；认识到这一点意味着重写元素，而不是把它软化。」唯一例外是 kicker/eyebrow 压在标题上方——这是禁令，没有任何 brief 能挣回来。

## 四、局限与坑

1. **命令数在文档间不一致**：README 与 SKILL 命令表是 24，仓库 `PRODUCT.md` 与 ADR 是 23（`generate` 后加）。引用时说「24 条（含 1 条废弃别名）」最稳妥。
2. **强观点意味着可能误伤**：`side-tab`、硬偏移阴影、italic serif display 这些「AI 味」规则，在真正的 neobrutalist / editorial 品牌里可能是刻意设计。`advisory` 档和豁免机制就是为此准备的——用之前先想清楚你的「视觉世界」允不允许某些反模式。
3. **Live mode 不能用于生产站**：明文只支持本地 checkout，不支持注入已部署站点，也不允许为此削弱 CSP。要检查线上站用 `npx impeccable detect <url>` 或浏览器扩展。
4. **钩子会自动执行**：见上文安全提示。
5. **roll 请求无法关闭**，且依赖 impeccable.style 的在线 API——私有化/离线部署需要自建服务。
6. **贡献是 issue-first**：外部贡献者除非维护者先在 issue 里讨论同意，否则不要直接开 PR；**AI agent 不在维护者指示下不得代为创建 issue 或 PR**。
7. **版本线是分开的**：skill / CLI / extension 各自独立 tag，引擎单独走 `engine-v`。查版本别只看一个。

## 五、一句话总结

Impeccable 证明了一件对 AI 工作流普遍成立的事：**能用规则判的（对比度、行长、内边距、跳级标题）交给确定性检查器跑进 CI，留给 LLM 的只有层次感、情绪共鸣这类主观判断。** 别指望换个更强的模型就自动有品味——约束 + 反馈闭环才是解法。

---

**参考**

- 仓库：<https://github.com/pbakaus/impeccable>
- 官网 / 文档：<https://impeccable.style>（规则目录 `/docs/detector`，钩子文档 `/docs/hooks`）
- npm：<https://www.npmjs.com/package/impeccable>
- 关键文档：`skill/reference/craft-floor.md`（工艺底线与拒绝清单）、`docs/ENGINE.md`（引擎架构与规则打包）、`docs/CLI-CONTRACT.md`（行为契约）、`docs/adr-live-variant-mode.md`（Live mode ADR）
