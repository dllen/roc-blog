# 文章页赞赏（Tipping）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在博客每篇文章页的最末尾加一个默认收起、点开后展示微信/支付宝二维码的「赞赏」面板，文案与渠道由 `config.toml` 配置，支持逐篇关闭。

**Architecture:** 纯构建期实现：`config.toml` 的 `[extra.tipping]` → `components.html` 里的 Tera 组件 `tipping(tip: map)` → `page.html` 在相关阅读之后、`</article>` 之前调用。交互用原生 `<details>/<summary>`，零 JS。二维码由本地 Pillow 脚本从两张品牌整图裁出、量化成 384×384 PNG 放进 `static/img/tip/`。

**Tech Stack:** Zola 0.23+（Tera 2 components）、PostCSS/Tailwind（仅既有管道）、Node 22 原生 test runner + JSDOM、Python 3 + Pillow（仅本地裁图）。

**Spec:** [docs/superpowers/specs/2026-11-06-tipping-feature-design.md](../specs/2026-11-06-tipping-feature-design.md)

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `boring/assets/tipping/wechat-source.jpeg` | 微信收款码原图（开发期资源，不进产物） | 移动自仓库根目录 `wx.jpeg` |
| `boring/assets/tipping/alipay-source.jpeg` | 支付宝收款码原图 | 移动自仓库根目录 `zfb.jpeg` |
| `boring/scripts/tipping-qr.py` | 从原图裁二维码并输出量化 PNG（人工按需运行） | 新建 |
| `boring/static/img/tip/wechat-qr.png` | 站点实际使用的微信二维码 | 由脚本生成并提交 |
| `boring/static/img/tip/alipay-qr.png` | 站点实际使用的支付宝二维码 | 由脚本生成并提交 |
| `boring/config.toml` | `[extra.tipping]` 文案与渠道配置 | 追加 |
| `boring/templates/components.html` | `tipping` 组件（输入 `tip` map，输出 HTML） | 追加 |
| `boring/templates/page.html` | 调用点（守卫 + 组件调用） | 修改 1 处 |
| `boring/css/style.css` | `.tip*` 样式（浅色/深色/窄屏/打印） | 追加 |
| `boring/static/_headers` | `/img/tip/*` 长缓存 | 追加 |
| `boring/tests/site-output.test.mjs` | 站点输出断言（4 条） | 追加 + 改 import |

所有命令的工作目录都是 `boring/`（除 git 命令在仓库根目录）。

---

### Task 1: 收款码原图入库 + 裁图脚本 + 生成二维码 PNG

**Files:**
- Create: `boring/assets/tipping/wechat-source.jpeg`（由 `wx.jpeg` 移入）
- Create: `boring/assets/tipping/alipay-source.jpeg`（由 `zfb.jpeg` 移入）
- Create: `boring/scripts/tipping-qr.py`
- Create: `boring/static/img/tip/wechat-qr.png`、`boring/static/img/tip/alipay-qr.png`（脚本产物）

- [x] **Step 1: 把两张原图移进 assets，确认根目录不再有裸图**

Run（仓库根目录）:
```bash
mkdir -p boring/assets/tipping
mv wx.jpeg boring/assets/tipping/wechat-source.jpeg
mv zfb.jpeg boring/assets/tipping/alipay-source.jpeg
ls -la boring/assets/tipping
```
Expected: 两个 jpeg（约 120KB、339KB），仓库根目录 `ls wx.jpeg zfb.jpeg` 报 No such file。

- [x] **Step 2: 写裁图脚本 `boring/scripts/tipping-qr.py`**

```python
#!/usr/bin/env python3
"""从"微信支付 / 支付宝"收款码整图里裁出二维码方块。

用法（在 boring/ 目录下）：
    python3 scripts/tipping-qr.py

输入：assets/tipping/wechat-source.jpeg、assets/tipping/alipay-source.jpeg
输出：static/img/tip/wechat-qr.png、static/img/tip/alipay-qr.png（384×384，调色板 PNG）

算法：
1. 亮度阈值取深色掩码（二维码模块）
2. 膨胀合并模块 + 连通域，挑最接近正方形（宽高比 0.75–1.35）且面积最大的候选
3. 候选内部深色像素的紧包围盒 → 外扩 7.5% 作为 quiet zone
4. 白底合成 → 384×384 → 调色板量化 → PNG optimize
"""

from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "assets" / "tipping"
OUTPUT_DIR = ROOT / "static" / "img" / "tip"
OUTPUT_SIZE = 384
QUIET_ZONE = 0.075
SIZE_BUDGET = 60 * 1024

CHANNELS = {
    "wechat": "wechat-source.jpeg",
    "alipay": "alipay-source.jpeg",
}


def dilate(mask: np.ndarray, iterations: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(iterations):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def connected_components(mask: np.ndarray):
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            area = 0
            y0 = y1 = y
            x0 = x1 = x
            while stack:
                cy, cx = stack.pop()
                area += 1
                y0, y1 = min(y0, cy), max(y1, cy)
                x0, x1 = min(x0, cx), max(x1, cx)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            yield area, x0, y0, x1, y1


def find_qr_box(image: Image.Image, scale: int = 2) -> tuple[int, int, int, int]:
    width, height = image.size
    small = np.asarray(
        image.resize((width // scale, height // scale), Image.BILINEAR)
    ).astype(np.int16)
    dark = small.max(axis=2) < 100
    merged = dilate(dark, 7)

    best = None
    for area, x0, y0, x1, y1 in connected_components(merged):
        box_width, box_height = x1 - x0 + 1, y1 - y0 + 1
        if box_width < 40 or box_height < 40:
            continue
        if not 0.75 < box_width / box_height < 1.35:
            continue
        if best is None or box_width * box_height > best[0]:
            best = (box_width * box_height, (x0, y0, x1, y1))

    if best is None:
        raise SystemExit(f"no square QR candidate found in {image.size}")

    x0, y0, x1, y1 = best[1]
    sub = dark[y0:y1 + 1, x0:x1 + 1]
    ys, xs = np.nonzero(sub)
    left = (int(xs.min()) + x0) * scale
    right = (int(xs.max()) + 1 + x0) * scale
    top = (int(ys.min()) + y0) * scale
    bottom = (int(ys.max()) + 1 + y0) * scale
    return left, top, right, bottom


def crop_square(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = box
    side = int(round(max(right - left, bottom - top) * (1 + 2 * QUIET_ZONE)))
    center_x = (left + right) // 2
    center_y = (top + bottom) // 2
    x0 = center_x - side // 2
    y0 = center_y - side // 2
    crop = image.crop((x0, y0, x0 + side, y0 + side))
    canvas = Image.new("RGB", crop.size, "white")
    canvas.paste(crop, (0, 0))
    return canvas.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS)


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    over_budget = []

    for name, source_name in CHANNELS.items():
        source = SOURCE_DIR / source_name
        if not source.exists():
            raise SystemExit(f"missing source image: {source}")
        image = Image.open(source).convert("RGB")
        qr = crop_square(image, find_qr_box(image))
        target = OUTPUT_DIR / f"{name}-qr.png"
        qr.convert("P", palette=Image.ADAPTIVE, colors=64).save(
            target, format="PNG", optimize=True
        )
        size = target.stat().st_size
        print(f"{target.relative_to(ROOT)}  {size / 1024:.1f} KB")
        if size > SIZE_BUDGET:
            over_budget.append(target.name)

    if over_budget:
        raise SystemExit(
            f"over budget (>{SIZE_BUDGET // 1024} KB): {', '.join(over_budget)}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [x] **Step 3: 运行脚本生成二维码 PNG**

Run（`boring/`）:
```bash
python3 scripts/tipping-qr.py
```
Expected: 两行输出，体积都 ≤ 60KB，例如
```
static/img/tip/wechat-qr.png  22.4 KB
static/img/tip/alipay-qr.png  18.9 KB
```
退出码 0。（若 Pillow 未安装：`python3 -m pip install pillow numpy`。）

- [x] **Step 4: 目视确认两张裁图正确**

用 read_image 打开 `boring/static/img/tip/wechat-qr.png` 与 `alipay-qr.png`：应为**完整、居中、四周有白边的二维码**，没有残留的绿底/蓝底或"王二小(**鹏)"文字。

- [x] **Step 5: 提交**

Run（仓库根目录）:
```bash
git add boring/assets/tipping boring/scripts/tipping-qr.py boring/static/img/tip
git commit -m "feat(tipping): 收款码原图入库 + 裁图脚本与二维码产物"
```
Expected: 提交包含 2 张 jpeg、1 个 py、2 个 png。

---

### Task 2: 在 config.toml 里配置文案与渠道

**Files:**
- Modify: `boring/config.toml`（文件末尾，`[[extra.social]]` 之后追加）

- [x] **Step 1: 追加配置**

在 `boring/config.toml` 末尾（最后一个 `[[extra.social]]` 块之后）追加：

```toml
# 文章页页尾赞赏（Tipping）。enabled = false 可全站关闭；
# 单篇文章可在 frontmatter 用 extra.tipping = false 单独关闭。
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

- [x] **Step 2: 验证 TOML 能被 Zola 解析**

Run（`boring/`）:
```bash
zola build -o roc-blog --force 2>&1 | tail -5
```
Expected: 无 `Failed to parse` / `unknown field` 报错。（此时页面还没改动，赞赏块不会出现。）

- [x] **Step 3: 提交**

Run（仓库根目录）:
```bash
git add boring/config.toml
git commit -m "feat(tipping): config.toml 增加 [extra.tipping] 文案与渠道配置"
```

---

### Task 3: 先写失败的集成测试

**Files:**
- Modify: `boring/tests/site-output.test.mjs`（第 2 行 import + 文件末尾追加 4 条 test）

- [x] **Step 1: 扩展 import**

把第 2 行

```js
import { readFile, readdir } from 'node:fs/promises';
```

改成

```js
import { readFile, readdir, stat } from 'node:fs/promises';
```

- [x] **Step 2: 在测试文件末尾追加 4 条测试**

```js
test('article pages end with the tipping panel after related posts', async () => {
    const { dom } = await findFirstHomepageArticle();
    const document = dom.window.document;

    const article = document.querySelector('article.article-main');
    const tip = document.querySelector('details.tip');
    const related = document.querySelector('.related-section');

    assert.ok(article, 'article main column must exist');
    assert.ok(tip, 'tipping details block must exist');
    assert.ok(related, 'related section must exist');
    assert.ok(article.contains(tip), 'tipping block must live inside the article column');
    assert.ok(
        related.compareDocumentPosition(tip) & 4,
        'tipping block must follow the related section in document order'
    );
});

test('tipping panel exposes both payment channels with accessible QR images', async () => {
    const { dom } = await findFirstHomepageArticle();
    const document = dom.window.document;

    const trigger = document.querySelector('details.tip > summary.tip__trigger');
    assert.ok(trigger, 'tipping trigger must be a summary element');
    assert.match(trigger.textContent, /赞赏/);

    const images = [...document.querySelectorAll('details.tip img.tip__qr')];
    assert.equal(images.length, 2, 'two payment channels must be rendered');
    assert.deepEqual(
        images.map((img) => img.getAttribute('src')),
        ['/img/tip/wechat-qr.png', '/img/tip/alipay-qr.png']
    );

    for (const img of images) {
        assert.ok((img.getAttribute('alt') || '').length > 0, 'QR image needs alt text');
        assert.equal(img.getAttribute('loading'), 'lazy', 'QR image must lazy load');
        assert.equal(img.getAttribute('width'), '384');
        assert.equal(img.getAttribute('height'), '384');
    }
});

test('tipping assets exist in the built output and stay under the size budget', async () => {
    for (const name of ['wechat-qr.png', 'alipay-qr.png']) {
        const { size } = await stat(new URL(`img/tip/${name}`, outputDirectory));
        assert.ok(size > 0, `${name} must not be empty`);
        assert.ok(size <= 60 * 1024, `${name} must stay under 60 KB (got ${size} bytes)`);
    }
});

test('tipping styles ship in the generated stylesheet', async () => {
    const css = await readFile(new URL('css/style.css', outputDirectory), 'utf8');

    assert.ok(css.includes('.tip__trigger'), 'tipping trigger styles must ship');
    assert.ok(css.includes('.tip__channel'), 'tipping channel card styles must ship');
});
```

- [x] **Step 3: 跑测试，确认按预期失败**

Run（`boring/`）:
```bash
zola build -o roc-blog --force >/dev/null && yarn test:site
```
Expected: 3 条失败（`article pages end with…`、`tipping panel exposes…`、`tipping styles ship…`），`tipping assets exist…` 通过（Task 1 已产出图片）。

- [x] **Step 4: 提交测试**

Run（仓库根目录）:
```bash
git add boring/tests/site-output.test.mjs
git commit -m "test(tipping): 站点输出断言（面板位置/渠道/体积/样式）"
```

---

### Task 4: 模板组件 + 文章页调用点

**Files:**
- Modify: `boring/templates/components.html`（文件末尾追加组件）
- Modify: `boring/templates/page.html:104-106`（`{{<related …/>}}` 之后插入调用）

- [x] **Step 1: 在 `components.html` 末尾追加 `tipping` 组件**

```tera
{# 文章页页尾赞赏：原生 details，零 JS。文案/渠道都由 config.extra.tipping 驱动 #}
{% component tipping(tip: map) %}
<details class="tip">
    <summary class="tip__trigger">
        <span class="tip__trigger-label">{{ tip.trigger | default(value="赞赏") }}</span>
        <span class="tip__chevron" aria-hidden="true"></span>
    </summary>
    <div class="tip__panel">
        {% if tip.lead %}
            <p class="tip__lead">{{ tip.lead }}</p>
        {% endif %}
        <ul class="tip__channels">
            {% for channel in tip.channels %}
                {% if channel.image %}
                    <li class="tip__channel">
                        <img class="tip__qr"
                             src="{{ get_url(path=channel.image) | safe }}"
                             alt="{{ channel.alt | default(value=channel.label) }}"
                             width="384"
                             height="384"
                             loading="lazy"
                             decoding="async">
                        <p class="tip__channel-label">{{ channel.label }}</p>
                        {% if channel.account %}
                            <p class="tip__account">{{ channel.account }}</p>
                        {% endif %}
                    </li>
                {% endif %}
            {% endfor %}
        </ul>
        {% if tip.note %}
            <p class="tip__note">{{ tip.note }}</p>
        {% endif %}
    </div>
</details>
{% endcomponent tipping %}
```

- [x] **Step 2: 在 `page.html` 插入调用点**

把

```tera
                {{<prev_next current={page}/>}}
                {{<related current={page} limit={3}/>}}
            </article>
```

改成

```tera
                {{<prev_next current={page}/>}}
                {{<related current={page} limit={3}/>}}

                {% if config.extra.tipping is defined and config.extra.tipping.enabled %}
                    {% set tip_channels = config.extra.tipping.channels | default(value=[]) %}
                    {% set tip_enabled_here = page.extra.tipping | default(value=true) %}
                    {% if tip_channels | length > 0 and tip_enabled_here %}
                        {{<tipping tip={config.extra.tipping}/>}}
                    {% endif %}
                {% endif %}
            </article>
```

> 说明：spec §5 写的是单表达式守卫；这里拆成 `set` + 嵌套 `if` 是为了让 Tera 对 "channels 缺失 / extra.tipping 缺失" 走 `default` 而不是抛 undefined 错误，行为与 spec 一致。

- [x] **Step 3: 重建并跑测试**

Run（`boring/`）:
```bash
zola build -o roc-blog --force 2>&1 | tail -5 && yarn test:site
```
Expected: 构建成功；`article pages end with…` 与 `tipping panel exposes…` 转为通过；只剩 `tipping styles ship…` 失败（样式还没加）。

若 Zola 报组件参数错误（Tera 不允许在组件调用里直接传嵌套的 config 值），退化方案：在 `page.html` 里先 `{% set tip_cfg = config.extra.tipping %}`，再 `{{<tipping tip={tip_cfg}/>}}`。

- [x] **Step 4: 提交**

Run（仓库根目录）:
```bash
git add boring/templates/components.html boring/templates/page.html
git commit -m "feat(tipping): 新增 tipping 组件并在文章页尾调用"
```

---

### Task 5: 样式（浅色/深色/窄屏/打印）

**Files:**
- Modify: `boring/css/style.css`（插在 `.related-grid__empty` 规则之后、`/* ───── search overlay ───── */` 注释之前）

- [x] **Step 1: 追加样式块**

在 `.related-grid__empty { ... }` 之后插入：

```css
/* ───────────────────────── tipping ───────────────────────── */
.tip {
  margin-top: var(--space-2xl);
  padding-top: var(--space-lg);
  border-top: var(--rule-hair) solid var(--color-rule);
  text-align: center;
}

.tip__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 44px;
  padding: var(--space-xs) var(--space-lg);
  border: var(--rule-hair) solid color-mix(in oklab, var(--color-accent) 40%, transparent);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-accent);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1;
  list-style: none;
  cursor: pointer;
  transition: background-color var(--dur-short) var(--ease-out),
    border-color var(--dur-short) var(--ease-out);
}

.tip__trigger::-webkit-details-marker {
  display: none;
}

.tip__trigger:hover {
  background: color-mix(in oklab, var(--color-accent) 8%, transparent);
  border-color: var(--color-accent);
}

.tip__trigger:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.tip__trigger-label {
  letter-spacing: 0.02em;
}

.tip__chevron {
  width: 7px;
  height: 7px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  transition: transform var(--dur-short) var(--ease-out);
}

.tip[open] .tip__chevron {
  transform: translateY(2px) rotate(225deg);
}

.tip__panel {
  max-width: 34rem;
  margin: var(--space-lg) auto 0;
}

.tip__lead {
  margin: 0 0 var(--space-lg);
  font-size: var(--text-sm);
  color: var(--color-ink-2);
}

.tip__channels {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tip__channel {
  flex: 0 0 11rem;
  padding: var(--space-sm);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: #fff; /* 二维码必须白底才稳定可扫，深色模式也不反色 */
  color: oklch(21.6% 0.006 56); /* 固定为浅色模式的 ink，避免深色模式下白底白字 */
  box-shadow: var(--shadow-card);
}

.tip__qr {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 2px;
}

.tip__channel-label {
  margin: var(--space-xs) 0 0;
  font-size: var(--text-xs);
  font-weight: 600;
}

.tip__account {
  margin: 2px 0 0;
  font-size: 0.6875rem;
  color: oklch(50.2% 0.018 67); /* 同理固定浅色 muted */
}

.tip__note {
  margin: var(--space-md) 0 0;
  font-size: 0.6875rem;
  color: var(--color-muted);
}

@media (max-width: 30rem) {
  .tip__channels {
    flex-direction: column;
    align-items: center;
  }

  .tip__channel {
    flex: none;
    width: 13rem;
  }
}

@media print {
  .tip {
    display: none;
  }
}
```

> 不需要额外写 `prefers-reduced-motion` 规则：`style.css` 末尾已有全局 `@media (prefers-reduced-motion: reduce)` 把 `transition-duration` 压到 0.01ms，箭头过渡自动失效。

- [x] **Step 2: 重跑 PostCSS 构建样式**

Run（`boring/`）:
```bash
yarn build
```
Expected: 无报错；`static/css/style.css` 体积增加（约 +1.5KB）。

- [x] **Step 3: 重建站点并跑全部测试**

Run（`boring/`）:
```bash
zola build -o roc-blog --force >/dev/null && yarn test:site
```
Expected: 全部通过（包括 `tipping styles ship in the generated stylesheet`）。

- [x] **Step 4: 提交**

Run（仓库根目录）:
```bash
git add boring/css/style.css boring/static/css/style.css
git commit -m "style(tipping): 赞赏面板样式（浅色/深色/窄屏/打印）"
```

---

### Task 6: 缓存头 + 全量回归

**Files:**
- Modify: `boring/static/_headers`（`/og/*` 之后追加）
- 无源码改动，执行全量校验

- [x] **Step 1: 追加 `/img/tip/*` 缓存规则**

在 `boring/static/_headers` 里 `/og/*` 块之后追加：

```
/img/tip/*
  Cache-Control: public, max-age=31536000, immutable
```

- [x] **Step 2: 全量构建 + 全部测试**

Run（`boring/`）:
```bash
yarn build && zola build -o roc-blog --force && yarn test && yarn test:site
```
Expected: `yarn test` 与 `yarn test:site` 都显示 `pass`、退出码 0。

- [x] **Step 3: 抽查生成结果**

Run（仓库根目录）:
```bash
grep -o '<details[^>]*tip[^>]*>' boring/roc-blog/blog/*/index.html | head -3
grep -o 'img/tip/[a-z]*-qr.png' boring/roc-blog/blog/*/index.html | head -2
```
Expected: 每个文章页 1 个带 `tip` 类的 `<details>`；图片路径为 `/img/tip/wechat-qr.png` 与 `/img/tip/alipay-qr.png`。（`minify_html = true`，属性引号可能被去掉，所以别按 `class="tip"` 精确匹配。）

- [x] **Step 4: 提交**

Run（仓库根目录）:
```bash
git add boring/static/_headers
git commit -m "chore(tipping): /img/tip/* 长缓存"
```

---

### Task 7: 人工验收

**Files:** 无（只验证，发现问题回到对应 Task）

- [ ] **Step 1: 起本地服务**

Run（`boring/`）:
```bash
bash start.sh
```
打开 `http://127.0.0.1:1111/`，进入任一文章，滚到最底部。

- [ ] **Step 2: 逐项核对**

- [ ] 页尾（相关阅读之后）出现 `赞赏 ▾`，默认收起
- [ ] 点击展开：一句导语 + 两张白底卡片（微信支付 / 支付宝 + 昵称）+ 脚注
- [ ] 再点一次收起；键盘 Tab 到触发器可按 Enter/Space 切换；有可见焦点环
- [ ] 切到深色模式：外框/文字可读，二维码仍白底
- [ ] 浏览器窗口缩到 375px：两张卡片竖排、无横向滚动
- [ ] 关闭浏览器 JS：面板仍能展开
- [ ] 手机微信扫微信码、支付宝扫支付宝码，能识别出收款方
- [ ] 打印预览（Cmd+P）：赞赏块不出现

- [ ] **Step 3: 验证开关**

- [ ] 临时把 `config.toml` 的 `enabled` 改成 `false`，`zola build -o roc-blog --force`，确认文章页无 `details.tip`；改回 `true`
- [ ] 临时给任一文章 frontmatter 加 `extra:
  tipping: false`，重建后该篇无 `details.tip`；验证完撤掉

- [ ] **Step 4: 如全部通过，向用户汇报验收结果与提交列表**

```bash
git log --oneline -6
```

---

## 完成标准

1. `yarn test`、`yarn test:site` 全绿
2. 任一文章页页尾有收起态「赞赏」，展开后两个二维码、深色/窄屏/无 JS 均可用
3. 两张二维码 ≤60KB 且真机可扫
4. 全局 `enabled=false` 与单篇 `extra.tipping: false` 都能干净关闭
5. 全部改动按 Task 分 6 次提交，无混入无关文件（`.superpowers/` 已在 .gitignore）

---

## 增量 v2：顶栏咖啡入口 + 全站弹窗（Tasks 8-10）

> 设计见 spec §13。行为：顶栏 `.site-actions` 咖啡图标 → 原生 `<dialog>` 弹窗（复用 `tipping` 组件）→ Esc / ✕ / 点遮罩关闭；文章页页尾面板不变。

### Task 8: 字体图标 `la-coffee`

**Files:**
- Modify: `boring/css/fonts.css`（第 57 行 `.la-search::before` 之后）
- Modify: `boring/scripts/build-fonts.sh`（`LA_SOLID_CODEPOINTS` 数组）
- Modify: `boring/scripts/lib/font-assets.test.mjs`（`iconCodepoints` map）
- Modify（重建）: `boring/static/fonts/la-solid-900-subset.woff2`

- [ ] **Step 1: 先补测试契约（故意让测试先红）**

`boring/scripts/lib/font-assets.test.mjs` 的 `iconCodepoints` map 中，`['la-tools', 'f7d9']` 那行后面加一行：

```js
    ['la-coffee', 'f0f4']
```

Run（`boring/`）:
```bash
python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install -q fonttools==4.47.0 brotli==1.1.0
PATH=/tmp/fontenv/bin:$PATH node --test scripts/lib/font-assets.test.mjs 2>&1 | grep -E '^not ok|missing' | head -5
```
Expected: FAIL —— `la-coffee (f0f4) is missing from build-fonts.sh`，且子集字体 cmap 缺 `F0F4`。

- [ ] **Step 2: 补 CSS 映射与字体子集清单**

`boring/css/fonts.css` 第 57 行后加：

```css
.la-coffee::before { content: "\f0f4"; }
```

`boring/scripts/build-fonts.sh` 的 `LA_SOLID_CODEPOINTS` 数组中，`'0xf7d9' # tools` 之前加：

```bash
  '0xf0f4' # coffee
```

- [ ] **Step 3: 重建字体子集**

Run（`boring/`，PATH 前置临时 venv，避免动全局 Python）:
```bash
PATH=/tmp/fontenv/bin:$PATH bash scripts/build-fonts.sh
```
Expected: `[fonts] done. Subset WOFF2 in static/fonts/`；`la-solid-900-subset.woff2` 体积略增（< 1KB）。

- [ ] **Step 4: 验证字形真的进了子集并跑字体测试**

Run（`boring/`）:
```bash
/tmp/fontenv/bin/python -c "from fontTools.ttLib import TTFont; f=TTFont('static/fonts/la-solid-900-subset.woff2'); print('F0F4' in {f'{c:04X}' for c in f.getBestCmap()})"
PATH=/tmp/fontenv/bin:$PATH node --test scripts/lib/font-assets.test.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Expected: `True`；`# pass` 全过、`# fail 0`。

- [ ] **Step 5: 提交**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/css/fonts.css boring/scripts/build-fonts.sh boring/scripts/lib/font-assets.test.mjs boring/static/fonts/la-solid-900-subset.woff2
git commit -m "feat(tipping): 顶栏图标所需的 la-coffee 字形与字体子集"
```

---

### Task 9: 测试先行（JS 单测 + 站点输出断言）

**Files:**
- Create: `boring/static/js/tipping.test.mjs`
- Modify: `boring/tests/site-output.test.mjs`

- [ ] **Step 1: 写 `static/js/tipping.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tippingSrc = readFileSync(resolve(__dirname, 'tipping.js'), 'utf8');

const markup = `<!doctype html><html><body>
    <div class="site-actions">
        <button id="tipping-trigger" type="button" aria-expanded="false" aria-haspopup="dialog">coffee</button>
    </div>
    <dialog id="tipping-dialog" aria-label="赞赏">
        <div class="tip-dialog__body">
            <button type="button" data-tipping-close aria-label="关闭赞赏">x</button>
            <details class="tip">
                <summary class="tip__trigger">赞赏</summary>
                <div class="tip__panel"><p>panel</p></div>
            </details>
        </div>
    </dialog>
</body></html>`;

function loadTipping(html = markup) {
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://scp.net.cn/' });
    dom.window.eval(tippingSrc);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    return dom;
}

test('initializes without the tipping controls', () => {
    assert.doesNotThrow(() => loadTipping('<!doctype html><html><body></body></html>'));
});

test('trigger opens the dialog, expands the panel, and syncs aria-expanded', () => {
    const dom = loadTipping();
    const { document } = dom.window;
    const trigger = document.getElementById('tipping-trigger');
    const dialog = document.getElementById('tipping-dialog');

    trigger.click();

    assert.equal(dialog.hasAttribute('open'), true, 'dialog must open');
    assert.equal(dialog.querySelector('details').open, true, 'panel must expand');
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');

    trigger.click();

    assert.equal(dialog.hasAttribute('open'), false, 'second click must close');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

test('backdrop click and close button dismiss the dialog', () => {
    const dom = loadTipping();
    const { document, MouseEvent } = dom.window;
    const trigger = document.getElementById('tipping-trigger');
    const dialog = document.getElementById('tipping-dialog');

    trigger.click();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.equal(dialog.hasAttribute('open'), false, 'backdrop click must close');

    trigger.click();
    dialog.querySelector('[data-tipping-close]').click();
    assert.equal(dialog.hasAttribute('open'), false, 'close button must close');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});
```

Run（`boring/`）:
```bash
node --test static/js/tipping.test.mjs 2>&1 | tail -5
```
Expected: FAIL —— `ENOENT ... tipping.js`（文件还不存在，符合 TDD）。

- [ ] **Step 2: 站点输出断言：限定既有断言 + 新增顶栏断言**

把 `article pages end with the tipping panel after related posts` 里三处选择器改成限定在文章列内：

```js
    const article = document.querySelector('article.article-main');
    const tip = article.querySelector('details.tip');
    const related = article.querySelector('.related-section');
```

把 `tipping panel exposes both payment channels with accessible QR images` 改成：

```js
    const article = document.querySelector('article.article-main');
    const trigger = article.querySelector('details.tip > summary.tip__trigger');
    const images = [...article.querySelectorAll('details.tip img.tip__qr')];
```

（其余断言不变。）

在文件末尾追加：

```js
test('every page exposes the header coffee trigger and the tipping dialog', async () => {
    for (const path of ['index.html', 'blog/index.html']) {
        const { document } = (await loadOutput(path)).window;
        const trigger = document.querySelector('.site-actions #tipping-trigger');
        const dialog = document.querySelector('dialog#tipping-dialog');

        assert.ok(trigger, `${path}: header tipping trigger must exist`);
        assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
        assert.ok(dialog, `${path}: tipping dialog must exist`);
        assert.equal(trigger.getAttribute('aria-label'), '赞赏');
        assert.equal(dialog.querySelectorAll('img.tip__qr').length, 2);
    }
});

test('article pages carry both the inline panel and the dialog copy', async () => {
    const { dom } = await findFirstHomepageArticle();
    const document = dom.window.document;

    assert.equal(document.querySelectorAll('details.tip').length, 2, 'inline panel + dialog');
    assert.equal(document.querySelectorAll('article.article-main details.tip').length, 1);
    assert.equal(document.querySelectorAll('dialog#tipping-dialog details.tip').length, 1);
});

test('tipping script ships with the site', async () => {
    const html = await readOutput('index.html');

    assert.match(html, /\/js\/tipping\.js/);
});
```

Run（`boring/`）:
```bash
node --test tests/site-output.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)'
```
Expected: FAIL —— 新增 3 条与既有断言（限定后仍应通过的部分除外）里，至少 `every page exposes…`、`article pages carry both…`、`tipping script ships…` 三条失败。

- [ ] **Step 3: 提交测试**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/static/js/tipping.test.mjs boring/tests/site-output.test.mjs
git commit -m "test(tipping): 顶栏咖啡入口与弹窗的测试先行"
```

---

### Task 10: 实现（base.html + tipping.js + 样式）

**Files:**
- Modify: `boring/templates/base.html`（body 开头守卫、site-actions 按钮、body 末尾 dialog、head 引入脚本）
- Create: `boring/static/js/tipping.js`
- Modify: `boring/css/style.css`（`.tip-dialog` 系列）

- [ ] **Step 1: `base.html` 加守卫 + 顶栏按钮 + dialog + 脚本**

`<body class="site-body">` 之后插入：

```tera
{% set tip_on = false %}
{% if config.extra.tipping is defined and config.extra.tipping.enabled %}
    {% set tip_channels = config.extra.tipping.channels | default(value=[]) %}
    {% set tip_page_on = page is not defined or (page.extra.tipping | default(value=true)) %}
    {% set tip_on = tip_channels | length > 0 and tip_page_on %}
{% endif %}
```

`.site-actions` 中，RSS 链接之前插入：

```tera
                    {% if tip_on %}
                        <button id="tipping-trigger"
                                type="button"
                                class="site-action"
                                aria-label="赞赏"
                                title="赞赏"
                                aria-haspopup="dialog"
                                aria-expanded="false">
                            <i class="las la-coffee" aria-hidden="true"></i>
                        </button>
                    {% endif %}
```

`{% block body_extra %}{% endblock %}` 之前插入：

```tera
        {% if tip_on %}
            <dialog id="tipping-dialog" class="tip-dialog" aria-label="赞赏">
                <div class="tip-dialog__body">
                    <button type="button" class="tip-dialog__close" data-tipping-close aria-label="关闭赞赏">
                        <span aria-hidden="true">✕</span>
                    </button>
                    {{<tipping tip={config.extra.tipping}/>}}
                </div>
            </dialog>
        {% endif %}
```

`<head>` 中 `main.js` 之后插入：

```tera
        {% if config.extra.tipping is defined and config.extra.tipping.enabled %}
            <script src="{{ get_url(path='js/tipping.js', cachebust=true) | safe }}" defer></script>
        {% endif %}
```

- [ ] **Step 2: 新建 `static/js/tipping.js`**

```js
(function () {
    'use strict';

    function init() {
        var trigger = document.getElementById('tipping-trigger');
        var dialog = document.getElementById('tipping-dialog');

        if (!trigger || !dialog) {
            return;
        }

        var panel = dialog.querySelector('details');

        function isOpen() {
            return dialog.open === true || dialog.hasAttribute('open');
        }

        function setOpen(open) {
            if (open) {
                if (panel) {
                    panel.open = true;
                }
                if (typeof dialog.showModal === 'function') {
                    dialog.showModal();
                } else {
                    dialog.setAttribute('open', '');
                }
            } else {
                if (typeof dialog.close === 'function') {
                    dialog.close();
                } else {
                    dialog.removeAttribute('open');
                }
            }
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        trigger.addEventListener('click', function () {
            setOpen(!isOpen());
        });

        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                setOpen(false);
            }
        });

        var closer = dialog.querySelector('[data-tipping-close]');
        if (closer) {
            closer.addEventListener('click', function () {
                setOpen(false);
            });
        }

        dialog.addEventListener('close', function () {
            trigger.setAttribute('aria-expanded', 'false');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
```

- [ ] **Step 3: `css/style.css` 加弹窗样式**

在 tipping 区块的 `@media print { .tip { display: none; } }` 之后追加：

```css
.tip-dialog {
  width: calc(100% - 2 * var(--gutter));
  max-width: 34rem;
  padding: var(--space-lg);
  border: var(--rule-hair) solid var(--color-rule);
  border-radius: var(--radius-card);
  background: var(--color-paper-3);
  color: var(--color-ink);
  box-shadow: var(--shadow-raised);
}

.tip-dialog::backdrop {
  background: color-mix(in oklab, var(--color-ink) 55%, transparent);
}

.tip-dialog__body {
  position: relative;
  padding-top: var(--space-md);
}

.tip-dialog__close {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: var(--rule-hair) solid transparent;
  border-radius: var(--radius-card);
  background: none;
  color: var(--color-muted);
  font-size: var(--text-md);
  cursor: pointer;
}

.tip-dialog__close:hover {
  border-color: var(--color-rule);
  color: var(--color-ink);
}

.tip-dialog__close:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.tip-dialog .tip {
  margin: 0;
  padding: 0;
  border: 0;
}

.tip-dialog .tip__trigger {
  display: none;
}

.tip-dialog .tip__panel {
  margin: 0 auto;
}
```

- [ ] **Step 4: 重建并跑全部测试**

Run（`boring/`）:
```bash
node scripts/build-related-index.mjs && node scripts/build-home-index.mjs && node_modules/.bin/postcss css/style.css -o static/css/style.css
zola build -o roc-blog --force >/dev/null
node --test static/js/tipping.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)'
node --test tests/site-output.test.mjs 2>&1 | grep -E '^not ok|^# (pass|fail)'
```
Expected: 两个测试套件全过（`# fail 0`）。

- [ ] **Step 5: 提交**

```bash
cd /Users/shichaopeng/Work/self-dir/roc-blog
git add boring/templates/base.html boring/static/js/tipping.js boring/css/style.css boring/static/css/style.css boring/static/related-index.json boring/static/home-index.json
git commit -m "feat(tipping): 顶栏咖啡入口与全站赞赏弹窗"
```

### 增量 v2 完成标准

1. 任意页面顶栏有咖啡图标，点击弹窗打开，Esc/✕/遮罩关闭
2. 文章页页尾面板行为不变（两份 markup 共存）
3. `enabled=false` 与逐篇 `extra.tipping: false` 时，图标与弹窗都不渲染
4. `static/js/tipping.test.mjs`、`tests/site-output.test.mjs`、`scripts/lib/font-assets.test.mjs` 全绿

