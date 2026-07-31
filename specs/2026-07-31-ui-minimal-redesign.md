# UI 极简重设计规格 (2026-07-31)

## 目标

将博客 roc-blog 的全站视觉风格从「全屏 Hero 图片 + 左右分栏」改为「现代极简」——保留暗色模式和琥珀黄强调色，去掉重装饰，让内容优先。

## 方案决策

**选定方案二：模板 + CSS 整理**

- 修改 HTML 模板文件（`index.html`、`base.html`、`macros.html`）
- 修复 `style.css` 中的 merge conflict
- 不引入新依赖，不改 `tailwind.config.js` 结构

## 设计规格

### 全局布局

- 新增 sticky Navbar：左侧站名，右侧导航链接 + 暗色模式切换按钮
- 移除 `base.html` 中裸露的 `<section>` 包裹，改由各页模板自行管理顶层容器
- 最大宽度统一为 `max-w-2xl`（约 672px），居中，`px-4`

### 首页（`index.html`）

**现状：** 全屏半屏图片 + 右侧文字，下方文章列表  
**新设计：**

1. Compact Hero（~120px 高）：
   - 姓名（`text-2xl font-bold`）+ 一句话简介（`text-sm text-slate-500`）
   - 社交图标行（保留现有 `config.extra.social` 数据源）
   - 移除 `homepage_img_url` 图片的全屏用法（图片配置保留但不再撑满半屏）

2. 文章列表区：
   - 小节标题「最近更新」（`text-xs uppercase tracking-widest text-slate-400`）
   - 每篇文章：标题 + 日期行内对齐（`flex justify-between`）+ 摘要两行截断 + 标签 badge（amber 浅黄）+ 阅读时长估算
   - 分隔线用 `border-b border-slate-100` 替代卡片阴影

3. 「查看全部」链接保留

### 文章页（`page.html`）

结构不变（TOC + 正文 + 右侧占位三列），调整：
- TOC 样式与 Navbar 风格统一（去掉多余 border 颜色，用 amber 高亮当前节）
- `prose` 排版继承 `style.css` 中已有的 typography 配置

### CSS（`boring/css/style.css`）

1. **修复 merge conflict**：保留 HEAD 版本（已有 typography、dark mode、TOC active、锁定 badge 样式）
2. 删除 `<<<<<<< HEAD` / `=======` / `>>>>>>>` 标记
3. 无其他 CSS 新增；Navbar 和 Hero 样式直接用 Tailwind 类写在模板里

### 暗色模式

保持现有 `dark:` 前缀方案，Navbar 新增：
- `dark:bg-slate-900 dark:border-slate-800`
- Hero 区 `dark:text-slate-300` / `dark:text-slate-500`

### 强调色

保持现有琥珀黄：`amber-400` / `amber-500`，badge 用 `bg-yellow-100 text-amber-700`

## 文件修改清单

| 文件 | 类型 |
|------|------|
| `boring/templates/base.html` | 新增 Navbar，调整 body 结构 |
| `boring/templates/index.html` | 重写 Hero + 文章列表区 |
| `boring/templates/macros.html` | 视情况微调 header macro |
| `boring/css/style.css` | 修复 merge conflict |

## 不在范围内

- `section.html`（分类页）不改
- `tailwind.config.js` 不改
- 不添加新 JS 功能
- 不修改 OG 图生成逻辑
