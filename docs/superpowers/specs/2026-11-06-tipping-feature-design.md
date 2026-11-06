# 文章页赞赏（Tipping）· 设计文档

- **状态**：设计已确认（2026-11-06 与用户 brainstorm 后敲定，待实施）
- **作者**：roc（与 dsh 协作）
- **创建日期**：2026-11-06
- **作用范围**：`roc-blog`（Zola 0.23+ + `boring/` 主题 + Cloudflare Pages）

## 1. 背景与目标

博客正文页目前只有 AdSense 槽位与"相关阅读"，没有任何"支持作者"的入口。用户已提供微信支付、支付宝两张个人收款码原图（当前位于仓库根目录、未被 git 跟踪：`wx.jpeg` 828×1124、`zfb.jpeg` 1708×2560）。

目标：在**单篇文章页的最末尾**提供一个克制、默认收起、不打断阅读流的赞赏入口；读者愿意支持时点开即可看到微信/支付宝两个二维码并扫码。

## 2. 范围

**In scope**

- 文章页页尾折叠式「赞赏」面板（原生 `<details>` / `<summary>`，零 JS）
- 微信支付 / 支付宝两个渠道：裁好的二维码方块 + 渠道标签 + 收款人昵称小字
- 文案与渠道配置化（`config.toml` 的 `[extra.tipping]`），改字/加成渠道不用改模板
- 逐篇关闭能力（frontmatter `extra.tipping: false`）
- 二维码裁图脚本（本地手动跑）+ 量化后的静态资源
- 样式：浅色 / 深色 / 移动端 / 打印 / 减少动效
- 站点输出集成测试断言

**Out of scope（明确不做）**

- 支付跳转、预设金额、赞赏排行榜、赞赏留言
- 点击统计 / 埋点（站点 GA measurement id 目前为空）
- JS 展开动画、"点击外部收起"（`<details>` 无此交互，不值得为此引 JS）
- 首页 / 分类列表页 / 页脚的赞赏入口
- 多作者、多语言、多币种
- 二维码由第三方服务动态生成

## 3. 用户故事

**作为读者**，我希望——

- 读完文章、看完相关阅读后，页尾有一行不显眼的「赞赏」，不想支持时完全不打扰我
- 想支持时点一下就能看到微信和支付宝的码，手机直接扫，不用跳转
- 手机上没有横向滚动；深色模式下二维码依然清晰可扫

**作为作者**，我希望——

- 改文案、改渠道名、换二维码图都不用改模板代码
- 能一键全站关闭，也能对单篇文章关闭
- 换收款码时只替换原图、重跑一个脚本即可，不用手工裁图

## 4. 关键决策（来自 brainstorm）

| 维度 | 决策 | 理由 |
|---|---|---|
| 入口形态 | 页尾一行触发条，点击原地展开 | 兼顾"有入口"与"不打扰"，展开后才占用版面 |
| 位置 | 上下篇 + 相关阅读之后、`</article>` 之前 | 用户选择"整页最末、最克制"；不打断"读完 → 下一篇"的路径 |
| 面板内容 | 只裁二维码本体 + editorial 主题卡片重绘 | 两张原图比例不同（1:1.36 / 1:1.5）且绿蓝色块重，直接并排不协调 |
| 文案语气 | 克制版：`赞赏 ▾` / "如果这篇文章帮到了你，欢迎请我喝杯咖啡。" / "金额随意，感谢支持" | 与站点编辑气质一致，不做营销口吻 |
| 交互实现 | 原生 `<details>` / `<summary>` | 零 JS、键盘与读屏天然可用、无 JS 仍可用；展开动画不重要 |
| 文案/渠道来源 | `config.toml` 的 `[extra.tipping]` | 改字不动模板，且可全站开关 |
| 逐篇控制 | frontmatter `extra.tipping: false` | 加密文章、翻译/演讲等非原创内容可单独关掉 |
| 裁图方式 | 本地 Pillow 脚本一次性生成，产物提交进 git | CI 不引入 Python 图像依赖；换码时才手动跑 |
| 卡片底色 | 二维码卡片始终白底 | 深色模式下保证可扫性，只让外层与文字走暗色 |
| 响应式断点 | ≥480px 两列并排；<480px 竖排 | 窄屏并排时码太小，扫码体验差 |

## 5. 架构与组件

数据流是纯构建期的：`config.toml` → Tera 模板 → 静态 HTML。没有运行时数据、没有网络请求、没有新 JS。

**`boring/config.toml` 新增：**

```toml
[extra.tipping]
enabled = true
trigger = "赞赏"
lead = "如果这篇文章帮到了你，欢迎请我喝杯咖啡。"
note = "金额随意，感谢支持"

[[extra.tipping.channels]]
label = "微信支付"
account = "Faker(**鹏)"
image = "img/tip/wechat-qr.png"
alt = "微信赞赏二维码，用微信扫一扫"

[[extra.tipping.channels]]
label = "支付宝"
account = "王二小(**鹏)"
image = "img/tip/alipay-qr.png"
alt = "支付宝赞赏二维码，用支付宝扫一扫"
```

**`boring/templates/components.html` 新增组件：**

```tera
{% component tipping(tip: map) %}
<details class="tip">
    <summary class="tip__trigger">
        <span class="tip__trigger-label">{{ tip.trigger | default(value="赞赏") }}</span>
        <span class="tip__chevron" aria-hidden="true"></span>
    </summary>
    <div class="tip__panel">
        {% if tip.lead %}<p class="tip__lead">{{ tip.lead }}</p>{% endif %}
        <ul class="tip__channels">
            {% for channel in tip.channels %}
                {% if channel.image %}
                    <li class="tip__channel">
                        <img class="tip__qr"
                             src="{{ get_url(path=channel.image) | safe }}"
                             alt="{{ channel.alt | default(value=channel.label) }}"
                             width="384" height="384"
                             loading="lazy" decoding="async">
                        <p class="tip__channel-label">{{ channel.label }}</p>
                        {% if channel.account %}<p class="tip__account">{{ channel.account }}</p>{% endif %}
                    </li>
                {% endif %}
            {% endfor %}
        </ul>
        {% if tip.note %}<p class="tip__note">{{ tip.note }}</p>{% endif %}
    </div>
</details>
{% endcomponent tipping %}
```

**`boring/templates/page.html` 调用点**（`{{<related …/>}}` 之后、`</article>` 之前）：

```tera
{% if config.extra.tipping is defined and config.extra.tipping.enabled %}
    {% set tip_channels = config.extra.tipping.channels | default(value=[]) %}
    {% set tip_enabled_here = page.extra.tipping | default(value=true) %}
    {% if tip_channels | length > 0 and tip_enabled_here %}
        {{<tipping tip={config.extra.tipping}/>}}
    {% endif %}
{% endif %}
```

组件边界：输入一个 `tip` map，输出一段 HTML；不读全局配置、不依赖页面上下文，可在任意模板复用。

## 6. 资源与构建

**源图迁移**（本次实施的一部分，原图当前在仓库根目录且未跟踪）：

- `wx.jpeg` → `boring/assets/tipping/wechat-source.jpeg`
- `zfb.jpeg` → `boring/assets/tipping/alipay-source.jpeg`

`boring/assets/` 是主题开发资源目录，**不进入构建产物**（现有 `assets/fonts/source` 同理，`scripts/build-fonts.sh` 从那里读），因此原图（含完整品牌边框）不会被发布到站点。

**裁图脚本** `boring/scripts/tipping-qr.py`（Python + Pillow，仅本地手动运行）：

1. 读入原图，用亮度阈值取深色（二维码模块）掩码
2. 形态学膨胀合并模块，做连通域，取最接近正方形（宽高比 0.75–1.35）且面积最大的候选
3. 用该连通域内部深色像素的紧包围盒作为二维码区域，向外留 7–8% 白边（quiet zone）
4. 合成到白色画布，缩放至 384×384（LANCZOS），调色板量化（≤64 色）后保存为 PNG`optimize=True`
5. 输出 `boring/static/img/tip/wechat-qr.png`、`alipay-qr.png`，并打印两张图的体积

**体积预算**：单张目标 ≤30KB，硬上限 60KB（由测试断言）。

**缓存**：`boring/static/_headers` 新增

```
/img/tip/*
  Cache-Control: public, max-age=31536000, immutable
```

**产物链接**：模板用 `get_url(path="img/tip/…png")`，不加 `cachebust`（更新图片时改文件名或文件名不变也可，因为 README/文档会说明发布需要清缓存；长缓存换图后建议重命名文件）。

## 7. 交互与可访问性

- 原生 `<details>`：键盘 `Enter`/`Space` 切换，读屏播报展开/收起状态，**无需 JS**
- `summary` 触控高度 ≥44px，整块可点
- `:focus-visible` 焦点环：2px 琥珀色 outline + 2px offset；`::marker` 去掉默认三角，改用 CSS 绘制的箭头（`aria-hidden`）
- 图片：`alt` 来自配置（描述"是哪个渠道的赞赏码"），固定 `width`/`height` 防 CLS，`loading="lazy"` + `decoding="async"`
- `prefers-reduced-motion: reduce` 下关闭箭头过渡
- 打印：`@media print { .tip { display: none } }`

## 8. 样式规范

- 前缀统一 `tip`（当前 `style.css` 中无同名类，需在实施时再确认一次）
- `.tip`：上外边距 3.5rem；上边框 1px（浅色 `rgba(28,25,23,.1)` / 深色 `rgba(255,255,255,.12)`）；内边距 1.5rem 0 0
- `.tip__trigger`：胶囊按钮，1px 琥珀 40% 边框、琥珀文字、hover 背景 6% 琥珀；`[open]` 时背景 6% 琥珀、箭头旋转 180°
- `.tip__panel`：最大宽 560px 居中；`.tip__lead` 13.5px 石色 600
- `.tip__channels`：flex，≥480px 两列 gap 14px；<480px 单列、卡片宽 210px 居中
- `.tip__channel`：白底、1px 边框、圆角 12px、内边距 12px；`.tip__channel-label` 12.5px；`.tip__account` 10.5px 弱化色
- 深色模式：外层背景/文字/边框走 tokens，二维码卡片保持 `#fff` 底
- 全部复用现有 CSS 变量与 `@apply` 约定，不新增依赖，不碰 Tailwind 扫描路径

## 9. 边界情况

| 情况 | 行为 |
|---|---|
| `config.extra.tipping.enabled = false` | 全站不渲染（模板守卫） |
| 某篇 frontmatter `extra.tipping: false` | 该篇不渲染 |
| `channels` 缺失或为空 | 整个组件不渲染（调用点用 `default(value=[])` + `length > 0` 守卫） |
| 某渠道缺 `image` | 跳过该渠道 |
| 某渠道缺 `account` | 只显示渠道标签 |
| `trigger` / `lead` / `note` 缺失 | 分别回退到默认文案 / 不渲染对应行 |
| 二维码图片文件缺失 | 构建不报错，由集成测试断言产物存在兜底 |
| 加密文章 | 照常渲染（赞赏块在加密区之外） |
| Atom feed / SEO | 不受影响（feed 只用正文内容；不新增结构化数据） |
| AdSense | 赞赏块位于页面最末，与广告槽位分离，不共位 |

## 10. 测试策略

**集成测试**（`boring/tests/site-output.test.mjs`，JSDOM）：

1. 取首页第一篇文章页：存在 `details.tip`；`summary` 文本包含"赞赏"
2. 两个 `img.tip__qr` 的 `src` 指向 `/img/tip/` 下的 PNG，且 `alt` 非空
3. DOM 顺序：`.tip` 位于 `.related-section` 之后，且仍在 `article.article-main` 内
4. 产物文件 `roc-blog/img/tip/wechat-qr.png`、`alipay-qr.png` 存在，单张大小 ≤60KB

**人工验证**：

- `cd boring && yarn build && zola build -o roc-blog --force && yarn test && yarn test:site`
- 浅色 / 深色 / 375px 视口 / 键盘 Tab / 禁用 JS / 打印预览
- 手机微信、支付宝各扫一次，确认可识别

## 11. 验收标准

1. 任一文章页页尾出现 `赞赏 ▾`；点击展开两个二维码卡片，再点收起
2. 两张码可被手机微信/支付宝识别（人工扫码）
3. 深色模式下文字与边框可读，二维码保持白底
4. 375px 视口下卡片竖排、无横向滚动
5. 全局关闭或单篇关闭后，重新构建对应页面无 `.tip`
6. `yarn test` 与 `yarn test:site` 全部通过
7. 单张二维码 ≤60KB

## 12. 风险与回滚

- **二维码可扫性**：量化/缩小可能影响识别。若扫不出，回退方案是提高分辨率到 500–600px 或直接用原图卡片。发布前必须真机扫一次。
- **AdSense 合规**：页面最末的"赞赏"属常规捐赠入口，与广告槽不共位，风险低；若审核有异议，全局关闭即可。
- **回滚**：删掉 `page.html` 里的调用即可恢复，样式、组件、资源、配置可保留（不渲染即无副作用）。

## 13. 增量 v2（2026-11-06）：顶栏咖啡入口 + 全站弹窗

**目标**：顶栏 `.site-actions` 增加咖啡图标，点击打开赞赏弹窗，再点关闭；文章页页尾面板保留。

| 维度 | 决策 | 理由 |
|---|---|---|
| 弹出形态 | 全站原生 `<dialog>` + `showModal()` | 长文读一半也能打赏；非文章页（首页/分类）也有入口；原生焦点陷阱与 Esc |
| 关闭路径 | Esc / 右上角 ✕ / 点遮罩（点图标位置也命中遮罩） | 满足"再点一次关掉"，且不必为模态框让触发器保持可点 |
| 图标 | Line Awesome `la-coffee`（`f0f4`） | 与 GitHub/RSS/搜索图标同源；需重建字体子集并补契约 |
| 复用 | dialog 内直接调用既有 `tipping` 组件 | 不复制二维码/文案 markup，配置单一来源 |
| 语境样式 | 在 dialog 内隐藏 `summary` 触发条、去掉上边框 | 详情头在弹窗里无意义 |
| 逐篇一致性 | `extra.tipping: false` 时顶栏图标与页尾面板一起隐藏 | 避免"关掉了还能从顶栏点开" |
| 无 JS | 按钮与 dialog 照常渲染，点击无反应；页尾 `<details>` 仍可展开 | 可接受的渐进降级；不为此加 noscript 提示（YAGNI） |

**模板守卫**（`base.html`，顶栏按钮与 dialog 共用）：

```tera
{% set tip_on = false %}
{% if config.extra.tipping is defined and config.extra.tipping.enabled %}
    {% set tip_channels = config.extra.tipping.channels | default(value=[]) %}
    {% set tip_page_on = page is not defined or (page.extra.tipping | default(value=true)) %}
    {% set tip_on = tip_channels | length > 0 and tip_page_on %}
{% endif %}
```

**新增文件**：`static/js/tipping.js`（~45 行，开关 dialog、遮罩点击关闭、`aria-expanded` 同步、缺元素静默退出）、`static/js/tipping.test.mjs`。

**样式**：`.tip-dialog`（纸张色卡片、最大 34rem、`::backdrop` 半透明墨色）、`.tip-dialog__close`（44px 触控、焦点环）、dialog 内 `.tip` 去外边距/边框、隐藏 `.tip__trigger`。

**字体**：`css/fonts.css` 加 `.la-coffee::before`；`scripts/build-fonts.sh` 子集加 `0xf0f4`；`scripts/lib/font-assets.test.mjs` 的 `iconCodepoints` 加 `la-coffee`。

> **字体文件名必须带版本号**（当前 `la-solid-900-subset-v2.woff2`）：`/fonts/*` 走 `immutable` 一年长缓存，原地覆盖文件会让老访客一直用缓存里的旧子集，新增图标显示为空。增删字形时同步改 `build-fonts.sh` 的输出名与 `fonts.css` 的 `@font-face`（v3、v4…）。

**测试**：`tipping.test.mjs`（无元素不报错、打开、再点关闭、遮罩关闭、状态同步）；`site-output.test.mjs` 新增顶栏按钮 + dialog + 两张码断言，并把既有断言限定到 `article.article-main details.tip`（文章页现有两份 markup）。

**验收**：
1. 任意页面顶栏可见咖啡图标，点击弹出赞赏弹窗，Esc/✕/遮罩均可关闭
2. 文章页页尾面板行为不变
3. `enabled=false` 或该篇 `extra.tipping: false` 时，图标与弹窗都不渲染
4. `node --test` 全部通过（含字体契约与新增 JS 单测）

