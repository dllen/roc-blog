# UI 极简重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将博客全站视觉风格改为现代极简——新增全局 sticky Navbar，去掉全屏 Hero 图片，改为 compact 顶部介绍区 + 轻卡片文章列表，修复 CSS merge conflict。

**Architecture:** 在 `base.html` 中注入全局 Navbar（站名 + 导航链接 + 暗色切换），`macros::header` 保留为文章页面的面包屑子导航栏（去掉重复的暗色切换），`index.html` 完全重写首页布局。CSS 只做 merge conflict 修复，Navbar/Hero 样式全部用 Tailwind 类内联写在模板里。

**Tech Stack:** Zola (Tera 模板引擎), Tailwind CSS (JIT), Line Awesome 图标

---

## 文件修改清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `boring/css/style.css` | 修改 | 删除 merge conflict 标记，保留 HEAD 内容 |
| `boring/templates/base.html` | 修改 | 注入全局 sticky Navbar，移除裸 `<section>` |
| `boring/templates/macros.html` | 修改 | `header()` 去掉暗色切换和 `nav()` 调用；删除 `nav()` 宏 |
| `boring/templates/index.html` | 重写 | compact Hero + 轻卡片文章列表 |

---

### Task 1：修复 style.css merge conflict

**Files:**
- Modify: `boring/css/style.css`

- [ ] **Step 1：确认 conflict 位置**

```bash
grep -n "<<<<<<\|=======\|>>>>>>>" boring/css/style.css
```

预期输出：第 9 行附近有 `<<<<<<< HEAD`。

- [ ] **Step 2：编辑文件，删除 conflict 标记**

将 `boring/css/style.css` 修改为以下内容（保留 HEAD 版本，删除所有冲突标记）：

```css
@import './base.css';
@import './fonts.css';

/* Override typography plugin default max-width for content blocks */
.prose {
  max-width: 100% !important;
  width: 100%;
}

/* ===== Reading experience: typography + dark mode ===== */
.prose { line-height: 1.75; }
.prose p { margin: 1.25em 0; }
.prose h2 { font-size: 1.875rem; margin-top: 2.5em; margin-bottom: 1em; }
.prose h3 { font-size: 1.5rem;   margin-top: 2em;   margin-bottom: 0.75em; }
.prose h4 { font-size: 1.25rem;  margin-top: 1.5em;  margin-bottom: 0.5em; }
.prose blockquote {
  border-left: 4px solid #fbbf24;
  padding-left: 1em;
  font-style: italic;
  color: #475569;
  margin: 1.5em 0;
}
.prose code:not(pre code) {
  background: #f1f5f9;
  color: #e11d48;
  padding: 0.125em 0.375em;
  border-radius: 0.25em;
  font-size: 0.875em;
}
.prose pre {
  background: #0f172a;
  color: #f1f5f9;
  padding: 1em;
  border-radius: 0;
  overflow-x: auto;
  font-size: 0.875em;
  line-height: 1.6;
}
.prose table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
.prose th, .prose td { border: 1px solid #e2e8f0; padding: 0.5em 0.75em; }
.prose th { background: #f8fafc; font-weight: bold; }
.prose tr:hover { background: #f8fafc; }
.prose img { max-width: 100%; height: auto; border-radius: 0.25em; }
.prose ul, .prose ol { padding-left: 1.5em; margin: 1em 0; }
.prose li { margin: 0.4em 0; }

/* Dark mode */
.dark .prose blockquote { border-color: #818cf8; color: #cbd5e1; }
.dark .prose code:not(pre code) { background: #1e293b; color: #fb7185; }
.dark .prose pre { background: #020617; }
.dark .prose th, .dark .prose td { border-color: #334155; }
.dark .prose th { background: #1e293b; }
.dark .prose tr:hover { background: #1e293b; }
.dark .prose img { opacity: 0.9; }

/* TOC active state */
[data-toc-id][data-active] {
  border-color: #fbbf24 !important;
  color: #d97706 !important;
  font-weight: bold;
}

/* === Encrypted-post lock badges === */
.post-locked {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.15em;
  fill: currentColor;
  margin-right: 0.3em;
  opacity: 0.7;
}
.post-locked-badge {
  font-size: 0.85em;
  opacity: 0.7;
  margin-left: 0.25em;
  user-select: none;
}
```

- [ ] **Step 3：验证无 conflict 标记残留**

```bash
grep -c "<<<<<<\|=======\|>>>>>>>" boring/css/style.css
```

预期输出：`0`

- [ ] **Step 4：Commit**

```bash
git add boring/css/style.css
git commit -m "fix: resolve merge conflict in style.css"
```

---

### Task 2：更新 base.html — 注入全局 Navbar

**Files:**
- Modify: `boring/templates/base.html`

- [ ] **Step 1：将 base.html 替换为以下内容**

```html
<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
    <head>
        <meta charset="utf-8">

        {% set gtag_id = config.extra.google_analytics_measurement_id %}
        {% if gtag_id %}
            <!-- Google tag (gtag.js) -->
            <script async src="https://www.googletagmanager.com/gtag/js?id={{ gtag_id }}"></script>
            <script>
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag("js", new Date());
                gtag("config", "{{ gtag_id }}");
            </script>
        {% endif %}

        <link rel="stylesheet" href="/css/style.css"/>
        <link rel="stylesheet" href="/line-awesome/css/line-awesome.min.css"/>
        <script src="/js/main.js" defer></script>
        <link rel="alternate" type="application/atom+xml" title="{{ config.title }}"
              href="{{ get_url(path='blog/atom.xml', trailing_slash=false) | safe }}">
        {% block head_extend %}{% endblock %}
        {% block jsonld %}{% endblock %}
    </head>

    <body class="bg-white dark:bg-slate-900 transition ease-in-out">
        <nav class="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
            <div class="max-w-2xl mx-auto px-4 flex items-center justify-between h-12">
                <a href="/" class="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-amber-500 dark:hover:text-amber-400 transition">
                    {{ config.title }}
                </a>
                <div class="flex items-center gap-5">
                    {% if config.extra.nav_sections %}
                        {% for section in config.extra.nav_sections %}
                            <a href="{{ section.url | safe }}"
                               class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition">
                                {{ section.name }}
                            </a>
                        {% endfor %}
                    {% endif %}
                    <a href="/blog/atom.xml"
                       class="text-sm text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition"
                       title="RSS">
                        <i class="las la-rss"></i>
                    </a>
                    <div id="darkmode-toggle" class="cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition">
                        <div class="hidden dark:inline"><i class="las la-sun"></i></div>
                        <div class="inline dark:hidden"><i class="las la-moon"></i></div>
                    </div>
                </div>
            </div>
        </nav>
        {% block content %}{% endblock %}
        {% block body_extra %}{% endblock %}
    </body>
</html>
```

- [ ] **Step 2：Commit**

```bash
git add boring/templates/base.html
git commit -m "feat: add global sticky navbar to base.html"
```

---

### Task 3：更新 macros.html — 精简 header()，删除 nav()

**Files:**
- Modify: `boring/templates/macros.html`

说明：`base.html` 已有全局 Navbar（含暗色切换）。`macros::header` 在文章/列表页用作面包屑子导航栏，需删除重复的暗色切换和 `nav()` 调用。`nav()` 宏本身也可删除（功能已并入全局 Navbar）。

- [ ] **Step 1：将 macros.html 开头的 nav() 宏和 header() 宏替换**

将文件中从开头到 `{% endmacro head %}` 的部分（当前约 1–55 行）替换为以下内容：

```html
{% macro header(components, is_page) %}
    <div class="sticky top-12 z-40 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <div class="max-w-2xl mx-auto px-4 flex items-center gap-1 h-10 font-sans text-sm text-slate-500 dark:text-slate-400">
            <a href="/" class="hover:text-slate-900 dark:hover:text-slate-100 transition">~</a>
            {% set_global rel_url = "/" %}
            {% for component in components %}
                {% set_global rel_url = rel_url ~ component ~ '/' %}
                <span class="mx-0.5">/</span>
                {% if not loop.last %}
                    <a class="hover:text-slate-900 dark:hover:text-slate-100 transition"
                       href="{{ rel_url }}">{{ component }}</a>
                {% elif is_page %}
                    <span class="text-slate-400 dark:text-slate-500 truncate max-w-xs">{{ component }}</span>
                {% else %}
                    <span class="text-slate-700 dark:text-slate-200">{{ component }}</span>
                {% endif %}
            {% endfor %}
            <div id="back-to-top" class="hidden cursor-pointer ml-auto">
                <i class="las la-level-up-alt"></i>
            </div>
        </div>
    </div>
{% endmacro header %}
```

注意：保留文件中 `prev_next`、`related` 等其余宏不变。

- [ ] **Step 2：确认 nav() 宏已删除，header() 宏调用无误**

```bash
grep -n "macro nav\|macros::nav" boring/templates/macros.html boring/templates/page.html boring/templates/section.html 2>/dev/null
```

预期：无任何输出（nav 宏已删，无处引用）。

- [ ] **Step 3：Commit**

```bash
git add boring/templates/macros.html
git commit -m "feat: simplify macros header to breadcrumb-only, remove nav macro"
```

---

### Task 4：重写 index.html — compact Hero + 轻卡片文章列表

**Files:**
- Modify: `boring/templates/index.html`

- [ ] **Step 1：将 index.html 替换为以下内容**

```html
{% extends "base.html" %}

{% block head_extend %}
    <title>Home | {{ config.title }}</title>
{% endblock head_extend %}

{% block jsonld %}
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "{{ config.title }}",
      "url": "{{ config.base_url }}",
      "description": "{{ config.description }}",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "{{ config.base_url }}/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
    </script>
{% endblock jsonld %}

{% block content %}
<div class="max-w-2xl mx-auto px-4">

    {# Compact Hero #}
    <div class="py-10 border-b border-slate-100 dark:border-slate-800">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">
            {{ config.extra.homepage_title }}
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {{ config.extra.homepage_subtitle }}
        </p>
        {% if config.extra.social %}
            <div class="flex gap-3 text-slate-400 dark:text-slate-500">
                {% for i in config.extra.social %}
                    <a href="{{ i.url }}" target="_blank"
                       class="hover:text-amber-500 dark:hover:text-amber-400 transition text-lg">
                        <i class="{{ i.icon }}"></i>
                    </a>
                {% endfor %}
            </div>
        {% endif %}
    </div>

    {# 文章列表 #}
    {% set blog = get_section(path='blog/_index.md') %}
    {% if blog and blog.pages %}
        {% set limit = config.extra.homepage_latest_limit | default(value=10) %}
        {% set latest = blog.pages | sort(attribute="date", reverse=true) %}

        <div class="mt-6 mb-4">
            <span class="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">最近更新</span>
        </div>

        <ul>
            {% for p in latest | slice(end=limit) %}
                <li class="border-b border-slate-100 dark:border-slate-800">
                    <a href="{{ p.permalink | safe }}" class="block py-4 group">
                        <div class="flex items-baseline justify-between gap-3 mb-1">
                            <span class="text-sm font-semibold text-slate-900 dark:text-slate-100
                                         group-hover:text-amber-600 dark:group-hover:text-amber-400 transition leading-snug">
                                {{ p.title }}
                            </span>
                            <span class="text-xs text-slate-400 dark:text-slate-500 shrink-0">
                                {{ p.extra.update_date | default(value=p.date) | date(format="%Y-%m-%d") }}
                            </span>
                        </div>
                        {% set desc = p.description | default(value="") %}
                        {% if desc %}
                            <p class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2">
                                {{ desc }}
                            </p>
                        {% endif %}
                        <div class="flex items-center gap-2">
                            {% if p.taxonomies and p.taxonomies.tags %}
                                {% for tag in p.taxonomies.tags | slice(end=2) %}
                                    <span class="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                                        {{ tag }}
                                    </span>
                                {% endfor %}
                            {% endif %}
                            {% if p.reading_time %}
                                <span class="text-xs text-slate-400 dark:text-slate-500">{{ p.reading_time }} min</span>
                            {% endif %}
                        </div>
                    </a>
                </li>
            {% endfor %}
        </ul>

        <div class="py-6">
            <a href="/blog/" class="text-sm text-slate-500 dark:text-slate-400
                                    hover:text-slate-900 dark:hover:text-slate-100 transition">
                查看全部 ({{ blog.pages | length }} 篇) →
            </a>
        </div>
    {% endif %}
</div>
{% endblock content %}
```

- [ ] **Step 2：Commit**

```bash
git add boring/templates/index.html
git commit -m "feat: rewrite homepage with compact hero and minimal post list"
```

---

### Task 5：本地构建验证

- [ ] **Step 1：安装依赖（如尚未安装）**

```bash
cd boring && yarn install
```

- [ ] **Step 2：构建 CSS**

```bash
cd boring && yarn build:css
```

预期：`boring/static/css/style.css` 更新，无报错。

- [ ] **Step 3：启动 Zola dev server 检查页面**

```bash
cd boring && zola serve
```

在浏览器中访问：
- `http://127.0.0.1:1111/` — 首页：确认 Navbar 显示、compact Hero、文章列表卡片
- `http://127.0.0.1:1111/blog/` — 列表页：确认 Navbar + 面包屑子导航
- 任意一篇文章 — 确认 Navbar + 面包屑 + TOC + 正文排版正常
- 切换暗色模式：确认 Navbar 暗色样式、文章页暗色正常

- [ ] **Step 4：确认无重复暗色切换按钮**

在文章页面，页面中应只有 1 个月亮/太阳图标（位于顶部 Navbar）。

- [ ] **Step 5：Final commit**

```bash
git add -A
git commit -m "chore: verify minimal redesign build"
```
