# Roc's Blog

这是一个使用 [Zola](https://www.getzola.org/) 静态网站生成器创建的个人博客，并通过 Cloudflare Pages 进行部署和托管。

## 项目概述

- **博客名称**: Roc's Blog
- **博客描述**: 语法 语义 语用
- **主题**: 使用了自定义的 "boring" 主题

## 目录结构

```
roc-blog/
├── boring/                # 自定义主题目录（fork of ssiyad/boring）
│   ├── config.toml        # Zola + 主题配置
│   ├── content/           # 博客内容
│   │   └── blog/          # 所有文章（348+ 篇）
│   ├── css/               # 样式源（PostCSS 入口）
│   ├── scripts/           # 构建/审计/迁移脚本（Node）
│   ├── static/            # 静态资源 + 生成产物（fonts/js/og/css）
│   ├── templates/         # Tera 模板
│   └── tests/             # site-output 集成测试
├── themes/boring/         # 上游主题（git submodule，仅参考）
├── docs/                  # 功能文档
└── scripts/ci-local.sh    # 本地模拟 CI 的脚本
```

## 快速开始

### 前置依赖

- **Node 22** (核心引擎；启用 `corepack`)
- **Python 3.11** + `fonttools==4.47.0` + `brotli==1.1.0`（字体子集化）
- **[Zola](https://www.getzola.org/documentation/getting-started/installation/) v0.23+**

### 本地开发

1. 克隆并初始化
   ```bash
   git clone https://github.com/yourusername/roc-blog.git
   cd roc-blog
   git submodule update --init   # themes/boring
   ```

2. 安装前端依赖
   ```bash
   cd boring
   corepack enable
   yarn install
   pip install fonttools==4.47.0 brotli==1.1.0   # 一次性，用于 yarn build 时的字体构建
   ```

3. 构建资源（首次必须；之后改 CSS 用 `yarn watch`）
   ```bash
   yarn build     # 重建相关阅读索引 + PostCSS (css/style.css → static/css/style.css)
   ```

4. 启动本地开发服务器
   ```bash
   bash start.sh  # 内部执行 zola serve --interface 0.0.0.0 --base-url /
   # 或: zola serve
   ```

5. 浏览器访问 `http://127.0.0.1:1111`

### 添加新文章

文章以 Markdown 存放于 `boring/content/blog/`（或子目录如 `flink/`、`spring/`）。**前置元数据使用 YAML（`---`）**——TOML (`+++`) 已被迁移，可用 `node scripts/migrate-toml-to-yaml.mjs` 一键转换。

```markdown
---
title: "文章标题"
date: 2026-08-25
description: "80–160 字摘要（推荐）"
taxonomies:
  tags: ["Kafka", "分布式"]
---

文章正文…
```

字段约定：
- 文章页：标签必须写在 `taxonomies.tags`（主题只读这一处）；最多 6 个。
- 排序固定按 `date`；`extra.update_date` 只影响列表页显示日期。
- 新增分区（子目录）必须在 `config.toml` 的 `[extra] nav_sections` 注册，否则不会出现在导航栏。

### 加密文章（可选）

在 frontmatter 加 `password: "..."` 即可对单篇文章启用密码保护（基于 StaticShield 的浏览器端加密）。详见 [docs/features/encryption.md](docs/features/encryption.md)。

## 部署

### 自动部署（CI）

`.github/workflows/build.yml` 在 push 到 `main` 时自动执行：

1. `yarn install`
2. `bash scripts/build-fonts.sh`（字体子集化）
3. `yarn build`（PostCSS + 相关索引）
4. `yarn test` + `yarn audit`
5. 生成 OG 图片 + 清理孤儿 OG
6. `zola build -o roc-blog --force`
7. 部署到 `release` 分支（force_orphan）

### 手动部署

```bash
cd boring
bash build.sh   # zola build -o roc-blog + 可选 encrypt-posts.mjs
```

将 `boring/roc-blog/` 目录的内容上传到 Cloudflare Pages（或其它静态托管）。Cloudflare Pages 项目设置：
- 构建命令: `cd boring && zola build`
- 输出目录: `boring/public`（裸 `zola build` 默认）或 `boring/roc-blog`（项目 `build.sh` 输出）

## 常用命令速查（均在 `boring/` 下执行）

```bash
yarn install             # 一次性
yarn build               # 相关索引 + PostCSS
yarn watch               # PostCSS --watch
yarn test                # 单元测试（scripts/、scripts/lib/、static/js/）
yarn test:site           # 集成测试（需先 `zola build -o roc-blog --force`）
yarn audit               # frontmatter 完整性报告 → _audit/frontmatter-audit.md
yarn og                  # 生成 OG 图片
bash scripts/build-fonts.sh          # 字体子集化
bash start.sh                        # 本地服务（kill 旧 zola，监听 0.0.0.0:1111）
bash build.sh                        # zola build + 可选加密
bash scripts/ci-local.sh             # 本地完整模拟 CI（从仓库根目录执行）
```

## 自定义

### 修改配置

编辑 `boring/config.toml` 调整站点标题、描述、taxonomy、`[extra] nav_sections`、URL 等。

### 修改主题

| 文件 | 作用 |
|---|---|
| `templates/base.html` | 根布局（`<head>`、导航、底部） |
| `templates/index.html` | 首页 |
| `templates/section.html` | 分类列表（含分页） |
| `templates/page.html` | 文章详情（OG、TOC、进度条、上下篇） |
| `templates/components.html` | Tera v2 `{% component %}` 可复用块 |
| `css/style.css` | 样式入口（PostCSS：imports → Tailwind → autoprefixer → cssnano） |
| `static/js/*.js` | 全站 JS（dark mode / 搜索 / 阅读功能） |

主题开发参考上游：[ssiyad/boring](https://github.com/ssiyad/boring)，也在 `themes/boring/` 子模块中。

## 许可证

请参阅 `boring/LICENSE` 文件了解详情。