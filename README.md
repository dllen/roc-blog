# Roc's Blog

这是一个使用 [Zola](https://www.getzola.org/) 静态网站生成器创建的个人博客，并通过 Cloudflare Pages 进行部署和托管。

## 项目概述

- **博客名称**: Roc's Blog
- **博客描述**: 语法 语义 语用
- **主题**: 使用了自定义的 "boring" 主题

## 目录结构

```
roc-blog/
├── boring/                # 主题目录
│   ├── config.toml        # 主题配置文件
│   ├── content/           # 博客内容目录
│   │   └── blog/          # 博客文章
│   ├── css/               # 样式文件
│   ├── static/            # 静态资源
│   │   ├── fonts/         # 字体文件
│   │   ├── js/            # JavaScript 文件
│   │   └── line-awesome/  # 图标库
│   └── templates/         # 模板文件
└── solar-theme-zola/      # 另一个主题目录（备用）
```

## 快速开始

### 本地开发

1. 安装 [Zola](https://www.getzola.org/documentation/getting-started/installation/)

2. 克隆此仓库
   ```bash
   git clone https://github.com/yourusername/roc-blog.git
   cd roc-blog
   ```

3. 启动本地开发服务器
   ```bash
   cd boring
   zola serve
   ```
   
   或者使用提供的脚本
   ```bash
   ./start.sh
   ```

4. 在浏览器中访问 `http://127.0.0.1:1111` 查看博客

### 添加新文章

1. 在 `boring/content/blog/` 目录下创建新的 Markdown 文件
2. 添加必要的前置元数据
   ```markdown
   +++
   title = "文章标题"
   date = 2023-01-01
   +++

   文章内容...
   ```

## 部署到 Cloudflare Pages

### 自动部署

1. 在 Cloudflare Pages 中创建新项目
2. 连接到您的 GitHub 仓库
3. 设置构建配置:
   - 构建命令: `cd boring && zola build`
   - 输出目录: `boring/public`
4. 部署!

### 手动部署

1. 构建静态文件
   ```bash
   cd boring
   zola build
   ```

2. 将 `public` 目录中的文件上传到 Cloudflare Pages

## 自定义

### 修改配置

编辑 `boring/config.toml` 文件来更改网站标题、描述和其他设置。

### 修改主题

主题文件位于 `boring/templates/` 和 `boring/css/` 目录中。

## 许可证

请参阅 `boring/LICENSE` 文件了解详情。