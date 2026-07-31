# roc-blog Editorial Journal UI 全面优化设计

**日期：** 2026-07-31  
**状态：** 已确认  
**项目：** `roc-blog`

## 1. 背景与目标

本次优化将现有博客统一为现代、克制、内容优先的个人技术写作空间。视觉方向采用 **Editorial Journal**：以 Apple 式编辑秩序、独立刊物的个人气质和技术文档的可扫描性为核心，而不是传统资讯站或重卡片 SaaS Dashboard。

目标：

- 优先改善长篇技术文章、代码、表格、Mermaid、LaTeX 和图片的阅读体验。
- 充分利用桌面宽屏，减少技术内容因窄版心产生的无意义换行。
- 统一首页、列表页、标签页、文章页、导航、目录和页脚的视觉语言。
- 修复现有移动端溢出、字号断点、TOC 状态和主题初始化问题。
- 保留现有内容模型、路由、模板数据和阅读功能，不引入新业务能力。

## 2. 实施边界

### 2.1 技术边界

沿用现有技术栈：

- Zola 0.19.2
- Tera templates
- Tailwind CSS 3.2 + Typography
- PostCSS
- 原生 JavaScript

不迁移 React，不引入组件框架或新运行时依赖。模板宏、Tailwind utility 和少量语义化自定义 CSS 构成组件系统。

### 2.2 功能边界

本轮仅优化布局、视觉、排版、响应式、可访问性和现有交互表现。

明确不新增：

- 全局搜索与 `⌘K`
- 图片灯箱
- 分享按钮
- 作者资料业务模块
- 代码行号、自动换行切换、文件名解析
- Shiki
- 新的阅读统计或 Views
- Skeleton

保留并优化现有能力：暗色模式、Markdown、Zola 代码高亮、代码复制、TOC、Scroll Spy、阅读进度、标题锚点、上一篇/下一篇和推荐阅读。

## 3. 当前 UI 问题与优先级

### P0：必须修复

1. `base.html` 缺少 viewport，移动端断点和页面缩放可能异常。
2. 全局导航包含大量链接，但没有窄屏折叠、滚动或裁剪策略，容易横向溢出。
3. `main.js` 无条件绑定 `back-to-top`，首页和 404 页会因节点不存在产生运行时错误。

### P1：显著影响体验

1. 多个模板使用 `text-5xl xl:text-4xl`、`prose-2xl xl:prose-base` 等反向 mobile-first 规则，导致移动端字号大于桌面。
2. 文章正文和首页仍受窄版心限制，长代码、SQL、JSON、YAML、表格和 Mermaid 容易频繁换行。
3. `prose-headings:w-max` 会使长标题拒绝正常换行并产生横向溢出。
4. 双份 TOC 使用单节点映射，同一章节不能稳定同步桌面和移动目录的激活态。
5. 首页、Section、taxonomy 和文章页缺少统一的字号、边框、间距和响应式规则。
6. 缺少全局 Footer，页面结束缺乏视觉收束。

### P2：一致性与质量

1. 首次访问不尊重系统主题，暗色模式由 defer 脚本延迟初始化，可能出现亮色闪烁。
2. 页面主体为中文，但文档声明为 `lang="en"`。
3. 无标题短文仍展示空的移动 TOC。
4. 当前搜索索引关闭，却在 JSON-LD 中声明不可用的 SearchAction。
5. CI 未运行 Node 测试，默认 `yarn test` 也没有覆盖 `static/js/reading.test.mjs`。

## 4. 设计方向

选定 **Editorial Journal**：

- 暖白纸张背景，而非纯白产品画布。
- Crimson Pro 作为拉丁字符和标题的编辑型衬线字体；中文使用 PingFang SC 等系统字体保证可读性。
- JetBrains Mono 用于代码。
- 金棕色作为唯一主强调色，避免蓝紫渐变和高饱和 SaaS 风格。
- 默认不依赖阴影，以留白、细边框和字体层级建立秩序。
- 轻圆角、低位移动效，避免重卡片化。

## 5. 信息架构与页面布局

### 5.1 全局 Header

- 高度约 64px，sticky，使用半透明暖白背景、细底边和适度 backdrop blur。
- 左侧为 `Roc’s Notes` 或现有站名，使用克制的编辑型字标。
- 右侧保留现有核心导航和主题切换。
- 桌面保持单行；窄屏导航区允许横向滚动并隐藏滚动条，站名与主题切换不被压缩。
- 补充当前页状态、键盘 Focus Ring 和准确的 accessible name。
- 不新增汉堡菜单及其状态逻辑。

### 5.2 首页

- 最大宽度 1200–1280px，桌面水平内边距 32–40px。
- Hero 使用编辑式标题、个人简介和现有社交链接，不恢复全屏图片。
- 文章列表采用高密度索引，而非重阴影卡片网格。
- 每篇展示现有数据中可用的标题、摘要、标签、日期和阅读时长。
- Cover、Views 不存在稳定数据源，本轮不补造。
- 条目之间用细分隔线和留白分层；Hover 上移不超过 2px，标题/箭头发生颜色或位置反馈。

### 5.3 Section 与 Taxonomy

- 与首页共享列表项、标签、Meta 和分页视觉规则。
- 修正移动端超大标题，建立 mobile-first 字号阶梯。
- 标签页采用紧凑索引，不展示大面积装饰性空白。

### 5.4 文章页

Desktop（`≥1280px`）：

- 整体最大宽度约 1320px。
- 主网格为 `minmax(0, 1000px) 220–240px`，间距 56–72px。
- 正文实际可读宽度根据内容和视口控制在 900–1000px。
- 右侧 TOC sticky，顶部偏移与 Header 对齐。
- 移除当前无内容的右侧占位列，也不增加左侧全局导航。

Tablet/Laptop（`768–1279px`）：

- 单栏正文，宽度约 760–900px。
- 隐藏固定 TOC，沿用文章顶部折叠目录。

Mobile（`<768px`）：

- 单栏，页面左右内边距 16px。
- 标题、正文、Meta 和文章尾部按 mobile-first 规则缩小。
- 代码、表格和 Mermaid 在自身容器中横向滚动，禁止整页横向溢出。

### 5.5 Footer

新增轻量全局 Footer：

- 版权年份、站点名、RSS 和现有核心入口。
- 使用顶部分隔线，不使用大面积背景或营销 CTA。
- Footer 只做页面收束，不承载新业务功能。

## 6. Typography

字体栈：

- Display/Heading：`"Crimson Pro", "PingFang SC", "Hiragino Sans GB", serif`
- Body：`"Crimson Pro", "PingFang SC", "Microsoft YaHei", serif`
- UI/Meta：`"Work Sans", Inter, -apple-system, BlinkMacSystemFont, sans-serif`
- Code：`"JetBrains Mono", ui-monospace, SFMono-Regular, monospace`

保留本地 WOFF2 字体，不引入远程字体。中文由系统字体回退。

建议层级：

| 元素 | Mobile | Desktop | 行高 | 字重 |
|---|---:|---:|---:|---:|
| Article H1 | 36px | 52–56px | 1.08–1.15 | 500 |
| H2 | 28px | 32–34px | 1.22–1.3 | 500 |
| H3 | 22px | 23–25px | 1.3–1.4 | 600 |
| Body | 17px | 18px | 1.8 | 400 |
| Summary | 16px | 17px | 1.65–1.75 | 400 |
| UI/Meta | 12–14px | 12–14px | 1.4–1.6 | 500–600 |
| Code | 13px | 13–14px | 1.6–1.7 | 400 |
| Caption | 12px | 13px | 1.55 | 400 |

排版规则：

- 正文段落间距约 `1.3–1.4em`。
- H2 前间距大于后间距，并有轻量锚点反馈，不增加装饰性粗下划线。
- 标题允许自然换行，移除 `w-max`。
- 中英文混排使用正常字距；仅 Label 和 Meta 使用大写与 tracking。
- 行内代码使用低对比暖灰底，不改变段落行高。

## 7. 色彩系统

### 7.1 Light

| Token | HEX | 用途 |
|---|---|---|
| Background | `#FBFAF7` | 页面背景 |
| Surface | `#F5F2EC` | 次级区域、代码工具栏 |
| Card | `#FFFFFF` | 需要抬升的内容面 |
| Border | `#E7E2D9` | 分隔线和边框 |
| Primary | `#A16207` | 链接、当前状态、Focus |
| Secondary | `#78716C` | 次级控件与标签 |
| Text | `#1C1917` | 主文字 |
| Muted | `#78716C` | Meta、说明文字 |
| Success | `#16803C` | 成功状态 |
| Warning | `#B45309` | 警告状态 |
| Danger | `#B42318` | 错误状态 |

### 7.2 Dark

| Token | HEX | 用途 |
|---|---|---|
| Background | `#1C1917` | 页面背景 |
| Surface | `#24211F` | 次级区域 |
| Card | `#292524` | 抬升内容面 |
| Border | `#44403C` | 分隔线和边框 |
| Primary | `#D6A35C` | 链接、当前状态、Focus |
| Secondary | `#A8A29E` | 次级控件 |
| Text | `#F5F2EC` | 主文字 |
| Muted | `#A8A29E` | Meta、说明文字 |
| Success | `#4ADE80` | 成功状态 |
| Warning | `#FBBF24` | 警告状态 |
| Danger | `#F87171` | 错误状态 |

色彩约束：

- Primary 只用于交互、当前状态和少量品牌标记。
- 正文链接不能仅以颜色区分，Hover/Focus 时增加下划线或明确边界。
- 暗色模式避免纯黑与纯白，降低长时间阅读眩光。

## 8. 组件系统

### 8.1 Card 与列表项

- 圆角统一为 3–6px。
- 默认 1px Border，无阴影。
- 仅可点击 Card 在 Hover/Focus 时上移 2px，并显示柔和短阴影。
- Transition 统一为 180ms。
- 首页和列表页优先使用分隔式 Article Row，推荐阅读可使用轻 Card。

### 8.2 Tag Chip

- 小字号、高度紧凑、低对比 Surface 背景。
- 默认中性灰；Hover/Focus 切换为 Primary 文本和轻 Primary 背景。
- 不使用高饱和多色标签。

### 8.3 Code Block

- 保留 Zola/Nord 高亮和现有 Copy 功能。
- 统一代码块背景、边框、3px 圆角、内边距和 JetBrains Mono。
- Copy 控件使用 UI 字体、清晰 Focus Ring 和成功反馈。
- 长代码横向滚动，默认不强制换行。
- 本轮不承诺文件名、Language、行号和换行切换；模板没有可靠元数据时不模拟这些能力。

### 8.4 Table

- 外层容器负责横向滚动。
- Header 使用 Surface 背景和中等字重。
- 行间使用细边框，数值列允许右对齐。
- 不使用斑马纹作为默认样式，Hover 仅提供轻微背景反馈。

### 8.5 Image、Mermaid 与 LaTeX

- 图片最大宽度 100%，使用 3–6px 圆角和轻边框。
- Caption 使用统一 Caption 字号、Muted 色和居中对齐。
- Mermaid 与 LaTeX 容器沿用相同边界和间距体系。
- 保持内容完整；窄屏优先容器滚动，不裁切技术图。
- 本轮不新增点击放大逻辑。

### 8.6 Quote 与 Callout

- Quote 使用 2px Primary 左边框、编辑型斜体和充足留白。
- 现有 Markdown 没有通用 Callout 语法时，仅提供可复用视觉 class，不改变内容解析规则。
- Success、Warning、Danger 使用语义色，但背景保持低饱和。

### 8.7 TOC

- 标题为紧凑 UI Label。
- 左侧 1px Border；当前章节使用 2px Primary Border 和 Primary 文本。
- 支持 H2/H3/H4 缩进层级。
- 修复同一章节在桌面与移动 TOC 中同步激活的问题。
- 无有效标题时隐藏移动折叠目录。

### 8.8 文章尾部

- 保留标签、上一篇/下一篇和推荐阅读。
- 上一篇/下一篇使用双列轻 Card，移动端堆叠。
- 推荐阅读最多沿用当前数量和排序，不调整业务算法。
- 不新增作者信息或分享功能。

## 9. 动效

- Hover/Focus/Theme 状态过渡统一为 150–200ms，默认 180ms。
- Card 位移不超过 2px；视觉缩放不超过 1.01。
- 链接、Tag、按钮优先使用颜色、边框或下划线反馈。
- 保留平滑锚点滚动，但尊重 `prefers-reduced-motion`。
- `prefers-reduced-motion: reduce` 下关闭非必要 transition、transform 和 smooth scroll。
- 不添加页面入场动画、视差或大面积渐变动画。

## 10. 响应式规则

| 视口 | 布局 |
|---|---|
| `<640px` | 单栏，16px 页面边距，横向导航，技术内容容器滚动 |
| `640–767px` | 单栏，20–24px 页面边距，文章尾部可保持单列 |
| `768–1279px` | 单栏宽正文，折叠 TOC，上一篇/下一篇双列 |
| `1280–1439px` | 正文 + 右侧 Sticky TOC，整体约 1200–1280px |
| `≥1440px` | 正文 900–1000px + TOC 220–240px，整体最多约 1320px |

所有字号从 Mobile 默认值逐级放大，不再使用移动端比桌面更大的反向规则。

## 11. 可访问性

- `html` 使用 `lang="zh-CN"`。
- 添加 `<meta name="viewport" content="width=device-width, initial-scale=1">`。
- 所有交互元素使用原生 `a` 或 `button`，不以普通元素模拟按钮。
- Focus Ring：2px Primary，2px offset，暗色和亮色均可见。
- 当前导航使用 `aria-current="page"`（模板上下文允许时）。
- 主题按钮保留准确的 `aria-label` 并同步状态。
- 所有正文和 UI 文本达到 WCAG AA 对比度。
- 键盘可访问 Navbar、主题切换、TOC、Copy、标题锚点和文章导航。
- 修复空节点绑定错误，避免辅助功能脚本因异常中断。

## 12. 性能

- 不新增远程字体、React、图标库或重型 JavaScript。
- 继续使用本地 WOFF2 子集和系统中文字体。
- 在 `<head>` 中用极小同步脚本根据 localStorage 或 `prefers-color-scheme` 初始化主题，避免 FOUC；后续交互仍由 `main.js` 管理。
- 图片模板可安全控制时添加原生 `loading="lazy"` 和 `decoding="async"`；首屏关键图片不强制懒加载。
- 避免大面积 blur、多层 shadow 和昂贵动画。
- CSS 构建继续由现有 PostCSS/cssnano 管线完成。

## 13. 现有交互与数据流

### 13.1 主题

1. Head 初始化脚本读取显式本地偏好。
2. 无显式偏好时读取系统主题。
3. 在首次绘制前设置 `html.dark`。
4. `main.js` 处理主题按钮点击并持久化偏好。

### 13.2 TOC

1. `reading.js` 扫描文章 H2/H3/H4。
2. 为缺少 ID 的标题生成稳定 ID。
3. 同时填充桌面和移动 TOC。
4. 每个 heading ID 对应多个 TOC link。
5. IntersectionObserver 更新该 ID 的全部 link 激活态。
6. 没有标题时隐藏所有 TOC 容器。

### 13.3 阅读增强

- 阅读进度继续由 requestAnimationFrame 驱动。
- Copy 按钮继续使用 Clipboard API，并保留现有降级策略。
- 标题锚点继续复制章节 URL。
- 推荐阅读继续读取现有索引并保持当前排序算法。

## 14. 错误处理

- 所有可选 DOM 节点在绑定事件前进行存在性检查。
- Clipboard 失败时恢复按钮状态，不阻塞其他阅读增强功能。
- TOC 生成失败或无标题时，正文必须保持正常可读。
- 推荐阅读索引加载失败时，仅隐藏推荐区域，不影响文章正文和导航。
- 主题 localStorage 不可用时退回当前 DOM 状态与系统主题。

## 15. 文件级设计范围

预计涉及：

- `boring/templates/base.html`
- `boring/templates/index.html`
- `boring/templates/page.html`
- `boring/templates/section.html`
- `boring/templates/taxonomy_list.html`
- `boring/templates/taxonomy_single.html`
- `boring/templates/404.html`
- `boring/templates/macros.html`
- `boring/css/style.css`
- `boring/tailwind.config.js`（仅在需要语义化 Token/宽度时调整）
- `boring/static/js/main.js`
- `boring/static/js/reading.js`
- 对应测试与 `package.json` 测试脚本

编译产物 `boring/static/css/style.css` 在 CSS 构建后同步更新。

## 16. 测试与验收

### 16.1 自动化验证

- 执行 `yarn build`，确认 PostCSS/Tailwind 构建成功。
- 执行 `yarn test`，并调整脚本使其覆盖 `static/js/reading.test.mjs`。
- 执行 `yarn audit`。
- 使用项目固定的 Zola 0.19.2 完成站点构建。
- 为 `main.js` 可选节点、主题初始化、双 TOC 激活和空 TOC 补充测试。

### 16.2 视觉验收

检查以下视口：

- 375px
- 768px
- 1280px
- 1440px

覆盖页面：

- 首页
- Section 列表
- 标签列表与单标签页
- 含长标题文章
- 含长代码、表格、图片、Mermaid、LaTeX 的文章
- 404

### 16.3 交互与无障碍验收

- 全键盘遍历无陷阱，Focus Ring 始终可见。
- Light/Dark 无明显首屏闪烁。
- 主题偏好持久化并尊重首次系统主题。
- Navbar 不造成整页横向滚动。
- TOC 当前章节在桌面与移动端均正确更新。
- `prefers-reduced-motion` 下不执行非必要动画。
- 浏览器控制台无运行时错误。

### 16.4 成功标准

- 桌面正文可用宽度稳定在 900–1000px，技术内容显著减少无意义换行。
- 任一目标视口无整页横向溢出。
- 页面形成一致的 Editorial Journal 设计语言。
- 不改变现有内容、URL、文章排序和推荐算法。
- 构建、审计和测试全部通过。
